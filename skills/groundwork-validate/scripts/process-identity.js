'use strict';

/**
 * Process-start identity and liveness probes shared by the runner, the
 * validation-session ownership model, and owned locks.
 *
 * A bare pid is not identity: pids are recycled, so a lock or lease recorded
 * yesterday may name a completely different process today. The process-start
 * identity pins (pid, when this exact process started), which makes a stale
 * holder provably dead even after its pid was reused by an unrelated process.
 *
 * Sources, in order: /proc/<pid>/stat fields 3 and 22 (state and starttime,
 * Linux — one read answers both liveness and identity), then one
 * `ps -o lstart=,stat=` subprocess (BSD/macOS, zombie state folded into the
 * same call), then a kill(0) probe so a live but uninspectable process still
 * yields a stable fallback identity.
 *
 * The process's OWN identity is immutable for its lifetime, so it is probed
 * once per process and memoized at module level; other processes' identities
 * are never cached. An injected dependencies.processStartIdentity bypasses
 * both the cache and the probes — the deterministic-test seam.
 */

const fs = require('fs');
const { execFileSync } = require('child_process');

/**
 * Whether a pid currently names a zombie (exited but not yet reaped). A
 * zombie cannot make progress, so every liveness view in this module treats
 * it as dead — kill(pid, 0) alone would keep reporting it alive.
 */
function processIsZombie(pid) {
  try {
    const stat = execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return stat.startsWith('Z');
  } catch {
    return false; // ps unavailable — other probes decide
  }
}

// Memoized identity of THIS process (undefined = not probed yet). The
// self-identity cannot change while the process lives, so lock turns, lease
// publications, and retry loops reuse one probe instead of re-spawning `ps`.
let memoizedSelfIdentity;

/**
 * Stable process-start identity for a pid, or null when the pid is provably
 * not running.
 *
 * @param {number} pid - Process id
 * @param {object} [dependencies] - Test injection seam
 * @param {Function} [dependencies.processStartIdentity] - Overrides the probe
 *   (and the self-identity memoization)
 * @returns {string|null} Identity string, or null for a dead pid
 */
function processStartIdentity(pid, dependencies = {}) {
  if (dependencies.processStartIdentity) return dependencies.processStartIdentity(pid);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (pid === process.pid && memoizedSelfIdentity !== undefined) return memoizedSelfIdentity;
  const identity = probeProcessStartIdentity(pid);
  if (pid === process.pid) memoizedSelfIdentity = identity;
  return identity;
}

/**
 * One liveness+identity probe for a pid. On Linux a single
 * /proc/<pid>/stat read yields both starttime (field 22) and state
 * (field 3 — a zombie reports 'Z' there, so no subprocess is needed at
 * all). Without /proc (macOS/BSD) one `ps -o lstart=,stat=` subprocess
 * reports the start time and the zombie state in the same call.
 */
function probeProcessStartIdentity(pid) {
  let statText = null;
  try {
    statText = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  } catch (error) {
    if (!['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error;
  }
  if (statText !== null) {
    const fields = statText.trim().split(/\s+/);
    if (fields.length > 21 && /^\d+$/.test(fields[21])) {
      // Field 3 is the process state in the same read: a zombie cannot make
      // progress and is dead to every liveness view.
      return /^Z/.test(fields[2] || '') ? null : `proc:${fields[21]}`;
    }
  }
  try {
    const value = execFileSync('ps', ['-o', 'lstart=,stat=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!value) return null;
    const statField = value.split(/\s+/).pop();
    if (statField.startsWith('Z')) return null;
    // Recover the exact `ps -o lstart=` spelling by dropping the stat token.
    const lstart = value.slice(0, value.length - statField.length).trim();
    return lstart || null;
  } catch {
    try {
      process.kill(pid, 0);
      return `pid:${pid}`;
    } catch (error) {
      if (error.code === 'EPERM') return `pid:${pid}`;
      if (error.code === 'ESRCH') return null;
      throw error;
    }
  }
}

/**
 * Whether a pid is currently running (kill probe 0; EPERM means alive but
 * owned by another user). Zombies count as dead: they cannot act.
 *
 * @param {number} pid - Process id
 * @returns {boolean}
 */
function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code === 'EPERM') return true;
    return false;
  }
  return !processIsZombie(pid);
}

/**
 * Whether the process that recorded `expectedStart` is still the exact same
 * live process. A mismatched identity means the original holder exited (and
 * the pid may have been recycled), so its claims are stale.
 *
 * @param {number} pid - Recorded process id
 * @param {string} expectedStart - Recorded process-start identity
 * @param {object} [dependencies] - Test injection seam
 * @returns {boolean} True when pid now runs the exact recorded process
 */
function processIdentityMatches(pid, expectedStart, dependencies = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (typeof expectedStart !== 'string' || expectedStart.length === 0) return false;
  const current = processStartIdentity(pid, dependencies);
  return current !== null && current === expectedStart;
}

module.exports = { processStartIdentity, processAlive, processIdentityMatches };
