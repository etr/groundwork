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
 * Sources, in order: /proc/<pid>/stat field 22 (starttime, Linux), then
 * `ps -o lstart=` (BSD/macOS and procps), then a kill(0) probe so a live but
 * uninspectable process still yields a stable fallback identity.
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

/**
 * Stable process-start identity for a pid, or null when the pid is provably
 * not running.
 *
 * @param {number} pid - Process id
 * @param {object} [dependencies] - Test injection seam
 * @param {Function} [dependencies.processStartIdentity] - Overrides the probe
 * @returns {string|null} Identity string, or null for a dead pid
 */
function processStartIdentity(pid, dependencies = {}) {
  if (dependencies.processStartIdentity) return dependencies.processStartIdentity(pid);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (processIsZombie(pid)) return null;
  try {
    const fields = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').trim().split(/\s+/);
    if (fields.length > 21 && /^\d+$/.test(fields[21])) return `proc:${fields[21]}`;
  } catch (error) {
    if (!['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error;
  }
  try {
    const value = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return value || null;
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
