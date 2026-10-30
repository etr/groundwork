'use strict';

/**
 * Shared mutation protocol for fixed mutable state (lib/owned-lock.js lock
 * transitions, validation pointer writes, runner lease publication).
 *
 * Every transition that reads, verifies, and then unlinks/creates a file at a
 * stable path runs inside a serialized mutation turn: a ticket queue in a
 * dedicated directory BESIDE the target (never at the target path itself, and
 * never recursively through owned-lock). Cooperating processes therefore
 * cannot interleave in the compare-to-unlink window — a successor that
 * legitimately re-acquired a slot can never be deleted by a slow reaper or
 * releaser, and two racers can never both believe they own the lock.
 *
 * Queue records carry (pid, processStart, token, ticket); a waiter reaps a
 * predecessor ticket only when its holder process is provably dead, so a
 * crashed mutator never wedges the queue.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { processStartIdentity } = require('./process-identity');

const MUTATION_DIRNAME = '.lease-mutation';
const STAGING_RECLAIM_MS = 5 * 60 * 1000;

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function isContained(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function createContainedDirectory(parent, child, label) {
  const parentStat = fs.lstatSync(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new Error(`${label} parent is not a real directory: ${parent}`);
  }
  const relative = path.relative(parent, child);
  if (!isContained(parent, child)) throw new Error(`${label} is outside ${parent}`);
  let current = parent;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`${label} contains a non-directory or symlink: ${current}`);
      }
    } else {
      try {
        fs.mkdirSync(current, { mode: 0o700 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          throw new Error(`${label} contains a non-directory or symlink: ${current}`);
        }
      }
    }
  }
}

function fsyncDirectory(directory, dependencies = {}, finalPath = null) {
  let fd;
  try {
    if (dependencies.beforeLeaseDirectorySync) {
      dependencies.beforeLeaseDirectorySync(finalPath, directory);
    }
    fd = fs.openSync(directory, fs.constants.O_RDONLY);
    fs.fsyncSync(fd);
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EISDIR'].includes(error.code)) throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function publishRecordAtomically(finalPath, record, dependencies = {}, notify = false) {
  const stagingPath = path.join(
    path.dirname(finalPath),
    `.staging-${record.token}-${crypto.randomBytes(8).toString('hex')}.tmp`
  );
  let fd;
  let published = false;
  try {
    fd = fs.openSync(stagingPath, 'wx', 0o600);
    if (notify && dependencies.afterLeaseStagingCreate) {
      dependencies.afterLeaseStagingCreate(finalPath, stagingPath, fd);
    }
    fs.writeFileSync(fd, `${JSON.stringify(record)}\n`, 'utf8');
    if (notify && dependencies.afterLeaseStagingWrite) {
      dependencies.afterLeaseStagingWrite(finalPath, stagingPath, fd);
    }
    fs.fsyncSync(fd);
    if (notify && dependencies.afterLeaseStagingSync) {
      dependencies.afterLeaseStagingSync(finalPath, stagingPath, fd);
    }
    fs.closeSync(fd);
    fd = undefined;
    if (notify && dependencies.beforeLeasePublish) {
      dependencies.beforeLeasePublish(finalPath, stagingPath);
    }
    fs.linkSync(stagingPath, finalPath);
    published = true;
    fsyncDirectory(path.dirname(finalPath), dependencies, finalPath);
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
    if (published) {
      try { fs.unlinkSync(finalPath); } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') throw cleanupError;
      }
    }
    try { fs.unlinkSync(stagingPath); } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') throw cleanupError;
    }
    throw error;
  }
  try {
    fs.unlinkSync(stagingPath);
    fsyncDirectory(path.dirname(finalPath), dependencies, finalPath);
  } catch (error) {
    // The final hard link is durable and owned by the caller. Do not turn a
    // recoverable staging cleanup failure into an acquisition without a
    // release handle.
    if (error.code !== 'ENOENT' && dependencies.onLeaseStagingCleanupError) {
      try { dependencies.onLeaseStagingCleanupError(finalPath, stagingPath, error); } catch {}
    }
  }
  return record;
}

function inspectMutationEntry(entryPath) {
  let fd;
  let entry;
  try {
    fd = fs.openSync(entryPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 4_096) {
      throw new Error(`Repository lease mutation entry is unsafe: ${entryPath}`);
    }
    entry = JSON.parse(fs.readFileSync(fd, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error.code === 'ELOOP') {
      throw new Error(`Repository lease mutation entry is unsafe: ${entryPath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Repository lease mutation entry is invalid: ${entryPath}`);
    }
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  const expectedToken = path.basename(entryPath, '.lock');
  if (!entry || entry.version !== 1 || !Number.isInteger(entry.pid) || entry.pid < 1
      || entry.token !== expectedToken || !/^[0-9a-f]{48}$/.test(entry.token)
      || !Number.isInteger(entry.ticket) || entry.ticket < 0
      || typeof entry.processStart !== 'string' || !entry.processStart
      || entry.processStart.length > 256) {
    throw new Error(`Repository lease mutation entry has invalid ownership: ${entryPath}`);
  }
  return entry;
}

// Queue staging records are queue entries in transit. Reclamation is the one
// shared implementation (below); only the liveness strategy is injected —
// this default follows the recorded (pid, processStart) pair and returns null
// when the record cannot be judged by its shape, deferring to the age
// fallback.
function stagingRecordIsDeadByRecord(file, token, dependencies) {
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (record && record.token === token && Number.isInteger(record.pid) && record.pid >= 1
      && typeof record.processStart === 'string' && record.processStart) {
    return processStartIdentity(record.pid, dependencies) !== record.processStart;
  }
  return null;
}

// Reclaim stale staging records: decide staleness via the injected strategy
// (null defers to the age fallback), then unlink only the exact inode/size/
// mtime observed before the decision — a record replaced between the two
// stats is a live writer's, never reaped. The staging filename grammar and
// this compare-before-unlink protocol live HERE and nowhere else.
function reclaimStaleStagingEntries(directory, dependencies = {}, isRecordDead = stagingRecordIsDeadByRecord) {
  const reclaimAfter = dependencies.stagingReclaimMs === undefined
    ? STAGING_RECLAIM_MS
    : dependencies.stagingReclaimMs;
  const now = dependencies.now || Date.now;
  for (const name of fs.readdirSync(directory)) {
    const match = /^\.staging-([0-9a-f]{48})-[0-9a-f]{16}\.tmp$/.exec(name);
    if (!match) continue;
    const file = path.join(directory, name);
    let initial;
    try {
      initial = fs.lstatSync(file);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (initial.isSymbolicLink() || !initial.isFile()) {
      throw new Error(`Repository lease staging record is unsafe: ${file}`);
    }
    let stale;
    try {
      stale = isRecordDead(file, match[1], dependencies);
    } catch {
      stale = null;
    }
    if (stale === null) stale = now() - initial.mtimeMs >= reclaimAfter;
    if (!stale) continue;
    try {
      const current = fs.lstatSync(file);
      if (current.isSymbolicLink() || !current.isFile()
          || current.ino !== initial.ino || current.size !== initial.size
          || current.mtimeMs !== initial.mtimeMs) continue;
      fs.unlinkSync(file);
      fsyncDirectory(directory, dependencies, file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function mutationEntries(directory) {
  const entries = [];
  for (const name of fs.readdirSync(directory)) {
    if (name.startsWith('.staging-')) continue;
    if (!/^[0-9a-f]{48}\.lock$/.test(name)) {
      throw new Error(`Repository lease mutation filename is invalid: ${path.join(directory, name)}`);
    }
    const file = path.join(directory, name);
    const entry = inspectMutationEntry(file);
    if (entry) entries.push({ file, ...entry });
  }
  return entries;
}

// One bounded pause between mutation-queue retries. The fallback chain
// (mutationWait, then wait, then sleepSync) and this single implementation
// are shared by every queue consumer, including the runner.
function waitForLeaseMutation(dependencies = {}, milliseconds = 10) {
  const wait = dependencies.mutationWait || dependencies.wait || sleepSync;
  wait(milliseconds);
}

function waitForMutationEntry(entryPath, localProcessStart, dependencies = {}) {
  let retryDelay = 10;
  for (;;) {
    const current = inspectMutationEntry(entryPath);
    if (!current) return;
    const localOwner = current.pid === process.pid && current.processStart === localProcessStart;
    const live = localOwner || processStartIdentity(current.pid, dependencies) === current.processStart;
    if (!live) {
      try { fs.unlinkSync(entryPath); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      return;
    }
    waitForLeaseMutation(dependencies, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 250);
  }
}

/**
 * Acquire the mutation turn for a queue rooted at `mutationRoot`: publishes a
 * choosing record, takes the next ticket, waits for every lower ticket (and
 * choosing peer), and returns a release callback that removes the ticket.
 *
 * @param {string} mutationRoot - Directory holding the queue subdirectories
 * @param {object} [dependencies] - Test injection seam (now, mutationWait,
 *   processStartIdentity, stagingReclaimMs)
 * @returns {Function} Release callback
 */
function acquireLeaseMutation(mutationRoot, dependencies = {}) {
  const mutationDirectory = path.join(mutationRoot, MUTATION_DIRNAME);
  const choosingDirectory = path.join(mutationDirectory, 'choosing');
  const ticketsDirectory = path.join(mutationDirectory, 'tickets');
  createContainedDirectory(path.dirname(mutationRoot), choosingDirectory, 'Repository lease mutation directory');
  createContainedDirectory(path.dirname(mutationRoot), ticketsDirectory, 'Repository lease mutation directory');
  const token = crypto.randomBytes(24).toString('hex');
  const processStart = processStartIdentity(process.pid, dependencies);
  if (!processStart) throw new Error('Cannot identify the runner process instance');
  const baseRecord = {
    version: 1,
    pid: process.pid,
    processStart,
    token,
    startedAt: (dependencies.now || Date.now)(),
  };
  const choosingPath = path.join(choosingDirectory, `${token}.lock`);
  const ticketPath = path.join(ticketsDirectory, `${token}.lock`);
  let ticketPublished = false;
  try {
    publishRecordAtomically(choosingPath, { ...baseRecord, ticket: 0 }, dependencies);
    reclaimStaleStagingEntries(choosingDirectory, dependencies);
    reclaimStaleStagingEntries(ticketsDirectory, dependencies);
    const currentTickets = mutationEntries(ticketsDirectory);
    const ticket = currentTickets.reduce((maximum, entry) => Math.max(maximum, entry.ticket), 0) + 1;
    publishRecordAtomically(ticketPath, { ...baseRecord, ticket }, dependencies);
    ticketPublished = true;
    fs.unlinkSync(choosingPath);

    const choosing = mutationEntries(choosingDirectory)
      .filter((entry) => entry.token !== token);
    for (const contender of choosing) {
      waitForMutationEntry(contender.file, processStart, dependencies);
    }

    const predecessors = mutationEntries(ticketsDirectory)
      .filter((entry) => entry.token !== token
        && (entry.ticket < ticket || (entry.ticket === ticket && entry.token < token)))
      .sort((left, right) => right.ticket - left.ticket || right.token.localeCompare(left.token));
    for (const predecessor of predecessors) {
      waitForMutationEntry(predecessor.file, processStart, dependencies);
    }
    return () => {
      try {
        fs.unlinkSync(ticketPath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    };
  } catch (error) {
    let cleanupError = null;
    try { fs.unlinkSync(choosingPath); } catch (currentError) {
      if (currentError.code !== 'ENOENT') cleanupError = currentError;
    }
    if (ticketPublished) {
      try { fs.unlinkSync(ticketPath); } catch (currentError) {
        if (currentError.code !== 'ENOENT' && !cleanupError) cleanupError = currentError;
      }
    }
    if (cleanupError) throw cleanupError;
    throw error;
  }
}

function mutationRootFor(targetPath) {
  return path.dirname(targetPath);
}

/**
 * Run one serialized mutation turn against a fixed-path target: acquire the
 * ticket queue beside the target, re-read current state inside the turn, run
 * `fn`, and always release the turn. The queue never uses the target path and
 * never recursively takes an owned lock.
 *
 * @param {string} targetPath - Absolute path of the fixed mutable target
 * @param {object} [dependencies] - Test injection seam
 * @param {Function} fn - Critical section; receives no arguments
 */
function withMutationTurn(targetPath, dependencies, fn) {
  const release = acquireLeaseMutation(mutationRootFor(targetPath), dependencies);
  try {
    return fn();
  } finally {
    release();
  }
}

module.exports = {
  MUTATION_DIRNAME,
  acquireLeaseMutation,
  createContainedDirectory,
  fsyncDirectory,
  mutationRootFor,
  publishRecordAtomically,
  reclaimStaleStagingEntries,
  waitForLeaseMutation,
  withMutationTurn,
};
