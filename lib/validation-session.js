#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { writeJsonSyncAtomic } = require('./atomic-write');

const SESSION_SCHEMA_VERSION = 1;
const TASK_ID = /^(?:TASK-[0-9]+|manual-validation)$/;
const CHECKPOINT_TRANSITIONS = new Set([
  'initial-audit-pending->review-batch-complete',
  'fixer-result-ready->review-batch-complete',
  'fixer-result-ready->gates-complete',
  'gates-complete->review-batch-complete',
]);
// The open critical section is sub-second; a lock older than this was left
// by a crashed open and is safe to reap.
const LOCK_STALE_MS = 5 * 60 * 1000;
// An incomplete session whose .validation-session.json heartbeat is older
// than this is considered abandoned by its orchestration and may be resumed.
// Iterations checkpoint regularly, so a live session always refreshes it.
const SESSION_STALE_DEFAULT_MS = 2 * 60 * 60 * 1000;

function sessionStaleMs() {
  const raw = Number(process.env.GROUNDWORK_VALIDATION_STALE_MS);
  return Number.isSafeInteger(raw) && raw > 0 ? raw : SESSION_STALE_DEFAULT_MS;
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
  if (state.version !== SESSION_SCHEMA_VERSION || state.runId !== path.basename(absolute).slice(22)) {
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

function validationStatusSnapshot(runDir) {
  const loaded = loadSession(runDir);
  const snapshot = {
    iteration: loaded.state.iteration,
    stage: loaded.state.stage,
    updatedAt: loaded.state.updatedAt || null,
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

function sessionPaths(identity) {
  const projectKey = sha256(identity.project).slice(0, 16);
  const taskKey = sha256(`${identity.taskId}\0${identity.branch}`).slice(0, 16);
  const parent = path.join(identity.commonDir, 'groundwork', 'validation', projectKey, taskKey);
  assertNoSymlinkComponents(identity.commonDir, parent);
  return { parent, activeFile: path.join(parent, 'active.json'), lockFile: path.join(parent, 'active.lock') };
}

/**
 * Probe whether a lock's holder process is alive. Same-host pids only: a
 * foreign host cannot be probed, so its locks are treated as unowned.
 *
 * @param {object} lock - Parsed lockfile JSON (pid, host)
 * @param {Function} kill - Liveness probe, (pid, signal) => void; defaults
 *   to process.kill. Injectable like createWorktreeIdentity({execGit}) so
 *   tests can pin the EPERM/ESRH/success branches deterministically.
 * @returns {boolean} True when the holder is provably alive on this host
 */
function lockHolderAlive(lock, kill = process.kill) {
  if (lock && lock.host === os.hostname() && Number.isInteger(lock.pid)) {
    try {
      kill(lock.pid, 0);
      return true;
    } catch (error) {
      if (error.code === 'EPERM') return true;
      return false;
    }
  }
  return false;
}

/**
 * Serialize the open decision (exists-check → create/resume → pointer write)
 * with an O_EXCL lockfile so two concurrent opens cannot both create a run
 * and clobber the pointer. A lock left by a crashed open is reaped when its
 * holder pid is dead or it exceeds LOCK_STALE_MS.
 *
 * @param {string} parent - Slot directory (active.json/active.lock live here)
 * @param {string} lockFile - Absolute lockfile path
 * @param {Function} [kill] - Optional liveness probe injected into
 *   lockHolderAlive (tests); defaults to process.kill.
 * @returns {Function} release callback
 */
function tryAcquireOpenLock(parent, lockFile, kill) {
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt++) {
    let descriptor;
    try {
      descriptor = fs.openSync(lockFile, 'wx', 0o600);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    if (descriptor !== undefined) {
      try {
        fs.writeFileSync(descriptor, `${JSON.stringify({
          version: SESSION_SCHEMA_VERSION,
          pid: process.pid,
          host: os.hostname(),
          acquiredAt: new Date().toISOString(),
        })}\n`, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      return () => {
        try {
          fs.unlinkSync(lockFile);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      };
    }
    // Held: reap only when provably stale (dead holder or aged out).
    // The holder creates the lockfile (openSync 'wx') before writing its
    // JSON, so a competing open can observe an empty or unparseable file in
    // that window: fall back to the lstat age and treat a young unreadable
    // lock as held rather than reaping a live holder mid-write.
    let lock = null;
    let lockPresent = false;
    let lockStatAgeMs = null;
    try {
      const stat = fs.lstatSync(lockFile);
      if (stat.isFile() && !stat.isSymbolicLink()) {
        lockPresent = true;
        lockStatAgeMs = Date.now() - stat.mtimeMs;
        lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        // The holder released between our EEXIST and this read: not held.
        lockPresent = false;
      } else {
        // Unreadable or partially-written content: keep the lstat age so the
        // grace window below still applies (lock stays null).
      }
    }
    const recordedAt = lock && typeof lock.acquiredAt === 'string' ? Date.parse(lock.acquiredAt) : NaN;
    const ageMs = Number.isFinite(recordedAt)
      ? Date.now() - recordedAt
      : (lockPresent && lockStatAgeMs !== null ? lockStatAgeMs : null);
    const agedOut = ageMs !== null && ageMs > LOCK_STALE_MS;
    if (lockHolderAlive(lock, kill) && !agedOut) {
      throw new Error(
        `another validation open is in progress for this task (holder pid ${lock.pid}` +
          `${lock.host ? ` on ${lock.host}` : ''}); retry in a moment` +
          (agedOut ? '' : ' or remove a stale lock manually if the holder crashed')
      );
    }
    if (lockPresent && !Number.isFinite(recordedAt) && !agedOut) {
      throw new Error(
        'another validation open is in progress for this task (holder lock is unreadable);' +
          ' retry in a moment or remove a stale lock manually if the holder crashed'
      );
    }
    try {
      fs.unlinkSync(lockFile);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('could not acquire the validation open lock');
}

function assertSessionNotActivelyHeld(state, identity) {
  if (state.stage === 'validated') return;
  const updated = Date.parse(state.updatedAt || '');
  if (!Number.isFinite(updated)) return;
  const ageMs = Date.now() - updated;
  if (ageMs < sessionStaleMs()) {
    const minutes = Math.max(1, Math.round(ageMs / 60000));
    const windowMinutes = Math.round(sessionStaleMs() / 60000);
    throw new Error(
      `a validation session for ${identity.taskId} on branch ${identity.branch} is already active` +
        ` (run ${state.runId.slice(0, 8)}, stage ${state.stage}, last heartbeat ${minutes} min ago).` +
        ' Concurrent validations of the same task would interleave findings and checkpoints.' +
        ' If this is a continuation of your own validation run, re-open with --resume-run' +
        ` ${state.runId} (the full id is in your tracking notes). If that session crashed,` +
        ' wait out the staleness window' +
        ` (${windowMinutes} min, override with GROUNDWORK_VALIDATION_STALE_MS) or abandon it:` +
        ` node validation-session.js abandon --force --repo-root ${identity.repoRoot}` +
        ` --project-root ${identity.projectRoot} --worktree ${identity.worktreePath}` +
        ` --task-id ${identity.taskId} --branch ${identity.branch}`
    );
  }
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

function openValidationSession(input, kill) {
  const identity = resolveIdentity(input);
  const { parent, activeFile, lockFile } = sessionPaths(identity);
  const release = tryAcquireOpenLock(parent, lockFile, kill);
  try {
    return openLockedSession(identity, parent, activeFile, input.resumeRun);
  } finally {
    release();
  }
}

function openLockedSession(identity, parent, activeFile, resumeRun) {
  if (fs.existsSync(activeFile)) {
    const pointer = readJson(activeFile, 'active validation pointer');
    const runDir = resolveActiveRun(parent, pointer);
    const state = loadSession(runDir).state;
    if (!sameIdentity(state, identity)) {
      throw new Error('active validation session identity does not match this validation baseline');
    }
    const currentHead = execGit(identity.worktreePath, ['rev-parse', 'HEAD']);
    if (state.stage === 'validated' && currentHead !== state.startHead) {
      fs.unlinkSync(activeFile);
      return openLockedSession(identity, parent, activeFile, resumeRun);
    }
    // A fresh incomplete session is owned by a live orchestration. The owner
    // proves continuation by naming the run it previously opened; anyone
    // else must wait out the staleness window or abandon explicitly.
    // Completed sessions replay read-only for any caller.
    const continuation = typeof resumeRun === 'string' && resumeRun === state.runId;
    if (!continuation && state.stage !== 'validated') {
      assertSessionNotActivelyHeld(state, identity);
    }
    if (state.stage === 'fixer-inflight') {
      const recovered = {
        ...state,
        stage: 'fixer-prepared',
        updatedAt: new Date().toISOString(),
      };
      atomicWriteJson(path.join(runDir, '.validation-session.json'), recovered);
      return {
        status: 'recovered',
        runDir,
        findingsDir: runDir,
        state: recovered,
        recovery: { action: 'rerun-fixer' },
      };
    }
    return {
      status: state.stage === 'validated' ? 'completed' : 'resumed',
      runDir,
      findingsDir: runDir,
      state,
    };
  }

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
    coordinatorFile: null,
    coordinatorSha256: null,
    fixer: null,
    completed: null,
    // Initial heartbeat: a concurrent open in the pre-checkpoint window must
    // see this session as actively held, not resumable.
    updatedAt: new Date().toISOString(),
  };
  atomicWriteJson(path.join(runDir, '.validation-session.json'), state);
  atomicWriteJson(activeFile, { version: SESSION_SCHEMA_VERSION, runDir: runName });
  return { status: 'created', runDir, findingsDir: runDir, state };
}

/**
 * Abandon the active validation session for a task identity: remove the
 * pointer so the next open starts a fresh run. The read-check-unlink sequence
 * runs under the open lock so a concurrent open can never interleave its
 * pointer rewrite with the abandon. Refuses to remove an incomplete session
 * with a fresh heartbeat, and refuses a recorded identity mismatch, unless
 * --force is set — the escape hatch that clears a same-slot pointer recorded
 * at a different base, and treats a pointed run that fails to load or verify
 * (mutated or lost pinned artifact, deleted run directory) as an unrecoverable
 * stale pointer: only this slot's pointer is cleared, and the run directory
 * with its artifacts stays on disk for inspection.
 */
function abandonValidationSession(input, force, kill) {
  const identity = resolveIdentity(input);
  const { parent, activeFile, lockFile } = sessionPaths(identity);
  // Hold the open lock across the whole sequence: releasing the lockfile is
  // the holder's job (the release callback), never ours.
  const release = tryAcquireOpenLock(parent, lockFile, kill);
  try {
    if (fs.existsSync(activeFile)) {
      const pointer = readJson(activeFile, 'active validation pointer');
      try {
        const runDir = resolveActiveRun(parent, pointer);
        const state = loadSession(runDir).state;
        if (!sameIdentity(state, identity)) {
          throw new Error('active validation session identity does not match this validation baseline');
        }
        assertSessionNotActivelyHeld(state, identity);
      } catch (error) {
        // The loaded state feeds only these refusal guards, so under --force
        // it contributes nothing but the ability to throw. A run that cannot
        // be loaded or verified is unrecoverable stale state, and the refusal
        // message recommends exactly this command — swallow and clear.
        if (!force) throw error;
      }
      fs.unlinkSync(activeFile);
    }
  } finally {
    release();
  }
  return { status: 'abandoned', runDir: null };
}

function checkpointValidationSession(runDir, input) {
  const loaded = loadSession(runDir);
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
  const state = {
    ...loaded.state,
    stage: nextStage,
    iteration,
    coordinatorFile: coordinator.basename,
    coordinatorSha256: coordinator.sha256,
    updatedAt: new Date().toISOString(),
  };
  atomicWriteJson(loaded.stateFile, state);
  return state;
}

function beginFixerTransaction(runDir, input) {
  const loaded = loadSession(runDir);
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
  const state = {
    ...loaded.state,
    stage: 'fixer-inflight',
    fixer: {
      iteration,
      envelopeFile: envelope.basename,
      envelopeSha256: envelope.sha256,
      resultFile: null,
    },
    updatedAt: new Date().toISOString(),
  };
  atomicWriteJson(loaded.stateFile, state);
  return state;
}

function completeFixerTransaction(runDir, input) {
  const loaded = loadSession(runDir);
  if (loaded.state.stage !== 'fixer-inflight' || !loaded.state.fixer) {
    throw new Error(`cannot complete fixer from validation stage ${loaded.state.stage}`);
  }
  const iteration = Number(input.iteration);
  if (iteration !== loaded.state.fixer.iteration) {
    throw new Error('fixer result iteration does not match the active transaction');
  }
  const result = validateFixerResultFile(loaded.runDir, input.resultFile);
  const state = {
    ...loaded.state,
    stage: 'fixer-result-ready',
    fixer: {
      ...loaded.state.fixer,
      resultFile: result.basename,
      resultSha256: result.sha256,
    },
    updatedAt: new Date().toISOString(),
  };
  atomicWriteJson(loaded.stateFile, state);
  return state;
}

function requireMetric(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return number;
}

function completeValidationSession(runDir, input) {
  const loaded = loadSession(runDir);
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
  const completed = {
    iterations: requireMetric(input.iterations, 'iterations'),
    fixed: requireMetric(input.fixed, 'fixed'),
    unworked: requireMetric(input.unworked, 'unworked'),
    action,
    commit,
  };
  const state = {
    ...loaded.state,
    stage: 'validated',
    completed,
    updatedAt: new Date().toISOString(),
  };
  atomicWriteJson(loaded.stateFile, state);
  return state;
}

function parseArgs(argv) {
  const command = argv[0];
  if (!command) throw new Error('validation session command is required');
  const args = {};
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index];
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
    }));
  } else if (command === 'checkpoint') {
    const state = checkpointValidationSession(args.runDir, args);
    result = { status: 'checkpointed', stage: state.stage, iteration: state.iteration };
  } else if (command === 'begin-fixer') {
    const state = beginFixerTransaction(args.runDir, args);
    result = { status: 'fixer-started', stage: state.stage, iteration: state.iteration };
  } else if (command === 'complete-fixer') {
    const state = completeFixerTransaction(args.runDir, args);
    result = { status: 'fixer-completed', stage: state.stage, iteration: state.iteration };
  } else if (command === 'complete') {
    const state = completeValidationSession(args.runDir, args);
    result = { status: 'completed', stage: state.stage, completed: state.completed };
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
  abandonValidationSession,
  beginFixerTransaction,
  checkpointValidationSession,
  completeFixerTransaction,
  completeValidationSession,
  inspectActiveValidationSession,
  main,
  openValidationSession,
  parseArgs,
  validationStatusSnapshot,
};
