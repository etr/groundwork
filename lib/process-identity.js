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

// Executable names that never carry session identity: the transient shells
// and one-shot wrappers a worker is spawned through. Walking past them finds
// the first ancestor whose lifetime IS the owning session's lifetime (the
// harness process for an interactive session, the runner in runner mode).
const SHELL_OR_WRAPPER_NAMES = new Set([
  'sh', 'bash', 'zsh', 'dash', 'ksh', 'mksh', 'fish', 'csh', 'tcsh',
  'env', 'nice', 'nohup', 'stdbuf', 'setsid', 'timeout', 'watch', 'xargs',
  'launchd', 'launchctl', 'init',
]);

/**
 * Parent pid and executable name for one process. /proc/<pid>/stat on Linux
 * (comm in parens may contain spaces, so parse from the last ')'); one
 * `ps -o ppid=,comm=` subprocess on BSD/macOS. Returns null when the process
 * cannot be inspected — the caller then stops walking rather than guessing.
 *
 * @param {number} pid - Process id
 * @returns {{ppid: number, name: string}|null}
 */
function ancestorSnapshot(pid) {
  let statText = null;
  try {
    statText = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  } catch (error) {
    if (!['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error;
  }
  if (statText !== null) {
    const close = statText.lastIndexOf(')');
    if (close === -1) return null;
    const fields = statText.slice(close + 2).trim().split(/\s+/);
    const ppid = Number.parseInt(fields[1], 10);
    if (!Number.isInteger(ppid) || ppid < 0) return null;
    const name = statText.slice(statText.indexOf('(') + 1, close);
    return { ppid, name };
  }
  try {
    const value = execFileSync('ps', ['-o', 'ppid=,comm=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!value) return null;
    const spaceAt = value.indexOf(' ');
    const ppid = Number.parseInt(spaceAt === -1 ? value : value.slice(0, spaceAt), 10);
    if (!Number.isInteger(ppid) || ppid <= 0) return null;
    const raw = spaceAt === -1 ? '' : value.slice(spaceAt + 1).trim();
    if (!raw) return null;
    // macOS `comm=` reports full paths (/bin/zsh); the name is the basename.
    const name = raw.split('/').pop();
    return { ppid, name };
  } catch {
    return null;
  }
}

/**
 * The nearest ancestor of `startPid` that is neither a shell/wrapper nor
 * init, as `{pid, processStart}` — the process whose death means the
 * spawning session is dead. The identity comes from `processStartIdentity`
 * itself, so `processIdentityMatches` can verify it later. Walks at most
 * `maxHops` levels and returns null conservatively whenever the chain
 * cannot be inspected (unwalkable, all shells up to init, or a non-shell
 * ancestor whose identity cannot be probed) — a null anchor never blocks
 * reaping, it just leaves liveness at its previous semantics.
 *
 * @param {number} startPid - First pid to examine (pass the worker's ppid;
 *   the worker itself is skipped by construction)
 * @param {number} [maxHops] - Maximum chain levels to walk (default 8)
 * @param {object} [dependencies] - Test injection seam
 * @param {Function} [dependencies.ancestorSnapshot] - Overrides the walk probe
 * @param {Function} [dependencies.processStartIdentity] - Overrides identity probes
 * @returns {{pid: number, processStart: string}|null}
 */
function firstNonShellAncestor(startPid, maxHops = 8, dependencies = {}) {
  const snapshot = dependencies.ancestorSnapshot || ancestorSnapshot;
  let pid = startPid;
  for (let hop = 0; hop < maxHops && Number.isInteger(pid) && pid > 1; hop++) {
    const current = snapshot(pid);
    if (!current) return null;
    const name = String(current.name || '').split('/').pop().toLowerCase();
    if (!SHELL_OR_WRAPPER_NAMES.has(name)) {
      const identity = processStartIdentity(pid, dependencies);
      return identity === null ? null : { pid, processStart: identity };
    }
    pid = current.ppid;
  }
  return null;
}

module.exports = {
  processStartIdentity,
  processAlive,
  processIdentityMatches,
  firstNonShellAncestor,
};
