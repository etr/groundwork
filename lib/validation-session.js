#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SESSION_SCHEMA_VERSION = 1;
const TASK_ID = /^(?:TASK-[0-9]+|manual-validation)$/;
const CHECKPOINT_TRANSITIONS = new Set([
  'initial-audit-pending->review-batch-complete',
  'fixer-result-ready->review-batch-complete',
  'fixer-result-ready->gates-complete',
  'gates-complete->review-batch-complete',
]);

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
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`
  );
  const descriptor = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
}

function atomicWriteFile(file, value) {
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`
  );
  const descriptor = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, value);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
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

function captureWorktreeTree(worktreePath, scratchDir) {
  const index = path.join(
    scratchDir,
    `.validation-index.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`
  );
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    execGit(worktreePath, ['read-tree', 'HEAD'], { env });
    execGit(worktreePath, ['add', '-A', '--', '.'], { env });
    return execGit(worktreePath, ['write-tree'], { env });
  } finally {
    if (fs.existsSync(index)) fs.unlinkSync(index);
  }
}

function captureSnapshot(worktreePath, runDir, name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error('invalid snapshot name');
  const index = path.join(
    runDir,
    `.snapshot-index.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`
  );
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    const head = execGit(worktreePath, ['rev-parse', 'HEAD']);
    execGit(worktreePath, ['read-tree', head], { env });
    execGit(worktreePath, ['add', '-A', '--', '.'], { env });
    const tree = execGit(worktreePath, ['write-tree'], { env });
    const commit = execGit(worktreePath, ['commit-tree', tree, '-p', head], {
      env,
      input: `Groundwork validation snapshot ${name}\n`,
    });
    const patch = execGit(
      worktreePath,
      ['diff', '--binary', '--full-index', head, commit, '--'],
      { encoding: null }
    );
    const patchFile = `snapshot-${name}.patch`;
    atomicWriteFile(path.join(runDir, patchFile), patch);
    return {
      head,
      tree,
      commit,
      patchFile,
      patchSha256: sha256(patch),
    };
  } finally {
    if (fs.existsSync(index)) fs.unlinkSync(index);
  }
}

function restoreSnapshot(worktreePath, runDir, snapshot) {
  const head = execGit(worktreePath, ['rev-parse', 'HEAD']);
  if (head !== snapshot.head) throw new Error('cannot recover fixer after task HEAD changed');
  const patchPath = path.join(runDir, snapshot.patchFile);
  const patch = fs.readFileSync(patchPath);
  if (sha256(patch) !== snapshot.patchSha256) throw new Error('fixer recovery snapshot is corrupt');
  execGit(worktreePath, ['reset', '--hard', snapshot.head]);
  execGit(worktreePath, ['clean', '-fd']);
  if (patch.length) execGit(worktreePath, ['apply', '--binary', '--whitespace=nowarn', patchPath]);
  const restoredTree = captureWorktreeTree(worktreePath, runDir);
  if (restoredTree !== snapshot.tree) throw new Error('fixer recovery did not restore the pre-fix tree');
}

function expectedUnworkedArtifact(state) {
  const projectPrefix = state.project === '.' ? '' : `${state.project}/`;
  const taskSlug = state.taskId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${projectPrefix}specs/unworked_review_issues/${taskSlug}_validation_${state.runId}.md`;
}

function reconcileUnworkedArtifact(state, observedTree) {
  if (state.stage !== 'review-batch-complete' || observedTree === state.expectedTree) {
    return state;
  }
  const changed = execGit(
    state.worktreePath,
    ['diff-tree', '-r', '--name-only', '-z', state.expectedTree, observedTree, '--'],
    { encoding: null }
  ).toString('utf8').split('\0').filter(Boolean);
  const expected = expectedUnworkedArtifact(state);
  if (changed.length !== 1 || changed[0] !== expected) return state;
  return {
    ...state,
    expectedTree: observedTree,
    unworkedArtifact: expected,
    updatedAt: new Date().toISOString(),
  };
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
  for (const [label, snapshot] of [
    ['pre-fixer snapshot', state.fixer.preSnapshot],
    ['post-fixer snapshot', state.fixer.postSnapshot],
  ]) {
    if (snapshot) {
      verifyHashedArtifact(runDir, snapshot.patchFile, snapshot.patchSha256, label);
    }
  }
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

function sessionPaths(identity) {
  const projectKey = sha256(identity.project).slice(0, 16);
  const taskKey = sha256(`${identity.taskId}\0${identity.branch}`).slice(0, 16);
  const parent = path.join(identity.commonDir, 'groundwork', 'validation', projectKey, taskKey);
  assertNoSymlinkComponents(identity.commonDir, parent);
  return { parent, activeFile: path.join(parent, 'active.json') };
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

function openValidationSession(input) {
  const identity = resolveIdentity(input);
  const { parent, activeFile } = sessionPaths(identity);
  if (fs.existsSync(activeFile)) {
    const pointer = readJson(activeFile, 'active validation pointer');
    const runDir = resolveActiveRun(parent, pointer);
    const state = loadSession(runDir).state;
    if (!sameIdentity(state, identity)) {
      throw new Error('active validation session identity does not match this validation baseline');
    }
    const observedTree = captureWorktreeTree(identity.worktreePath, runDir);
    if (state.stage === 'validated' && observedTree !== state.expectedTree) {
      fs.unlinkSync(activeFile);
      return openValidationSession(input);
    }
    if (state.stage === 'fixer-inflight') {
      const preFix = state.fixer && state.fixer.preSnapshot;
      if (!preFix) throw new Error('fixer-inflight session is missing its recovery snapshot');
      if (observedTree === preFix.tree) {
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
          recovery: { action: 'rerun-fixer', quarantinePatch: null },
        };
      }
      if (!input.runnerMode && !input.recoverPartialFixer) {
        return {
          status: 'needs-recovery',
          runDir,
          findingsDir: runDir,
          state,
          recovery: { action: 'authorize-rollback' },
        };
      }
      const quarantineName = `quarantine-iter${state.fixer.iteration}-${Date.now()}`;
      const quarantine = captureSnapshot(identity.worktreePath, runDir, quarantineName);
      restoreSnapshot(identity.worktreePath, runDir, preFix);
      const recovered = {
        ...state,
        stage: 'fixer-prepared',
        expectedTree: preFix.tree,
        recoveries: [
          ...(Array.isArray(state.recoveries) ? state.recoveries : []),
          { at: new Date().toISOString(), quarantine },
        ],
        updatedAt: new Date().toISOString(),
      };
      atomicWriteJson(path.join(runDir, '.validation-session.json'), recovered);
      return {
        status: 'recovered',
        runDir,
        findingsDir: runDir,
        state: recovered,
        recovery: { action: 'rerun-fixer', quarantinePatch: quarantine.patchFile },
      };
    }
    const reconciled = reconcileUnworkedArtifact(state, observedTree);
    if (reconciled !== state) {
      atomicWriteJson(path.join(runDir, '.validation-session.json'), reconciled);
      state.expectedTree = reconciled.expectedTree;
      state.unworkedArtifact = reconciled.unworkedArtifact;
      state.updatedAt = reconciled.updatedAt;
    }
    if (observedTree !== state.expectedTree) {
      throw new Error('worktree changed outside a recorded validation transition');
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
    expectedTree: captureWorktreeTree(identity.worktreePath, runDir),
    coordinatorFile: null,
    coordinatorSha256: null,
    fixer: null,
    completed: null,
  };
  atomicWriteJson(path.join(runDir, '.validation-session.json'), state);
  atomicWriteJson(activeFile, { version: SESSION_SCHEMA_VERSION, runDir: runName });
  return { status: 'created', runDir, findingsDir: runDir, state };
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
  const observedTree = captureWorktreeTree(loaded.state.worktreePath, loaded.runDir);
  if (observedTree !== loaded.state.expectedTree) {
    throw new Error('worktree changed outside a recorded validation transition');
  }
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
  const observedTree = captureWorktreeTree(loaded.state.worktreePath, loaded.runDir);
  if (observedTree !== loaded.state.expectedTree) {
    throw new Error('worktree changed before fixer transaction began');
  }
  const preSnapshot = captureSnapshot(
    loaded.state.worktreePath,
    loaded.runDir,
    `pre-fixer-iter${iteration}`
  );
  const state = {
    ...loaded.state,
    stage: 'fixer-inflight',
    fixer: {
      iteration,
      envelopeFile: envelope.basename,
      envelopeSha256: envelope.sha256,
      preSnapshot,
      resultFile: null,
      postSnapshot: null,
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
  const postSnapshot = captureSnapshot(
    loaded.state.worktreePath,
    loaded.runDir,
    `post-fixer-iter${iteration}`
  );
  const state = {
    ...loaded.state,
    stage: 'fixer-result-ready',
    expectedTree: postSnapshot.tree,
    fixer: {
      ...loaded.state.fixer,
      resultFile: result.basename,
      resultSha256: result.sha256,
      postSnapshot,
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
  const observedTree = captureWorktreeTree(loaded.state.worktreePath, loaded.runDir);
  const reconciled = reconcileUnworkedArtifact(loaded.state, observedTree);
  if (observedTree !== reconciled.expectedTree) {
    throw new Error('worktree changed before validation completion');
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
    ...reconciled,
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
    if (arg === '--runner-mode' || arg === '--recover-partial-fixer') {
      const key = arg === '--runner-mode' ? 'runnerMode' : 'recoverPartialFixer';
      args[key] = true;
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
      recoverPartialFixer: args.recoverPartialFixer,
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
  beginFixerTransaction,
  checkpointValidationSession,
  captureWorktreeTree,
  completeFixerTransaction,
  completeValidationSession,
  inspectActiveValidationSession,
  main,
  openValidationSession,
  parseArgs,
};
