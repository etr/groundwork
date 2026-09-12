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
 * Release unlinks the file only after re-reading it and confirming our own
 * holder id is still the recorded one — a release can never unlink a lock a
 * successor legitimately re-acquired after reaping a stale us.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { processStartIdentity, processIdentityMatches } = require('./process-identity');

const LOCK_STALE_MS = 5 * 60 * 1000;

function readLockHolder(lockFile) {
  const stat = fs.lstatSync(lockFile);
  if (!stat.isFile() || stat.isSymbolicLink()) return { present: true, holder: null };
  try {
    return { present: true, holder: JSON.parse(fs.readFileSync(lockFile, 'utf8')) };
  } catch {
    return { present: true, holder: null };
  }
}

/**
 * Acquire an owned lock.
 *
 * @param {string} lockFile - Absolute lockfile path
 * @param {object} [options]
 * @param {number} [options.staleMs=300000] - Age at which an unverifiable
 *   lock is considered abandoned
 * @returns {{holder: object, release: Function}} Lock handle; release()
 *   unlinks only while the lockfile still records this holder's id
 * @throws {Error} When the lock is held by a live or unprovably-stale holder
 */
function acquireOwnedLock(lockFile, options = {}) {
  const staleMs = options.staleMs || LOCK_STALE_MS;
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
      if (error.code !== 'EEXIST') throw error;
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

    // Held: reap only a provably stale holder.
    let present;
    let lockHolder = null;
    try {
      ({ present, holder: lockHolder } = readLockHolder(lockFile));
    } catch (error) {
      if (error.code === 'ENOENT') continue; // Released between EEXIST and read.
      throw error;
    }
    if (!present) continue;
    const holderDead = lockHolder
      && lockHolder.host === os.hostname()
      && Number.isInteger(lockHolder.pid)
      && typeof lockHolder.processStart === 'string'
      && !processIdentityMatches(lockHolder.pid, lockHolder.processStart);
    const recordedAt = lockHolder && typeof lockHolder.acquiredAt === 'string'
      ? Date.parse(lockHolder.acquiredAt)
      : NaN;
    let ageMs = Number.isFinite(recordedAt) ? Date.now() - recordedAt : null;
    if (ageMs === null) {
      try {
        ageMs = Date.now() - fs.lstatSync(lockFile).mtimeMs;
      } catch {
        ageMs = null;
      }
    }
    const agedOut = ageMs !== null && ageMs > staleMs;
    if (!holderDead && !agedOut) {
      throw new Error(
        `another process holds ${pathBasename(lockFile)}` +
          (lockHolder && Number.isInteger(lockHolder.pid) ? ` (pid ${lockHolder.pid})` : '') +
          '; retry in a moment or remove a stale lock manually if the holder crashed'
      );
    }
    try {
      fs.unlinkSync(lockFile);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`could not acquire the lock ${pathBasename(lockFile)}`);
}

function pathBasename(file) {
  return path.basename(file);
}

/**
 * Identity-checked release: unlink only when the lockfile still records this
 * holder id. Never throws for an already-absent file.
 */
function releaseOwnedLock(lockFile, holderId) {
  try {
    const { present, holder } = readLockHolder(lockFile);
    if (!present) return false;
    if (!holder || holder.id !== holderId) return false;
    fs.unlinkSync(lockFile);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

module.exports = { acquireOwnedLock, releaseOwnedLock, LOCK_STALE_MS };
