'use strict';

/**
 * Token-bearing O_EXCL lock with identity-checked release and safe stale
 * recovery.
 *
 * The holder writes { id, pid, host, processStart, acquiredAt } into the
 * lockfile it just created with O_EXCL. A contender that finds the file held
 * reaps it only when the holder is provably gone (process-start identity
 * mismatch on this host, or the lock aged past the staleness window); an
 * unreadable young lock is treated as held because the holder may be mid-write.
 *
 * Every fixed-lock transition — acquire, stale reap, release — runs inside a
 * shared mutation protocol turn (lib/lease-mutation.js): the re-read/verify/
 * unlink critical section can never interleave with another library process,
 * so a release can never unlink a lock a successor legitimately re-acquired,
 * and two reapers can never both win the same slot. The inode-verified unlink
 * stays as a second belt: even a non-cooperating swap that recycles the inode
 * is compared against the stat observed inside the turn.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { processStartIdentity, processIdentityMatches } = require('./process-identity');
const { withMutationTurn } = require('./lease-mutation');

const LOCK_STALE_MS = 5 * 60 * 1000;

// Typed failure codes of the shared mutation protocol surface.
const LOCK_ERROR_CODES = [
  'contention',
  'malformed-owner',
  'ownership-loss',
  'unreadable-path',
  'foreign-host-unsupported',
];

class LockError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LockError';
    this.code = code;
  }
}

function pathBasename(file) {
  return path.basename(file);
}

function unreadablePathError(lockFile, cause) {
  return new LockError(
    'unreadable-path',
    `cannot inspect the lock ${pathBasename(lockFile)} at ${lockFile}: ${cause.message}`
  );
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readLockHolder(lockFile) {
  const stat = fs.lstatSync(lockFile);
  if (!stat.isFile() || stat.isSymbolicLink()) return { present: true, holder: null, stat };
  let raw;
  try {
    raw = fs.readFileSync(lockFile, 'utf8');
  } catch (error) {
    if (error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'EISDIR') {
      throw unreadablePathError(lockFile, error);
    }
    throw error;
  }
  try {
    const holder = JSON.parse(raw);
    if (!isPlainObject(holder)) {
      throw new LockError(
        'malformed-owner',
        `the lock ${pathBasename(lockFile)} records a malformed owner (valid JSON, not a lock record)` +
          `; repair or remove ${lockFile} manually`
      );
    }
    return { present: true, holder, stat };
  } catch (error) {
    if (error instanceof LockError) throw error;
    // Unparseable content: a live holder may be mid-write — the caller's
    // staleness window decides whether this is held or reapable.
    return { present: true, holder: null, stat };
  }
}

/**
 * Identity-verified unlink inside the caller's mutation turn: remove the
 * lockfile only when the path still resolves to the exact inode that was
 * inspected (dev/ino). Private on purpose — an unguarded exported unlink is
 * exactly the seam the serialized protocol exists to remove. Returns true
 * when the file was unlinked.
 */
function unlinkIfSameInode(lockFile, observedStat, hooks = {}) {
  if (hooks.beforeUnlink) hooks.beforeUnlink();
  let current;
  try {
    current = fs.lstatSync(lockFile);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  if (current.dev !== observedStat.dev || current.ino !== observedStat.ino) return false;
  try {
    fs.unlinkSync(lockFile);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return true;
}

// A same-host holder without a processStart (older record shapes) is probed
// with kill(0): ESRCH is dead, EPERM or success is alive. Foreign hosts can
// never be probed — never reap a young foreign-host lock on liveness grounds.
function holderProvablyDead(lockHolder, kill) {
  if (!lockHolder || lockHolder.host !== os.hostname() || !Number.isInteger(lockHolder.pid)) {
    return false;
  }
  if (typeof lockHolder.processStart === 'string' && lockHolder.processStart) {
    return !processIdentityMatches(lockHolder.pid, lockHolder.processStart);
  }
  try {
    kill(lockHolder.pid, 0);
    return false;
  } catch (error) {
    return error.code === 'ESRCH';
  }
}

function holderAgeMs(lockHolder, lockFile) {
  const recordedAt = lockHolder && typeof lockHolder.acquiredAt === 'string'
    ? Date.parse(lockHolder.acquiredAt)
    : NaN;
  if (Number.isFinite(recordedAt)) return Date.now() - recordedAt;
  try {
    return Date.now() - fs.lstatSync(lockFile).mtimeMs;
  } catch {
    return null;
  }
}

function busyError(lockFile, lockHolder, options) {
  if (options && typeof options.busyMessage === 'function') {
    return new LockError('contention', options.busyMessage(lockHolder));
  }
  const pidSuffix = lockHolder && Number.isInteger(lockHolder.pid)
    ? ` (pid ${lockHolder.pid}${lockHolder.host ? ` on ${lockHolder.host}` : ''})`
    : '';
  if (lockHolder && typeof lockHolder.host === 'string' && lockHolder.host && lockHolder.host !== os.hostname()) {
    return new LockError(
      'foreign-host-unsupported',
      `another process holds ${pathBasename(lockFile)}${pidSuffix} on host ${lockHolder.host};` +
        ' a foreign-host lock cannot be probed or reaped from this host — never-reap applies' +
        ' (single-host/local-filesystem scope); remove it manually if you know it is abandoned'
    );
  }
  return new LockError(
    'contention',
    `another process holds ${pathBasename(lockFile)}${pidSuffix}` +
      '; retry in a moment or remove a stale lock manually if the holder crashed'
  );
}

/**
 * Acquire an owned lock. The whole attempt (create, or verify-and-reap a
 * provably stale holder) runs inside one shared mutation turn.
 *
 * @param {string} lockFile - Absolute lockfile path
 * @param {object} [options]
 * @param {number} [options.staleMs=300000] - Age at which an unverifiable
 *   lock is considered abandoned
 * @param {Function} [options.busyMessage] - Custom contention message factory
 *   (holder or null) — used by callers that delegate their lock to this
 *   module and need their own actionable refusal text
 * @param {Function} [options.kill] - Liveness probe for holders without a
 *   processStart record; defaults to process.kill
 * @param {object} [hooks] - Test seams; beforeUnlink fires inside the reap
 *   critical section, inside the mutation turn
 * @returns {{holder: object, release: Function}} Lock handle; release()
 *   unlinks only while the lockfile still records this holder's id
 * @throws {LockError} With a typed code from LOCK_ERROR_CODES
 */
function acquireOwnedLock(lockFile, options = {}, hooks = {}) {
  return withMutationTurn(lockFile, {}, () => acquireOwnedLockTurn(lockFile, options, hooks));
}

function acquireOwnedLockTurn(lockFile, options, hooks) {
  const staleMs = options.staleMs || LOCK_STALE_MS;
  const kill = options.kill || process.kill;
  for (let attempt = 0; attempt < 2; attempt++) {
    const holder = {
      id: crypto.randomBytes(12).toString('hex'),
      pid: process.pid,
      host: os.hostname(),
      processStart: processStartIdentity(process.pid),
      acquiredAt: new Date().toISOString(),
    };
    let descriptor;
    try {
      descriptor = fs.openSync(lockFile, 'wx', 0o600);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        if (error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'ENOTDIR' || error.code === 'EISDIR') {
          throw unreadablePathError(lockFile, error);
        }
        throw error;
      }
    }
    if (descriptor !== undefined) {
      try {
        fs.writeFileSync(descriptor, `${JSON.stringify(holder)}\n`, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      return {
        holder,
        release: () => releaseOwnedLock(lockFile, holder.id),
      };
    }

    // Held: reap only a provably stale holder, all inside this turn.
    let present;
    let lockHolder = null;
    let observedStat = null;
    try {
      ({ present, holder: lockHolder, stat: observedStat } = readLockHolder(lockFile));
    } catch (error) {
      if (error instanceof LockError || error instanceof SyntaxError) throw error;
      if (error.code === 'ENOENT') continue; // Released between EEXIST and read.
      if (error.code === 'EACCES' || error.code === 'EPERM') throw unreadablePathError(lockFile, error);
      throw error;
    }
    if (!present) continue;
    const holderDead = holderProvablyDead(lockHolder, kill);
    const ageMs = holderAgeMs(lockHolder, lockFile);
    const agedOut = ageMs !== null && ageMs > staleMs;
    if (!holderDead && !agedOut) {
      throw busyError(lockFile, lockHolder, options);
    }
    // Unlink only the exact inode that was inspected inside this turn: a
    // successor that re-acquired the slot between the read and the unlink is
    // never reaped.
    const unlinked = unlinkIfSameInode(lockFile, observedStat, hooks);
    if (!unlinked) continue; // Replaced under us — re-evaluate the new holder.
  }
  throw new LockError('contention', `could not acquire the lock ${pathBasename(lockFile)}`);
}

/**
 * Identity-checked release inside a mutation turn: unlink only when the
 * lockfile still records this holder id AND the path still resolves to the
 * inode that was read. Never throws for an already-absent file. Returns true
 * when the file was unlinked; false means the ownership was lost (a successor
 * holds the slot) and nothing was mutated.
 */
function releaseOwnedLock(lockFile, holderId, hooks = {}) {
  return withMutationTurn(lockFile, {}, () => releaseOwnedLockTurn(lockFile, holderId, hooks));
}

function releaseOwnedLockTurn(lockFile, holderId, hooks) {
  try {
    const { present, holder, stat } = readLockHolder(lockFile);
    if (!present) return false;
    if (!holder || holder.id !== holderId) return false;
    return unlinkIfSameInode(lockFile, stat, hooks);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    if (error instanceof LockError) throw error;
    if (error.code === 'EACCES' || error.code === 'EPERM') throw unreadablePathError(lockFile, error);
    throw error;
  }
}

module.exports = { acquireOwnedLock, releaseOwnedLock, LockError, LOCK_ERROR_CODES, LOCK_STALE_MS };
