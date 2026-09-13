#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { writeJsonSyncAtomic } = require('./atomic-write');
const { acquireOwnedLock, releaseOwnedLock } = require('./owned-lock');
const { processStartIdentity, processIdentityMatches } = require('./process-identity');

const SESSION_SCHEMA_VERSION = 2;
const LEGACY_SESSION_SCHEMA_VERSION = 1;
const READABLE_SCHEMA_VERSIONS = new Set([SESSION_SCHEMA_VERSION, LEGACY_SESSION_SCHEMA_VERSION]);
const TASK_ID = /^(?:TASK-[0-9]+|manual-validation)$/;
const OWNER_TOKEN_PATTERN = /^[0-9a-f]{48}$/;
const CHECKPOINT_TRANSITIONS = new Set([
  'initial-audit-pending->review-batch-complete',
  'fixer-result-ready->review-batch-complete',
  'fixer-result-ready->gates-complete',
  'gates-complete->review-batch-complete',
]);
// The open critical section is sub-second; a lock older than this was left
// by a crashed open and is safe to reap.
const LOCK_STALE_MS = 5 * 60 * 1000;
// An owner whose last heartbeat is older than this is considered abandoned
// and may be reclaimed. A live heartbeat worker refreshes it continuously.
const SESSION_STALE_DEFAULT_MS = 2 * 60 * 60 * 1000;
// Grace window while a just-opened (or just-reclaimed) session waits for its
// heartbeat worker to register before anyone may reclaim it.
const GRACE_DEFAULT_MS = 60 * 1000;
// Default heartbeat interval of the worker loop.
const BEAT_DEFAULT_MS = 15 * 1000;

function positiveEnvInteger(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isSafeInteger(raw) && raw > 0 ? raw : fallback;
}

function sessionStaleMs() {
  return positiveEnvInteger('GROUNDWORK_VALIDATION_STALE_MS', SESSION_STALE_DEFAULT_MS);
}

function graceMs() {
  return positiveEnvInteger('GROUNDWORK_VALIDATION_GRACE_MS', GRACE_DEFAULT_MS);
}

function beatMs() {
  return positiveEnvInteger('GROUNDWORK_VALIDATION_BEAT_MS', BEAT_DEFAULT_MS);
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function execGit(cwd, args, options = {}) {
  const output = execFileSync('git', args, {
    cwd,
    encoding: options.encoding === undefined ? 'utf8' : options.encoding,
    input: options.input,
    env: options.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  return typeof output === 'string' ? output.trim() : output;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value;
}

function atomicWriteJson(file, value) {
  writeJsonSyncAtomic(file, value, { mkdir: true });
}

function readJson(file, name) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${name} must be a regular file`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${name} is not valid JSON: ${error.message}`);
  }
}

function loadSession(runDir) {
  const absolute = fs.realpathSync(requireString(runDir, 'runDir'));
  if (!/^groundwork-validation-[a-f0-9]{32}$/.test(path.basename(absolute))) {
    throw new Error('runDir is not a Groundwork validation session');
  }
  const stateFile = path.join(absolute, '.validation-session.json');
  const state = readJson(stateFile, 'validation session');
  if (!READABLE_SCHEMA_VERSIONS.has(state.version)
      || state.runId !== path.basename(absolute).slice(22)) {
    throw new Error('validation session identity is invalid');
  }
  const worktreePath = fs.realpathSync(requireString(state.worktreePath, 'session worktreePath'));
  const commonRaw = execGit(worktreePath, ['rev-parse', '--git-common-dir']);
  const commonDir = fs.realpathSync(path.resolve(worktreePath, commonRaw));
  const expectedParent = sessionPaths({
    commonDir,
    project: requireString(state.project, 'session project'),
    taskId: requireString(state.taskId, 'session taskId'),
    branch: requireString(state.branch, 'session branch'),
  }).parent;
  if (path.dirname(absolute) !== fs.realpathSync(expectedParent)) {
    throw new Error('validation session is outside its identity-bound metadata directory');
  }
  verifySessionArtifacts(absolute, state);
  return { runDir: absolute, stateFile, state };
}

function verifyHashedArtifact(runDir, basename, expectedHash, label) {
  if (!basename || !expectedHash) return;
  const absolute = path.resolve(runDir, basename);
  if (path.dirname(absolute) !== runDir || path.basename(absolute) !== basename) {
    throw new Error(`${label} artifact path is invalid`);
  }
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024) {
    throw new Error(`${label} artifact must be a bounded regular file`);
  }
  if (sha256(fs.readFileSync(absolute)) !== expectedHash) {
    throw new Error(`${label} artifact changed after checkpoint`);
  }
}

function verifySessionArtifacts(runDir, state) {
  verifyHashedArtifact(
    runDir,
    state.coordinatorFile,
    state.coordinatorSha256,
    'coordinator'
  );
  if (!state.fixer) return;
  verifyHashedArtifact(
    runDir,
    state.fixer.envelopeFile,
    state.fixer.envelopeSha256,
    'fixer envelope'
  );
  verifyHashedArtifact(
    runDir,
    state.fixer.resultFile,
    state.fixer.resultSha256,
    'fixer result'
  );
}

function validateCoordinatorFile(runDir, coordinatorFile) {
  const absolute = path.resolve(requireString(coordinatorFile, 'coordinatorFile'));
  if (path.dirname(absolute) !== runDir || path.basename(absolute) !== absolute.slice(runDir.length + 1)) {
    throw new Error('coordinatorFile must be a direct child of runDir');
  }
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024) {
    throw new Error('coordinatorFile must be a bounded regular file');
  }
  const parsed = readJson(absolute, 'coordinator state');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('coordinator state must be a JSON object');
  }
  return { basename: path.basename(absolute), sha256: sha256(fs.readFileSync(absolute)) };
}

function validateCoordinatorStateFile(runDir, coordinatorFile, iteration) {
  const file = validateCoordinatorFile(runDir, coordinatorFile);
  const parsed = readJson(path.join(runDir, file.basename), 'coordinator state');
  if (parsed.iteration !== iteration) {
    throw new Error('coordinator state iteration does not match the checkpoint');
  }
  if (!['initial-audit', 'closure-review'].includes(parsed.review_mode)) {
    throw new Error('coordinator state review_mode must be initial-audit or closure-review');
  }
  if (!parsed.validation_baseline || typeof parsed.validation_baseline !== 'object'
      || Array.isArray(parsed.validation_baseline)) {
    throw new Error('coordinator state validation_baseline must be an object');
  }
  for (const field of [
    'finding_ledger',
    'carried_approvals',
    'disturbed_invariants',
    'fixed_ids',
    'findings_skipped',
    'active_reviewers',
  ]) {
    if (!Array.isArray(parsed[field])) {
      throw new Error(`coordinator state ${field} must be an array`);
    }
  }
  if (parsed.latest_manifest !== null && typeof parsed.latest_manifest !== 'string') {
    throw new Error('coordinator state latest_manifest must be a string or null');
  }
  return file;
}

function validateFixerResultFile(runDir, resultFile) {
  const file = validateCoordinatorFile(runDir, resultFile);
  const parsed = readJson(path.join(runDir, file.basename), 'fixer result');
  if (!['fixed', 'partial'].includes(parsed.status)) {
    throw new Error('fixer result status must be fixed or partial');
  }
  for (const field of ['files_touched', 'findings_fixed', 'findings_skipped', 'repair_claims', 'contracts_changed']) {
    if (!Array.isArray(parsed[field])) throw new Error(`fixer result ${field} must be an array`);
  }
  return file;
}

function resolveIdentity(input) {
  const repoRoot = fs.realpathSync(requireString(input.repoRoot, 'repoRoot'));
  const projectRoot = fs.realpathSync(requireString(input.projectRoot, 'projectRoot'));
  const worktreePath = fs.realpathSync(requireString(input.worktreePath, 'worktreePath'));
  const taskId = requireString(input.taskId, 'taskId');
  if (!TASK_ID.test(taskId)) throw new Error('taskId must be TASK-NNN or manual-validation');
  const branch = requireString(input.branch, 'branch');
  const baseHead = requireString(input.baseHead, 'baseHead');
  const protocolVersion = Number(input.protocolVersion);
  if (!Number.isSafeInteger(protocolVersion) || protocolVersion <= 0) {
    throw new Error('protocolVersion must be a positive integer');
  }
  const commonRaw = execGit(worktreePath, ['rev-parse', '--git-common-dir']);
  const commonDir = fs.realpathSync(path.resolve(worktreePath, commonRaw));
  const worktreeRoot = fs.realpathSync(execGit(worktreePath, ['rev-parse', '--show-toplevel']));
  const project = path.relative(worktreeRoot, projectRoot).split(path.sep).join('/') || '.';
  if (project === '..' || project.startsWith('../')) {
    throw new Error('projectRoot must be contained in the validation worktree');
  }
  return {
    repoRoot,
    projectRoot,
    worktreePath,
    commonDir,
    taskId,
    branch,
    baseHead,
    protocolVersion,
    project,
  };
}

function inspectActiveValidationSession(input) {
  const identity = resolveIdentity(input);
  const { parent, activeFile } = sessionPaths(identity);
  if (!fs.existsSync(activeFile)) return null;
  const pointer = readJson(activeFile, 'active validation pointer');
  const runDir = resolveActiveRun(parent, pointer);
  const state = loadSession(runDir).state;
  if (!sameIdentity(state, identity)) return null;
  const currentHead = execGit(identity.worktreePath, ['rev-parse', 'HEAD']);
  if (state.stage !== 'validated' && currentHead !== state.startHead) {
    throw new Error('incomplete validation session task HEAD changed');
  }
  return { runDir, state };
}

function validReviewerName(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
}

// Status snapshots never include capability material: no owner token, no
// digest — only public lifecycle facts.
function validationStatusSnapshot(runDir) {
  const loaded = loadSession(runDir);
  const snapshot = {
    iteration: loaded.state.iteration,
    stage: loaded.state.stage,
    updatedAt: loaded.state.updatedAt || null,
    ownerEpoch: (loaded.state.owner && loaded.state.owner.epoch) || null,
    heartbeat: heartbeatStatusView(loaded.state),
    reviewers: [],
  };
  if (!loaded.state.coordinatorFile) return snapshot;

  const coordinator = readJson(
    path.join(loaded.runDir, loaded.state.coordinatorFile),
    'validation coordinator status'
  );
  const reviewers = new Map();
  const carried = Array.isArray(coordinator.carried_approvals)
    ? coordinator.carried_approvals
    : [];
  if (carried.length > 32) throw new Error('validation coordinator has too many carried approvals');
  for (const approval of carried) {
    if (!approval || !validReviewerName(approval.agent)) {
      throw new Error('validation coordinator has an invalid carried approval');
    }
    reviewers.set(approval.agent, { name: approval.agent, status: 'approve', carried: true });
  }

  const active = Array.isArray(coordinator.active_reviewers) ? coordinator.active_reviewers : [];
  if (active.length > 32 || !active.every(validReviewerName)) {
    throw new Error('validation coordinator has invalid active reviewers');
  }
  for (const agent of active) {
    const findingsFile = path.join(loaded.runDir, `findings-${agent}-iter${loaded.state.iteration}.json`);
    let status = 'pending';
    if (fs.existsSync(findingsFile)) {
      const stat = fs.lstatSync(findingsFile);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 64 * 1024 * 1024) {
        throw new Error(`validation reviewer artifact is invalid: ${findingsFile}`);
      }
      const findings = readJson(findingsFile, `validation reviewer ${agent}`);
      if (findings.agent !== agent || findings.iteration !== loaded.state.iteration
          || !new Set(['approve', 'request-changes', 'skipped']).has(findings.verdict)) {
        throw new Error(`validation reviewer artifact identity is invalid: ${findingsFile}`);
      }
      status = findings.verdict;
    }
    reviewers.set(agent, { name: agent, status, carried: false });
  }
  snapshot.reviewers = [...reviewers.values()].sort((left, right) => left.name.localeCompare(right.name));
  return snapshot;
}

function heartbeatStatusView(state) {
  if (state.stage === 'validated') return 'terminal';
  const owner = state.owner;
  if (!owner) return 'legacy';
  const liveness = sessionLiveness(state);
  if (liveness === 'live') return 'live';
  if (liveness === 'grace') return 'starting';
  return 'stale';
}

function sessionPaths(identity) {
  const projectKey = sha256(identity.project).slice(0, 16);
  const taskKey = sha256(`${identity.taskId}\0${identity.branch}`).slice(0, 16);
  const parent = path.join(identity.commonDir, 'groundwork', 'validation', projectKey, taskKey);
  assertNoSymlinkComponents(identity.commonDir, parent);
  return { parent, activeFile: path.join(parent, 'active.json'), lockFile: path.join(parent, 'active.lock') };
}

/**
 * The slot's open lock (active.lock) delegates entirely to the shared
 * owned-lock module: O_EXCL creation with holder identity, dead-holder/age
 * stale reaping, and identity-checked release — each transition serialized by
 * the shared mutation protocol (lib/lease-mutation.js) so two opens can never
 * interleave in the verify-to-unlink window. The custom busyMessage keeps the
 * validation-specific actionable refusal text.
 *
 * @param {string} parent - Slot directory (active.json/active.lock live here)
 * @param {string} lockFile - Absolute lockfile path
 * @param {Function} [kill] - Liveness probe injected into the owned lock
 * @param {object} [hooks] - Test seams forwarded to the owned lock
 * @returns {Function} release callback
 */
function tryAcquireOpenLock(parent, lockFile, kill, hooks = {}) {
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const handle = acquireOwnedLock(lockFile, {
    staleMs: LOCK_STALE_MS,
    kill,
    busyMessage: (holder) => (holder && Number.isInteger(holder.pid)
      ? `another validation open is in progress for this task (holder pid ${holder.pid}` +
        `${holder.host && holder.host !== os.hostname() ? ` on ${holder.host}` : ''});` +
        ' retry in a moment or remove a stale lock manually if the holder crashed'
      : 'another validation open is in progress for this task (holder lock is unreadable);' +
        ' retry in a moment or remove a stale lock manually if the holder crashed'),
  }, hooks);
  return () => releaseOwnedLock(lockFile, handle.holder.id);
}

function assertNoSymlinkComponents(root, target) {
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('validation metadata path escapes the Git common directory');
  }
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`validation metadata path contains a symlink: ${current}`);
    if (!stat.isDirectory()) throw new Error(`validation metadata path component is not a directory: ${current}`);
  }
}

function resolveActiveRun(parent, pointer) {
  const runName = requireString(pointer.runDir, 'active runDir');
  if (!/^groundwork-validation-[a-f0-9]{32}$/.test(runName)) {
    throw new Error('active validation runDir is invalid');
  }
  const realParent = fs.realpathSync(parent);
  const runDir = fs.realpathSync(path.join(parent, runName));
  if (path.dirname(runDir) !== realParent) {
    throw new Error('active validation runDir escapes its metadata directory');
  }
  return runDir;
}

function sameIdentity(state, identity) {
  return state.taskId === identity.taskId
    && state.project === identity.project
    && state.branch === identity.branch
    && state.baseHead === identity.baseHead
    && state.worktreePath === identity.worktreePath
    && state.protocolVersion === identity.protocolVersion;
}

// ---------------------------------------------------------------------------
// Ownership: bearer capability, owner epoch, heartbeat liveness
// ---------------------------------------------------------------------------

/**
 * Classify an active v2 session's owner liveness.
 *
 * 'terminal' — completed, replayable read-only.
 * 'live'     — a registered heartbeat worker refreshed its beat inside the
 *              staleness window; only the capability owner may mutate. On the
 *              local host a registered worker whose recorded process identity
 *              no longer matches is treated as crashed ('stale') even while
 *              its last beat is still fresh — the lease follows the worker,
 *              not the clock. A foreign-host worker is never probed (never
 *              reaped while fresh); an undecidable identity (malformed or
 *              missing fields) falls back to the recorded beat.
 * 'grace'    — opened/reclaimed moments ago, worker not yet registered; the
 *              startup grace window holds reclaimers off.
 * 'stale'    — no live heartbeat; a claimant may take over.
 */
function sessionLiveness(state, now = Date.now()) {
  if (state.stage === 'validated') return 'terminal';
  const owner = state.owner;
  if (!owner || owner.terminal) return 'stale';
  const heartbeat = owner.heartbeat || {};
  if (heartbeat.registered) {
    const lastBeat = Date.parse(heartbeat.lastBeat || '');
    if (!(Number.isFinite(lastBeat) && now - lastBeat < sessionStaleMs())) return 'stale';
    const workerAlive = heartbeatWorkerAlive(heartbeat);
    if (workerAlive === false) return 'stale';
    return 'live';
  }
  const graceUntil = Date.parse(heartbeat.graceUntil || '');
  if (Number.isFinite(graceUntil) && now < graceUntil) return 'grace';
  return 'stale';
}

/**
 * Whether the registered heartbeat worker process is provably this exact live
 * process. Returns true/false on the local host, or null when undecidable
 * (foreign host, malformed identity) — callers never reap on null.
 */
function heartbeatWorkerAlive(heartbeat) {
  if (!heartbeat || heartbeat.host !== os.hostname()) return null;
  if (!Number.isInteger(heartbeat.pid) || heartbeat.pid < 1
      || typeof heartbeat.processStart !== 'string' || !heartbeat.processStart) {
    return null;
  }
  return processIdentityMatches(heartbeat.pid, heartbeat.processStart);
}

/**
 * Authenticate a bearer capability against durable state. The raw token is
 * never stored, logged, or echoed — only its SHA-256 digest lives in state,
 * and error messages never contain token material.
 */
function authenticateOwner(state, ownerToken) {
  requireString(ownerToken, 'ownerToken');
  if (!OWNER_TOKEN_PATTERN.test(ownerToken)) {
    throw new Error('owner capability is invalid');
  }
  if (!state.owner || typeof state.owner.tokenDigest !== 'string') {
    throw new Error('validation session has no owner to authenticate');
  }
  if (sha256(ownerToken) !== state.owner.tokenDigest) {
    throw new Error('owner capability does not match this validation session');
  }
}

function freshHeartbeat(now) {
  return {
    registered: false,
    pid: null,
    host: os.hostname(),
    processStart: null,
    startedAt: new Date(now).toISOString(),
    lastBeat: new Date(now).toISOString(),
    graceUntil: new Date(now + graceMs()).toISOString(),
    stopped: false,
  };
}

/**
 * Mint the next owner epoch and its bearer capability. The token is returned
 * to the caller only; durable state records just the digest.
 */
function mintOwner(previousOwner, now) {
  const token = crypto.randomBytes(24).toString('hex');
  const owner = {
    epoch: (previousOwner && Number.isInteger(previousOwner.epoch) ? previousOwner.epoch : 0) + 1,
    tokenDigest: sha256(token),
    heartbeat: freshHeartbeat(now),
    terminal: false,
  };
  return { token, owner };
}

/**
 * Serialize an authenticated state mutation: acquire the run's mutation lock,
 * reload state, authenticate the capability, run the transition, then write
 * one new revision. Authorized contenders released together serialize here —
 * the loser waits for the lock, rereads current state, and fails the
 * expected-stage/revision check instead of overwriting the winner. The
 * release is identity-checked (owned-lock), so a lock can never be released
 * by anyone but its holder.
 */
/**
 * Cheap state read for hot paths: read+parse only .validation-session.json
 * (realpath + regular-file check, no git spawn, no artifact re-hash). Full
 * identity/artifact verification stays at open/checkpoint/complete
 * boundaries and inside the authoritative in-lock loadSession.
 */
function isContentionError(error) {
  return Boolean(error) && error.code === 'contention';
}

function heartbeatExitError(reason) {
  // Typed orderly-shutdown signal: the heartbeat loop keys off this code,
  // never off message wording.
  const error = new Error(`heartbeat worker exiting: ${reason}`);
  error.code = 'heartbeat-exit';
  return error;
}

function readSessionStateLightweight(runDir) {
  const absolute = fs.realpathSync(requireString(runDir, 'runDir'));
  if (!/^groundwork-validation-[a-f0-9]{32}$/.test(path.basename(absolute))) {
    throw new Error('runDir is not a Groundwork validation session');
  }
  const stateFile = path.join(absolute, '.validation-session.json');
  const state = readJson(stateFile, 'validation session');
  return { runDir: absolute, stateFile, state };
}

const LEGACY_READONLY_MESSAGE =
  'legacy validation sessions are read-only; incomplete version-1 state requires the documented quiescent recovery';

function withRunLock(runDir, ownerToken, mutate) {
  // Cheap pre-lock version gate: the full loadSession here would double the
  // critical-section cost (realpath, git spawn, artifact re-hash) for a
  // single discarded field. The authoritative reload happens inside the lock.
  const pre = readSessionStateLightweight(runDir);
  if (pre.state.version !== SESSION_SCHEMA_VERSION) {
    throw new Error(LEGACY_READONLY_MESSAGE);
  }
  const lockFile = path.join(pre.runDir, '.mutation.lock');
  const lock = acquireOwnedLockWithRetry(lockFile);
  try {
    const loaded = loadSession(runDir);
    authenticateOwner(loaded.state, ownerToken);
    const nextState = mutate(loaded);
    const state = {
      ...nextState,
      revision: loaded.state.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    atomicWriteJson(loaded.stateFile, state);
    return state;
  } finally {
    lock.release();
  }
}

/**
 * Heartbeat hot-path mutation: serialize on the run's mutation lock and
 * update only liveness state (lastBeat/revision) from a lightweight state
 * read — no git spawn, no artifact re-hash per beat. The owner capability is
 * still authenticated on every call; an unrecognized version or shape falls
 * back to the fully verified withRunLock path.
 */
function withHeartbeatLock(runDir, ownerToken, mutate) {
  const initial = readSessionStateLightweight(runDir);
  if (initial.state.version !== SESSION_SCHEMA_VERSION
      || !initial.state.owner
      || typeof initial.state.owner !== 'object'
      || typeof initial.state.owner.tokenDigest !== 'string') {
    return withRunLock(runDir, ownerToken, mutate);
  }
  const lockFile = path.join(initial.runDir, '.mutation.lock');
  // The dedicated heartbeat owns the lease: pure contention on the mutation
  // lock is retried (bounded) while the capability still authenticates, so a
  // slow contender can never starve the heartbeat into a false lease loss.
  const lock = acquireOwnedLockForHeartbeat(initial.runDir, lockFile, ownerToken);
  try {
    const loaded = readSessionStateLightweight(runDir);
    if (loaded.state.version !== SESSION_SCHEMA_VERSION) {
      throw new Error(LEGACY_READONLY_MESSAGE);
    }
    authenticateOwner(loaded.state, ownerToken);
    const nextState = mutate(loaded);
    const state = {
      ...nextState,
      revision: loaded.state.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    atomicWriteJson(loaded.stateFile, state);
    return state;
  } finally {
    lock.release();
  }
}

// Contending authorized mutations wait briefly for the current holder rather
// than failing fast: the point of the mutation lock is serialization, and the
// loser's own stage/revision validation produces the actionable failure.
const MUTATION_LOCK_WAIT_MS = 5 * 1000;
// The dedicated heartbeat worker is the lease: while its capability still
// authenticates, a merely CONTENDED mutation lock is retried with backoff for
// up to this patience window (the contender holds the lock, nothing is wrong
// with the lease itself). Revocation, explicit stop, or terminal completion
// still exit immediately — only contention is retried.
const HEARTBEAT_LOCK_PATIENCE_DEFAULT_MS = 60 * 1000;

function mutationLockWaitMs() {
  return positiveEnvInteger('GROUNDWORK_MUTATION_LOCK_WAIT_MS', MUTATION_LOCK_WAIT_MS);
}

function heartbeatLockPatienceMs() {
  return positiveEnvInteger('GROUNDWORK_HEARTBEAT_LOCK_PATIENCE_MS', HEARTBEAT_LOCK_PATIENCE_DEFAULT_MS);
}

function acquireOwnedLockWithRetry(lockFile) {
  const deadline = Date.now() + mutationLockWaitMs();
  for (;;) {
    try {
      return acquireOwnedLock(lockFile);
    } catch (error) {
      // Typed contract: only transient contention retries; every other
      // LockError code (malformed-owner, foreign-host-unsupported, ...)
      // is terminal for this attempt.
      if (!isContentionError(error) || Date.now() >= deadline) throw error;
      sleepSync(25);
    }
  }
}

/**
 * Whether the heartbeat's bearer capability still authenticates against
 * durable state: same token digest, session not terminal, not explicitly
 * stopped. A revoked or stopped worker must never spin on contention.
 */
function heartbeatCapabilityStillValid(runDir, ownerToken) {
  try {
    const { state } = readSessionStateLightweight(runDir);
    return state.version === SESSION_SCHEMA_VERSION
      && state.owner && typeof state.owner.tokenDigest === 'string'
      && sha256(ownerToken) === state.owner.tokenDigest
      && !state.owner.terminal
      && !(state.owner.heartbeat && state.owner.heartbeat.stopped);
  } catch {
    return false;
  }
}

/**
 * Heartbeat lock acquisition: like acquireOwnedLockWithRetry, but pure
 * contention is retried with backoff for the patience window while (and only
 * while) the capability still authenticates. Any other failure — malformed
 * owner, unreadable path, revoked capability — propagates immediately.
 */
function acquireOwnedLockForHeartbeat(runDir, lockFile, ownerToken) {
  const deadline = Date.now() + heartbeatLockPatienceMs();
  let backoff = 50;
  for (;;) {
    try {
      return acquireOwnedLockWithRetry(lockFile);
    } catch (error) {
      if (!isContentionError(error) || Date.now() >= deadline) throw error;
      if (!heartbeatCapabilityStillValid(runDir, ownerToken)) throw error;
      sleepSync(backoff);
      backoff = Math.min(backoff * 2, 1000);
    }
  }
}

function assertExpectedRevision(state, expectedRevision) {
  if (expectedRevision === undefined || expectedRevision === null || expectedRevision === '') return;
  const expected = Number(expectedRevision);
  if (!Number.isSafeInteger(expected) || expected < 1) {
    throw new Error('expectedRevision must be a positive integer');
  }
  if (state.revision !== expected) {
    throw new Error(
      `validation session revision is ${state.revision}, expected ${expected}; reread state before retrying`
    );
  }
}

function sessionBusyMessage(state, identity) {
  const minutes = Math.max(1, Math.round(sessionStaleMs() / 60000));
  return (
    `a validation session for ${identity.taskId} on branch ${identity.branch} is already active` +
      ` (run ${state.runId.slice(0, 8)}, stage ${state.stage}, owner epoch ${state.owner.epoch}).` +
      ' Concurrent validations of the same task would interleave findings and checkpoints.' +
      ' If this is a continuation of your own validation run, re-open with --resume-run' +
      ` ${state.runId} and pipe the capability on stdin (both values were returned` +
      ' was created or reclaimed and live in your tracking notes).' +
      ' If that session crashed, wait until its heartbeat is provably stale' +
      ` (staleness window ${minutes} min, override with GROUNDWORK_VALIDATION_STALE_MS)` +
      ' and reclaim it by opening again, or abandon it:' +
      ` node validation-session.js abandon --force --repo-root ${identity.repoRoot}` +
      ` --project-root ${identity.projectRoot} --worktree ${identity.worktreePath}` +
      ` --task-id ${identity.taskId} --branch ${identity.branch}`
  );
}

// The runner's continuity capability lives in a private, restrictive
// runner-owned state file beside the slot — never in reporter artifacts or
// session state itself.
function runnerCapabilityPath(parent) {
  return path.join(parent, 'runner-capability.json');
}

function saveRunnerCapability(parent, runId, ownerToken, epoch) {
  const file = runnerCapabilityPath(parent);
  writeJsonSyncAtomic(file, { version: 1, runId, ownerToken, epoch });
  // Tighten on EVERY replacement: the write's mode only applies at creation,
  // so a pre-existing loose file stays loose unless chmod runs unconditionally.
  fs.chmodSync(file, 0o600);
}

function loadRunnerCapability(parent, runId) {
  try {
    const raw = JSON.parse(fs.readFileSync(runnerCapabilityPath(parent), 'utf8'));
    if (raw && raw.version === 1 && raw.runId === runId && typeof raw.ownerToken === 'string') {
      return raw.ownerToken;
    }
  } catch {
    // Absent or unreadable capability store — no authorized resume.
  }
  return null;
}

function openValidationSession(input, kill) {
  const identity = resolveIdentity(input);
  const { parent, activeFile, lockFile } = sessionPaths(identity);
  const release = tryAcquireOpenLock(parent, lockFile, kill);
  try {
    return openLockedSession(identity, parent, activeFile, input);
  } finally {
    release();
  }
}

/**
 * Serialize an open-path state write (authenticated resume refresh, stale
 * takeover, fixer-inflight recovery) with the run's mutation lock: acquire
 * .mutation.lock, reload current state inside the lock, re-validate
 * liveness/identity against the freshly loaded state, then write one new
 * revision. An old owner that is mid-mutation (already past
 * authenticateOwner, computed revision in hand) when its heartbeat is
 * classified stale can therefore never publish after the takeover.
 */
function withOpenStateMutation(runDir, decide) {
  const lockFile = path.join(runDir, '.mutation.lock');
  const lock = acquireOwnedLockWithRetry(lockFile);
  try {
    const loaded = loadSession(runDir);
    if (loaded.state.version !== SESSION_SCHEMA_VERSION) {
      throw new Error(LEGACY_READONLY_MESSAGE);
    }
    const decided = decide(loaded);
    const state = {
      ...decided.state,
      revision: loaded.state.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    atomicWriteJson(loaded.stateFile, state);
    return { state, result: decided.result };
  } finally {
    lock.release();
  }
}

// Fold fixer-inflight recovery into the same locked write: the stage moves
// back to fixer-prepared and the caller is told to rerun the fixer. A resume
// reports 'recovered'; a takeover keeps its 'reclaimed' status.
function finishOpenState(state, status, ownerToken) {
  if (state.stage === 'fixer-inflight') {
    return {
      state: { ...state, stage: 'fixer-prepared' },
      result: {
        status: status === 'resumed' ? 'recovered' : status,
        ownerToken,
        recovery: { action: 'rerun-fixer' },
      },
    };
  }
  return { state, result: { status, ownerToken, recovery: null } };
}

function unlinkPointerIfUnchanged(activeFile, expectedRunDir) {
  const pointer = readJson(activeFile, 'active validation pointer');
  if (pointer.runDir !== expectedRunDir) {
    throw new Error('the active validation pointer changed; a successor session was published');
  }
  fs.unlinkSync(activeFile);
}

function openLockedSession(identity, parent, activeFile, input) {
  const resumeRun = typeof input.resumeRun === 'string' && input.resumeRun ? input.resumeRun : null;
  const providedToken = typeof input.ownerToken === 'string' && input.ownerToken ? input.ownerToken : null;

  if (fs.existsSync(activeFile)) {
    const pointer = readJson(activeFile, 'active validation pointer');
    const observedRunDir = pointer.runDir;
    const runDir = resolveActiveRun(parent, pointer);
    const state = loadSession(runDir).state;
    if (!sameIdentity(state, identity)) {
      throw new Error('active validation session identity does not match this validation baseline');
    }
    const currentHead = execGit(identity.worktreePath, ['rev-parse', 'HEAD']);
    if (state.stage === 'validated' && currentHead !== state.startHead) {
      unlinkPointerIfUnchanged(activeFile, observedRunDir);
      return openLockedSession(identity, parent, activeFile, input);
    }

    // Completed sessions replay read-only for any caller.
    if (state.stage === 'validated') {
      return { status: 'completed', runDir, findingsDir: runDir, state };
    }

    // Version boundary: an incomplete v1 session is never adopted in place.
    if (state.version === LEGACY_SESSION_SCHEMA_VERSION) {
      throw new Error(
        'an incomplete version-1 validation session exists and is never adopted in place;' +
          ' confirm no old writer is running, then recover the slot with' +
          ' `validation-session.js abandon --force` (documented legacy scope)' +
          ' or the documented quiescent migration'
      );
    }

    let token = providedToken;
    if (!token && input.runnerMode) {
      const stored = loadRunnerCapability(parent, state.runId);
      if (stored) token = stored;
    }

    const liveness = sessionLiveness(state);
    if (liveness === 'live' || liveness === 'grace') {
      if (!resumeRun || resumeRun !== state.runId || !token) {
        throw new Error(sessionBusyMessage(state, identity));
      }
    }

    // Authenticated resume or stale takeover: the state write is serialized
    // with the run's mutation lock and liveness/identity is re-validated
    // against the freshly loaded state inside the lock, so an old owner
    // mid-mutation can never publish over the successor.
    const { state: finalState, result } = withOpenStateMutation(runDir, (loaded) => {
      const current = sessionLiveness(loaded.state);
      if (current === 'live' || current === 'grace') {
        if (!resumeRun || resumeRun !== loaded.state.runId || !token) {
          throw new Error(sessionBusyMessage(loaded.state, identity));
        }
        authenticateOwner(loaded.state, token);
        const now = Date.now();
        return finishOpenState({
          ...loaded.state,
          owner: {
            ...loaded.state.owner,
            heartbeat: {
              ...loaded.state.owner.heartbeat,
              graceUntil: new Date(now + graceMs()).toISOString(),
            },
          },
        }, 'resumed', token);
      }
      // Stale owner: safe takeover, revalidated inside the mutation lock.
      // The successor epoch invalidates the old capability.
      const minted = mintOwner(loaded.state.owner, Date.now());
      return finishOpenState({ ...loaded.state, owner: minted.owner }, 'reclaimed', minted.token);
    });
    if (input.runnerMode) {
      saveRunnerCapability(parent, finalState.runId, result.ownerToken, finalState.owner.epoch);
    }
    return {
      status: result.status,
      runDir,
      findingsDir: runDir,
      state: finalState,
      ownerToken: result.ownerToken,
      recovery: result.recovery,
    };
  }

  const minted = mintOwner(null, Date.now());
  const runId = crypto.randomBytes(16).toString('hex');
  const runName = `groundwork-validation-${runId}`;
  const runDir = path.join(parent, runName);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const state = {
    version: SESSION_SCHEMA_VERSION,
    protocolVersion: identity.protocolVersion,
    runId,
    taskId: identity.taskId,
    project: identity.project,
    branch: identity.branch,
    baseHead: identity.baseHead,
    startHead: execGit(identity.worktreePath, ['rev-parse', 'HEAD']),
    worktreePath: identity.worktreePath,
    stage: 'initial-audit-pending',
    iteration: 1,
    revision: 1,
    owner: minted.owner,
    coordinatorFile: null,
    coordinatorSha256: null,
    fixer: null,
    completed: null,
    updatedAt: new Date().toISOString(),
  };
  atomicWriteJson(path.join(runDir, '.validation-session.json'), state);
  atomicWriteJson(activeFile, { version: SESSION_SCHEMA_VERSION, runDir: runName });
  if (input.runnerMode) saveRunnerCapability(parent, runId, minted.token, minted.owner.epoch);
  return {
    status: 'created',
    runDir,
    findingsDir: runDir,
    state,
    ownerToken: minted.token,
  };
}

/**
 * Legacy freshness guard for version-1 sessions only (updatedAt heartbeat).
 * v2 liveness is capability/heartbeat based (see sessionLiveness).
 */
function assertLegacySessionNotActivelyHeld(state, identity) {
  if (state.stage === 'validated') return;
  const updated = Date.parse(state.updatedAt || '');
  if (!Number.isFinite(updated)) return;
  const ageMs = Date.now() - updated;
  if (ageMs < sessionStaleMs()) {
    const minutes = Math.max(1, Math.round(ageMs / 60000));
    throw new Error(
      `a validation session for ${identity.taskId} on branch ${identity.branch} is already active` +
        ` (run ${state.runId.slice(0, 8)}, stage ${state.stage}, last heartbeat ${minutes} min ago)`
    );
  }
}

/**
 * Abandon the active validation session for a task identity: remove the
 * pointer so the next open starts a fresh run, all under the slot's open
 * lock. Live v2 owners — fresh heartbeat or startup grace — are refused even
 * with --force; --force is the documented escape hatch for wedged/unreadable
 * slots and legacy version-1 state after user-confirmed quiescence. The
 * pointer is unlinked only after a final compare: a successor published
 * after our observation is never removed.
 */
function abandonValidationSession(input, force, kill, hooks = {}) {
  const identity = resolveIdentity(input);
  const { parent, activeFile, lockFile } = sessionPaths(identity);
  // Hold the open lock across the whole sequence: releasing the lockfile is
  // the holder's job (the release callback), never ours.
  const release = tryAcquireOpenLock(parent, lockFile, kill);
  try {
    if (fs.existsSync(activeFile)) {
      const pointer = readJson(activeFile, 'active validation pointer');
      const observedRunDir = pointer.runDir;
      let state = null;
      try {
        const runDir = resolveActiveRun(parent, pointer);
        state = loadSession(runDir).state;
      } catch (error) {
        if (!force) throw error;
        // Under --force an unloadable/wedged slot is unrecoverable stale
        // state the refusal message told the operator to clear.
      }
      if (state && !sameIdentity(state, identity)) {
        if (!force) {
          throw new Error('active validation session identity does not match this validation baseline');
        }
        // Same-slot pointer recorded at a different baseline: clear it.
        state = null;
      }
      if (state && state.version === SESSION_SCHEMA_VERSION
          && ['live', 'grace'].includes(sessionLiveness(state))) {
        throw new Error(
          'cannot abandon a live validation owner; stop it through its owner capability,' +
            ' or wait until its heartbeat is provably stale and reclaim the session by opening again'
        );
      }
      if (state && !force && state.version === LEGACY_SESSION_SCHEMA_VERSION
          && state.stage !== 'validated') {
        // Legacy v1 freshness guard; --force is the documented escape after
        // the user confirmed quiescence.
        assertLegacySessionNotActivelyHeld(state, identity);
      }
      // Successor guard: revalidate the pointer right before unlinking so a
      // session published after our observation survives.
      if (hooks.beforeUnlink) hooks.beforeUnlink();
      const currentPointer = readJson(activeFile, 'active validation pointer');
      if (currentPointer.runDir !== observedRunDir) {
        throw new Error('the active validation pointer changed during abandon; the successor session was preserved');
      }
      fs.unlinkSync(activeFile);
    }
  } finally {
    release();
  }
  return { status: 'abandoned', runDir: null };
}

function checkpointValidationSession(runDir, input) {
  return withRunLock(runDir, input.ownerToken, (loaded) => {
    assertExpectedRevision(loaded.state, input.expectedRevision);
    const expectedStage = requireString(input.expectedStage, 'expectedStage');
    const nextStage = requireString(input.nextStage, 'nextStage');
    if (loaded.state.stage !== expectedStage) {
      throw new Error(`validation session stage is ${loaded.state.stage}, expected ${expectedStage}`);
    }
    const iteration = Number(input.iteration);
    if (!Number.isSafeInteger(iteration) || iteration <= 0) {
      throw new Error('iteration must be a positive integer');
    }
    if (!CHECKPOINT_TRANSITIONS.has(`${expectedStage}->${nextStage}`)) {
      throw new Error(`invalid validation stage transition: ${expectedStage} -> ${nextStage}`);
    }
    const advancesIteration = nextStage === 'review-batch-complete'
      && expectedStage !== 'initial-audit-pending';
    const requiredIteration = loaded.state.iteration + (advancesIteration ? 1 : 0);
    if (iteration !== requiredIteration) {
      throw new Error(`validation checkpoint iteration must be ${requiredIteration}`);
    }
    const coordinator = validateCoordinatorStateFile(
      loaded.runDir,
      input.coordinatorFile,
      iteration
    );
    return {
      ...loaded.state,
      stage: nextStage,
      iteration,
      coordinatorFile: coordinator.basename,
      coordinatorSha256: coordinator.sha256,
    };
  });
}

function beginFixerTransaction(runDir, input) {
  return withRunLock(runDir, input.ownerToken, (loaded) => {
    assertExpectedRevision(loaded.state, input.expectedRevision);
    if (!['review-batch-complete', 'fixer-prepared'].includes(loaded.state.stage)) {
      throw new Error(`cannot begin fixer from validation stage ${loaded.state.stage}`);
    }
    const iteration = Number(input.iteration);
    if (!Number.isSafeInteger(iteration) || iteration <= 0) {
      throw new Error('iteration must be a positive integer');
    }
    if (iteration !== loaded.state.iteration) {
      throw new Error(`fixer iteration must match validation iteration ${loaded.state.iteration}`);
    }
    const envelope = validateCoordinatorFile(loaded.runDir, input.envelopeFile);
    return {
      ...loaded.state,
      stage: 'fixer-inflight',
      fixer: {
        iteration,
        envelopeFile: envelope.basename,
        envelopeSha256: envelope.sha256,
        resultFile: null,
      },
    };
  });
}

function completeFixerTransaction(runDir, input) {
  return withRunLock(runDir, input.ownerToken, (loaded) => {
    assertExpectedRevision(loaded.state, input.expectedRevision);
    if (loaded.state.stage !== 'fixer-inflight' || !loaded.state.fixer) {
      throw new Error(`cannot complete fixer from validation stage ${loaded.state.stage}`);
    }
    const iteration = Number(input.iteration);
    if (iteration !== loaded.state.fixer.iteration) {
      throw new Error('fixer result iteration does not match the active transaction');
    }
    const result = validateFixerResultFile(loaded.runDir, input.resultFile);
    return {
      ...loaded.state,
      stage: 'fixer-result-ready',
      fixer: {
        ...loaded.state.fixer,
        resultFile: result.basename,
        resultSha256: result.sha256,
      },
    };
  });
}

function requireMetric(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return number;
}

function completeValidationSession(runDir, input) {
  const state = withRunLock(runDir, input.ownerToken, (loaded) => {
    assertExpectedRevision(loaded.state, input.expectedRevision);
    const expectedStage = requireString(input.expectedStage, 'expectedStage');
    if (expectedStage !== 'review-batch-complete') {
      throw new Error('cannot complete validation before a durable reviewer batch approves');
    }
    if (loaded.state.stage !== expectedStage) {
      throw new Error(`validation session stage is ${loaded.state.stage}, expected ${expectedStage}`);
    }
    const action = requireString(input.action, 'action');
    if (!['commit', 'none'].includes(action)) throw new Error('action must be commit or none');
    let commit = null;
    if (action === 'commit') {
      commit = {
        subject: requireString(input.commitSubject, 'commitSubject'),
        body: requireString(input.commitBody, 'commitBody'),
      };
    }
    return {
      ...loaded.state,
      stage: 'validated',
      completed: {
        iterations: requireMetric(input.iterations, 'iterations'),
        fixed: requireMetric(input.fixed, 'fixed'),
        unworked: requireMetric(input.unworked, 'unworked'),
        action,
        commit,
      },
      owner: { ...loaded.state.owner, terminal: true },
    };
  });
  return state;
}

// ---------------------------------------------------------------------------
// Heartbeat worker
// ---------------------------------------------------------------------------

function heartbeatRegister(runDir, ownerToken) {
  return withHeartbeatLock(runDir, ownerToken, (loaded) => {
    const heartbeat = loaded.state.owner.heartbeat;
    if (heartbeat.stopped) throw new Error('heartbeat was explicitly stopped for this session');
    if (loaded.state.owner.terminal) throw new Error('validation session is complete');
    const now = Date.now();
    return {
      ...loaded.state,
      owner: {
        ...loaded.state.owner,
        heartbeat: {
          ...heartbeat,
          registered: true,
          pid: process.pid,
          host: os.hostname(),
          processStart: processStartIdentity(process.pid),
          startedAt: new Date(now).toISOString(),
          lastBeat: new Date(now).toISOString(),
          graceUntil: new Date(now + graceMs()).toISOString(),
          stopped: false,
        },
      },
    };
  });
}

function heartbeatBeat(runDir, ownerToken) {
  return withHeartbeatLock(runDir, ownerToken, (loaded) => {
    const heartbeat = loaded.state.owner.heartbeat;
    if (loaded.state.owner.terminal) throw heartbeatExitError('validation session is complete');
    if (heartbeat.stopped) throw heartbeatExitError('explicitly stopped');
    return {
      ...loaded.state,
      owner: {
        ...loaded.state.owner,
        heartbeat: { ...heartbeat, lastBeat: new Date().toISOString() },
      },
    };
  });
}

function heartbeatStop(runDir, ownerToken) {
  return withHeartbeatLock(runDir, ownerToken, (loaded) => {
    return {
      ...loaded.state,
      owner: {
        ...loaded.state.owner,
        heartbeat: { ...loaded.state.owner.heartbeat, stopped: true },
      },
    };
  });
}

/**
 * Heartbeat worker: registers its PID/process-start identity under the
 * mutation lock, prints one bounded readiness signal, then refreshes the
 * lease until the session completes, the capability is revoked by a
 * successor, or an explicit stop arrives. Exit code 0 for an orderly stop,
 * non-zero when ownership was lost.
 */
function heartbeatLoop(runDir, ownerToken) {
  heartbeatRegister(runDir, ownerToken);
  process.stdout.write(`${JSON.stringify({ status: 'heartbeat-ready' })}\n`);
  const interval = beatMs();
  for (;;) {
    sleepSync(interval);
    try {
      heartbeatBeat(runDir, ownerToken);
    } catch (error) {
      if (error && error.code === 'heartbeat-exit') return 'stopped';
      throw error;
    }
  }
}

function parseArgs(argv) {
  const command = argv[0];
  if (!command) throw new Error('validation session command is required');
  const args = {};
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--owner-token' || arg.startsWith('--owner-token=')) {
      throw new Error(
        'the owner capability must never travel on the command line (it is visible to every process listing);'
          + ' pipe it on stdin instead: printf %s "$OWNER_TOKEN" | validation-session.js <command> ...'
      );
    }
    if (arg === '--runner-mode' || arg === '--force') {
      args[arg === '--force' ? 'force' : 'runnerMode'] = true;
      continue;
    }
    if (!arg.startsWith('--') || argv[index + 1] === undefined) {
      throw new Error(`invalid validation session argument: ${arg}`);
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (Object.hasOwn(args, key)) throw new Error(`duplicate validation session argument: ${arg}`);
    args[key] = argv[++index];
  }
  return { command, args };
}

// Capability transport: the bearer capability arrives on stdin — one trimmed
// line — never on the command line or in the environment. `required` commands
// refuse to run without it; `open` treats an absent stdin capability as a
// fresh open (resume tokens are optional).
function capabilityFromStdin(required) {
  let stat = null;
  try {
    stat = fs.fstatSync(0);
  } catch {
    stat = null;
  }
  if (!stat || stat.isCharacterDevice()) {
    if (required) {
      throw new Error(
        'the owner capability is required: pipe it on stdin'
          + ' (printf %s "$OWNER_TOKEN" | validation-session.js <command> ...)'
      );
    }
    return null;
  }
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch (error) {
    if (required) throw error;
    return null;
  }
  const firstLine = raw.split(/\r?\n/, 1)[0].trim();
  if (!firstLine && required) {
    throw new Error('the owner capability is required: pipe it on stdin as the first line');
  }
  return firstLine || null;
}

function cliResult(opened) {
  return {
    status: opened.status,
    run_id: opened.state.runId,
    run_dir: opened.runDir,
    findings_dir: opened.findingsDir,
    stage: opened.state.stage,
    iteration: opened.state.iteration,
    coordinator_file: opened.state.coordinatorFile,
    unworked_artifact: opened.state.unworkedArtifact || null,
    completed: opened.state.completed,
    recovery: opened.recovery || null,
    // Bearer capability: returned only to the authenticated caller that just
    // created, resumed, or reclaimed this session — never in any other
    // status, log, or artifact output.
    owner_token: opened.ownerToken || null,
  };
}

function main(argv = process.argv.slice(2)) {
  const { command, args } = parseArgs(argv);
  let result;
  if (command === 'open') {
    result = cliResult(openValidationSession({
      repoRoot: args.repoRoot,
      projectRoot: args.projectRoot,
      worktreePath: args.worktree,
      taskId: args.taskId,
      branch: args.branch,
      baseHead: args.baseHead,
      protocolVersion: args.protocolVersion,
      runnerMode: args.runnerMode,
      resumeRun: args.resumeRun,
      ownerToken: capabilityFromStdin(false),
    }));
  } else if (command === 'checkpoint') {
    const state = checkpointValidationSession(args.runDir, { ...args, ownerToken: capabilityFromStdin(true) });
    result = { status: 'checkpointed', stage: state.stage, iteration: state.iteration, revision: state.revision };
  } else if (command === 'begin-fixer') {
    const state = beginFixerTransaction(args.runDir, { ...args, ownerToken: capabilityFromStdin(true) });
    result = { status: 'fixer-started', stage: state.stage, iteration: state.iteration, revision: state.revision };
  } else if (command === 'complete-fixer') {
    const state = completeFixerTransaction(args.runDir, { ...args, ownerToken: capabilityFromStdin(true) });
    result = { status: 'fixer-completed', stage: state.stage, iteration: state.iteration, revision: state.revision };
  } else if (command === 'complete') {
    const state = completeValidationSession(args.runDir, { ...args, ownerToken: capabilityFromStdin(true) });
    result = { status: 'completed', stage: state.stage, completed: state.completed, revision: state.revision };
  } else if (command === 'abandon') {
    abandonValidationSession({
      repoRoot: args.repoRoot,
      projectRoot: args.projectRoot,
      worktreePath: args.worktree,
      taskId: args.taskId,
      branch: args.branch,
      baseHead: args.baseHead,
      protocolVersion: args.protocolVersion,
    }, Boolean(args.force));
    result = { status: 'abandoned' };
  } else if (command === 'heartbeat-loop') {
    heartbeatLoop(requireString(args.runDir, 'runDir'), requireString(capabilityFromStdin(true), 'ownerToken'));
    result = { status: 'heartbeat-stopped' };
  } else if (command === 'heartbeat-stop') {
    const state = heartbeatStop(requireString(args.runDir, 'runDir'), requireString(capabilityFromStdin(true), 'ownerToken'));
    result = { status: 'heartbeat-stopped', revision: state.revision };
  } else if (command === 'heartbeat-beat') {
    const state = heartbeatBeat(requireString(args.runDir, 'runDir'), requireString(capabilityFromStdin(true), 'ownerToken'));
    result = { status: 'heartbeat', revision: state.revision, last_beat: state.owner.heartbeat.lastBeat };
  } else {
    throw new Error(`unknown validation session command: ${command}`);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`validation-session error: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  SESSION_SCHEMA_VERSION,
  LEGACY_SESSION_SCHEMA_VERSION,
  abandonValidationSession,
  beginFixerTransaction,
  checkpointValidationSession,
  completeFixerTransaction,
  completeValidationSession,
  heartbeatLoop,
  heartbeatRegister,
  heartbeatBeat,
  heartbeatStop,
  inspectActiveValidationSession,
  main,
  openValidationSession,
  parseArgs,
  sessionLiveness,
  tryAcquireOpenLock,
  validationStatusSnapshot,
};
