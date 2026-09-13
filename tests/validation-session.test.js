/**
 * Tests for durable validation sessions and restartable fixer coordination.
 *
 * Run with: node tests/validation-session.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const HELPER = path.resolve(__dirname, '..', 'lib', 'validation-session.js');
const PERSIST_HELPER = path.resolve(__dirname, '..', 'lib', 'persist-unworked-findings.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.stack || error.message}`);
    failed++;
  }
}

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'groundwork-validation-session-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test User');
  write(path.join(root, 'specs', 'tasks.md'), '### TASK-075: Durable validation\n');
  write(path.join(root, 'src.txt'), 'base\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  git(root, 'switch', '-c', 'task/TASK-075');
  write(path.join(root, 'src.txt'), 'implementation\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'implementation');
  return {
    root,
    commonDir: fs.realpathSync(path.resolve(root, git(root, 'rev-parse', '--git-common-dir'))),
    baseHead: git(root, 'rev-parse', 'main'),
    startHead: git(root, 'rev-parse', 'HEAD'),
  };
}

function identity(repo) {
  return {
    repoRoot: repo.root,
    projectRoot: repo.root,
    worktreePath: repo.root,
    taskId: 'TASK-075',
    branch: 'task/TASK-075',
    baseHead: repo.baseHead,
    protocolVersion: 1,
  };
}

// Sequential re-opens within one orchestration prove continuation by naming
// the run they previously opened AND presenting its bearer capability.
function resume(repo, session, extra = {}) {
  return {
    ...identity(repo),
    resumeRun: session.state.runId,
    ownerToken: session.ownerToken,
    ...extra,
  };
}

function coordinatorState(iteration = 1, reviewMode = 'initial-audit') {
  return {
    iteration,
    review_mode: reviewMode,
    validation_baseline: { task: 'TASK-075', base: 'main' },
    finding_ledger: [],
    carried_approvals: [],
    disturbed_invariants: [],
    fixed_ids: [],
    findings_skipped: [],
    active_reviewers: ['code-quality-reviewer'],
    latest_manifest: `fixer-manifest-iter${iteration}.json`,
  };
}

function checkpointInitialReview(helper, repo) {
  const created = helper.openValidationSession(identity(repo));
  const coordinatorFile = path.join(created.runDir, 'coordinator-iter1.json');
  write(coordinatorFile, JSON.stringify(coordinatorState()));
  helper.checkpointValidationSession(created.runDir, {
    expectedStage: 'initial-audit-pending',
    nextStage: 'review-batch-complete',
    iteration: 1,
    coordinatorFile,
    ownerToken: created.ownerToken,
  });
  return created;
}

test('creates and resumes one durable session for the same validation identity', () => {
  assert.ok(fs.existsSync(HELPER), 'validation-session helper is missing');
  const { openValidationSession } = require(HELPER);
  const repo = fixture();
  try {
    const created = openValidationSession(identity(repo));
    assert.strictEqual(created.status, 'created');
    assert.strictEqual(created.state.stage, 'initial-audit-pending');
    assert.ok(created.runDir.startsWith(repo.commonDir + path.sep));
    assert.ok(created.ownerToken, 'open must return the owner capability');

    const resumed = openValidationSession(resume(repo, created));
    assert.strictEqual(resumed.status, 'resumed');
    assert.strictEqual(resumed.runDir, created.runDir);
    assert.strictEqual(resumed.state.runId, created.state.runId);
    assert.strictEqual(resumed.ownerToken, created.ownerToken);
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

test('refuses symlinked validation metadata directories', () => {
  const { openValidationSession } = require(HELPER);
  const repo = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'groundwork-validation-outside-'));
  try {
    const groundworkDir = path.join(repo.commonDir, 'groundwork');
    fs.mkdirSync(groundworkDir, { recursive: true });
    fs.symlinkSync(outside, path.join(groundworkDir, 'validation'));
    assert.throws(
      () => openValidationSession(identity(repo)),
      /symlink/
    );
    assert.deepStrictEqual(fs.readdirSync(outside), []);
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('persists a completed review boundary without policing worktree changes', () => {
  const { checkpointValidationSession, openValidationSession } = require(HELPER);
  const repo = fixture();
  try {
    const created = openValidationSession(identity(repo));
    const coordinatorFile = path.join(created.runDir, 'coordinator-iter1.json');
    write(coordinatorFile, JSON.stringify(coordinatorState()));
    const checkpoint = checkpointValidationSession(created.runDir, {
      expectedStage: 'initial-audit-pending',
      nextStage: 'review-batch-complete',
      iteration: 1,
      coordinatorFile,
      ownerToken: created.ownerToken,
    });
    assert.strictEqual(checkpoint.stage, 'review-batch-complete');
    assert.strictEqual(checkpoint.coordinatorFile, 'coordinator-iter1.json');

    const resumed = openValidationSession(resume(repo, created));
    assert.strictEqual(resumed.state.stage, 'review-batch-complete');
    assert.strictEqual(resumed.state.iteration, 1);

    write(path.join(repo.root, 'src.txt'), 'continued work\n');
    const continued = openValidationSession(resume(repo, created));
    assert.strictEqual(continued.status, 'resumed');
    assert.strictEqual(continued.state.stage, 'review-batch-complete');
    assert.ok(!Object.hasOwn(continued.state, 'expectedTree'));
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

test('projects the durable validation round stage and per-reviewer verdicts', () => {
  const helper = require(HELPER);
  const repo = fixture();
  try {
    const created = helper.openValidationSession(identity(repo));
    const coordinatorFile = path.join(created.runDir, 'coordinator-iter1.json');
    write(path.join(created.runDir, 'findings-code-quality-reviewer-iter1.json'), JSON.stringify({
      agent: 'code-quality-reviewer',
      iteration: 1,
      review_mode: 'initial-audit',
      verdict: 'approve',
      score: 100,
      summary: 'Approved.',
      findings: [],
    }));
    write(path.join(created.runDir, 'findings-security-reviewer-iter1.json'), JSON.stringify({
      agent: 'security-reviewer',
      iteration: 1,
      review_mode: 'initial-audit',
      verdict: 'request-changes',
      score: 80,
      summary: 'One blocker.',
      findings: [{ id: 'security-reviewer-iter1-1' }],
    }));
    write(coordinatorFile, JSON.stringify({
      ...coordinatorState(),
      active_reviewers: ['code-quality-reviewer', 'security-reviewer'],
      carried_approvals: [{ agent: 'architecture-alignment-checker', score: 100 }],
    }));
    helper.checkpointValidationSession(created.runDir, {
      expectedStage: 'initial-audit-pending',
      nextStage: 'review-batch-complete',
      iteration: 1,
      coordinatorFile,
      ownerToken: created.ownerToken,
    });

    const snapshot = helper.validationStatusSnapshot(created.runDir);

    assert.deepStrictEqual(snapshot.reviewers, [
      { name: 'architecture-alignment-checker', status: 'approve', carried: true },
      { name: 'code-quality-reviewer', status: 'approve', carried: false },
      { name: 'security-reviewer', status: 'request-changes', carried: false },
    ]);
    assert.strictEqual(snapshot.iteration, 1);
    assert.strictEqual(snapshot.stage, 'review-batch-complete');
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

test('rejects a coordinator artifact changed after its durable checkpoint', () => {
  const helper = require(HELPER);
  const repo = fixture();
  try {
    const session = checkpointInitialReview(helper, repo);
    write(path.join(session.runDir, 'coordinator-iter1.json'), JSON.stringify({
      ...coordinatorState(),
      finding_ledger: [{ id: 'forged-after-checkpoint' }],
    }));
    assert.throws(
      () => helper.openValidationSession(identity(repo)),
      /coordinator artifact changed after checkpoint/
    );
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

test('resumes an interrupted runner-owned fixer without snapshot or rollback', () => {
  const helper = require(HELPER);
  const repo = fixture();
  try {
    const session = checkpointInitialReview(helper, repo);
    const envelopeFile = path.join(session.runDir, 'repair-envelope-iter1.json');
    write(envelopeFile, JSON.stringify({ iteration: 1, findings: ['security-reviewer-iter1-1'] }));
    helper.beginFixerTransaction(session.runDir, { iteration: 1, envelopeFile, ownerToken: session.ownerToken });

    write(path.join(repo.root, 'src.txt'), 'half fixed\n');
    write(path.join(repo.root, 'partial.txt'), 'unfinished\n');

    const resumed = helper.openValidationSession(resume(repo, session, { runnerMode: true }));
    assert.strictEqual(resumed.status, 'recovered');
    assert.strictEqual(resumed.state.stage, 'fixer-prepared');
    assert.strictEqual(resumed.recovery.action, 'rerun-fixer');
    assert.deepStrictEqual(resumed.recovery, { action: 'rerun-fixer' });
    assert.strictEqual(fs.readFileSync(path.join(repo.root, 'src.txt'), 'utf8'), 'half fixed\n');
    assert.ok(fs.existsSync(path.join(repo.root, 'partial.txt')));
    assert.ok(!Object.hasOwn(resumed.state.fixer, 'preSnapshot'));
    assert.deepStrictEqual(
      fs.readdirSync(session.runDir).filter((name) => name.startsWith('snapshot-')),
      []
    );
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

test('resumes an interrupted manual fixer without rollback authorization', () => {
  const helper = require(HELPER);
  const repo = fixture();
  try {
    const session = checkpointInitialReview(helper, repo);
    const envelopeFile = path.join(session.runDir, 'repair-envelope-iter1.json');
    write(envelopeFile, JSON.stringify({ iteration: 1, findings: ['security-reviewer-iter1-1'] }));
    helper.beginFixerTransaction(session.runDir, { iteration: 1, envelopeFile, ownerToken: session.ownerToken });
    write(path.join(repo.root, 'src.txt'), 'half fixed\n');

    const resumed = helper.openValidationSession(resume(repo, session));
    assert.strictEqual(resumed.status, 'recovered');
    assert.strictEqual(resumed.state.stage, 'fixer-prepared');
    assert.strictEqual(resumed.recovery.action, 'rerun-fixer');
    assert.strictEqual(fs.readFileSync(path.join(repo.root, 'src.txt'), 'utf8'), 'half fixed\n');
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

test('rejects incomplete coordinator state and illegal stage transitions', () => {
  const helper = require(HELPER);
  const repo = fixture();
  try {
    const created = helper.openValidationSession(identity(repo));
    assert.throws(
      () => helper.completeValidationSession(created.runDir, {
        expectedStage: 'initial-audit-pending',
        iterations: 0,
        fixed: 0,
        unworked: 0,
        action: 'none',
        ownerToken: created.ownerToken,
      }),
      /cannot complete validation/
    );
    const incomplete = path.join(created.runDir, 'coordinator-incomplete.json');
    write(incomplete, JSON.stringify({ iteration: 1, review_mode: 'initial-audit' }));
    assert.throws(
      () => helper.checkpointValidationSession(created.runDir, {
        expectedStage: 'initial-audit-pending',
        nextStage: 'review-batch-complete',
        iteration: 1,
        coordinatorFile: incomplete,
        ownerToken: created.ownerToken,
      }),
      /validation_baseline/
    );

    const complete = path.join(created.runDir, 'coordinator-iter1.json');
    write(complete, JSON.stringify(coordinatorState()));
    assert.throws(
      () => helper.checkpointValidationSession(created.runDir, {
        expectedStage: 'initial-audit-pending',
        nextStage: 'gates-complete',
        iteration: 1,
        coordinatorFile: complete,
        ownerToken: created.ownerToken,
      }),
      /invalid validation stage transition/
    );
    assert.throws(
      () => helper.checkpointValidationSession(created.runDir, {
        expectedStage: 'initial-audit-pending',
        nextStage: 'review-batch-complete',
        iteration: 2,
        coordinatorFile: complete,
        ownerToken: created.ownerToken,
      }),
      /iteration/
    );
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

test('records a completed fixer result without snapshotting the worktree', () => {
  const helper = require(HELPER);
  const repo = fixture();
  try {
    const session = checkpointInitialReview(helper, repo);
    const envelopeFile = path.join(session.runDir, 'repair-envelope-iter1.json');
    write(envelopeFile, JSON.stringify({ iteration: 1, findings: ['security-reviewer-iter1-1'] }));
    helper.beginFixerTransaction(session.runDir, { iteration: 1, envelopeFile, ownerToken: session.ownerToken });
    write(path.join(repo.root, 'src.txt'), 'fixed\n');
    const resultFile = path.join(session.runDir, 'fixer-result-iter1.json');
    write(resultFile, JSON.stringify({
      status: 'fixed',
      files_touched: ['src.txt'],
      findings_fixed: ['security-reviewer-iter1-1'],
      findings_skipped: [],
      repair_claims: [{
        id: 'security-reviewer-iter1-1',
        root_cause: 'missing check',
        change: 'added check',
        evidence: ['focused test'],
      }],
      contracts_changed: [],
    }));
    const completed = helper.completeFixerTransaction(session.runDir, {
      iteration: 1,
      resultFile,
      ownerToken: session.ownerToken,
    });
    assert.strictEqual(completed.stage, 'fixer-result-ready');
    assert.ok(!Object.hasOwn(completed, 'expectedTree'));
    assert.ok(!Object.hasOwn(completed.fixer, 'preSnapshot'));
    assert.ok(!Object.hasOwn(completed.fixer, 'postSnapshot'));
    assert.deepStrictEqual(
      fs.readdirSync(session.runDir).filter((name) => name.startsWith('snapshot-')),
      []
    );

    const resumed = helper.openValidationSession(resume(repo, session));
    assert.strictEqual(resumed.status, 'resumed');
    assert.strictEqual(resumed.state.stage, 'fixer-result-ready');
    assert.strictEqual(fs.readFileSync(path.join(repo.root, 'src.txt'), 'utf8'), 'fixed\n');
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

test('accepts one idempotent unworked-findings report after a completion-boundary crash', () => {
  const helper = require(HELPER);
  const repo = fixture();
  try {
    const session = checkpointInitialReview(helper, repo);
    write(path.join(session.runDir, 'findings-code-quality-reviewer-iter1.json'), JSON.stringify({
      agent: 'code-quality-reviewer',
      iteration: 1,
      verdict: 'approve',
      findings: [{
        id: 1,
        severity: 'minor',
        category: 'cleanup',
        file: 'src.txt',
        line: 1,
        finding: 'Optional cleanup',
        recommendation: 'Polish later',
      }],
    }));
    const args = [
      PERSIST_HELPER,
      '--findings-dir', session.runDir,
      '--specs-dir', path.join(repo.root, 'specs'),
      '--task-id', 'TASK-075',
      '--fixed-ids', '',
      '--run-id', session.state.runId,
    ];
    const first = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
    const second = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
    assert.strictEqual(first.written, second.written);
    assert.strictEqual(
      path.basename(first.written),
      `task-075_validation_${session.state.runId}.md`
    );

    const resumed = helper.openValidationSession(resume(repo, session));
    assert.strictEqual(resumed.status, 'resumed');
    assert.strictEqual(resumed.state.stage, 'review-batch-complete');
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

test('replays a completed validation summary without restarting the audit', () => {
  const helper = require(HELPER);
  const repo = fixture();
  try {
    const session = checkpointInitialReview(helper, repo);
    const completed = helper.completeValidationSession(session.runDir, {
      expectedStage: 'review-batch-complete',
      iterations: 1,
      fixed: 0,
      unworked: 0,
      action: 'none',
      ownerToken: session.ownerToken,
    });
    assert.strictEqual(completed.stage, 'validated');

    const resumed = helper.openValidationSession(identity(repo));
    assert.strictEqual(resumed.status, 'completed');
    assert.deepStrictEqual(resumed.state.completed, {
      iterations: 1,
      fixed: 0,
      unworked: 0,
      action: 'none',
      commit: null,
    });
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

test('starts a new validation session after a completed task tree advances', () => {
  const helper = require(HELPER);
  const repo = fixture();
  try {
    const session = checkpointInitialReview(helper, repo);
    helper.completeValidationSession(session.runDir, {
      expectedStage: 'review-batch-complete',
      iterations: 1,
      fixed: 0,
      unworked: 0,
      action: 'none',
      ownerToken: session.ownerToken,
    });
    write(path.join(repo.root, 'later.txt'), 'later change\n');
    git(repo.root, 'add', '.');
    git(repo.root, 'commit', '-m', 'later change');

    const next = helper.openValidationSession(identity(repo));
    assert.strictEqual(next.status, 'created');
    assert.notStrictEqual(next.state.runId, session.state.runId);
    assert.strictEqual(next.state.startHead, git(repo.root, 'rev-parse', 'HEAD'));
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

test('exposes the durable session operations through a JSON CLI', () => {
  const repo = fixture();
  try {
    const result = spawnSync(process.execPath, [
      HELPER,
      'open',
      '--repo-root', repo.root,
      '--project-root', repo.root,
      '--worktree', repo.root,
      '--task-id', 'TASK-075',
      '--branch', 'task/TASK-075',
      '--base-head', repo.baseHead,
      '--protocol-version', '1',
      '--runner-mode',
    ], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.status, 'created');
    assert.strictEqual(parsed.stage, 'initial-audit-pending');
    assert.ok(parsed.run_dir.endsWith(parsed.findings_dir.split(path.sep).pop()));
    assert.ok(parsed.owner_token, 'open must return the owner capability to its caller');
    // The capability is never durable public state: the session file records
    // only its digest.
    const stateFile = path.join(parsed.run_dir, '.validation-session.json');
    const state = fs.readFileSync(stateFile, 'utf8');
    assert.ok(!state.includes(parsed.owner_token), 'raw capability leaked into session state');
    assert.ok(state.includes('tokenDigest'), 'session state must record the token digest');
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Capability ownership lifecycle — genuinely multi-process, deterministic
// file-marker barriers (see tests/helpers/validation-worker.js). No sleep is
// used as a correctness barrier: workers are released only after every
// participant signaled readiness, and time-based cases wait on their actual
// time condition (heartbeat freshness thresholds).
// ---------------------------------------------------------------------------

const WORKER = path.resolve(__dirname, 'helpers', 'validation-worker.js');
const { spawn } = require('child_process');
const { processAlive } = require(path.resolve(__dirname, '..', 'lib', 'process-identity.js'));

function sleepMs(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function waitFor(predicate, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${description}`);
    sleepMs(10);
  }
}

function spawnBarrierWorker(barrierDir, name, operation, env = {}) {
  const markers = {
    ready: path.join(barrierDir, `${name}.ready`),
    release: path.join(barrierDir, `${name}.release`),
    result: path.join(barrierDir, `${name}.result`),
  };
  const child = spawn(process.execPath, [WORKER], {
    env: {
      ...process.env,
      ...env,
      WORKER_OPERATION: JSON.stringify(operation),
      WORKER_READY: markers.ready,
      WORKER_RELEASE: markers.release,
      WORKER_RESULT: markers.result,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  return { child, ...markers };
}

function releaseAndAwait(workers, timeoutMs = 20000) {
  for (const worker of workers) fs.writeFileSync(worker.release, 'go\n');
  return workers.map((worker) => {
    waitFor(() => fs.existsSync(worker.result), timeoutMs, `${worker.release} result`);
    return JSON.parse(fs.readFileSync(worker.result, 'utf8'));
  });
}

function openOperation(repo, extra = {}) {
  return {
    op: 'open',
    repoRoot: repo.root,
    projectRoot: repo.root,
    worktreePath: repo.root,
    taskId: 'TASK-075',
    branch: 'task/TASK-075',
    baseHead: repo.baseHead,
    ...extra,
  };
}

function spawnHeartbeatWorker(runDir, ownerToken, env = {}) {
  // The capability travels on a private inherited fd — never argv or env.
  // It must be delivered synchronously: the test loops below block the
  // event loop with Atomics.wait, so an async pipe write to child.stdin
  // would never flush and the worker would starve on its blocking read.
  const capabilityFile = path.join(os.tmpdir(), `gw-capability-${process.pid}-${Date.now()}`);
  fs.writeFileSync(capabilityFile, `${ownerToken}\n`, { mode: 0o600 });
  const capabilityFd = fs.openSync(capabilityFile, 'r');
  try {
    return spawn(process.execPath, [
      HELPER, 'heartbeat-loop', '--run-dir', runDir,
    ], { env: { ...process.env, ...env }, stdio: [capabilityFd, 'ignore', 'inherit'] });
  } finally {
    fs.closeSync(capabilityFd);
    fs.rmSync(capabilityFile, { force: true });
  }
}

function heartbeatState(runDir) {
  return JSON.parse(fs.readFileSync(path.join(runDir, '.validation-session.json'), 'utf8'))
    .owner.heartbeat;
}

function killAndWait(child) {
  child.kill('SIGKILL');
  // The synchronous test loop blocks the event loop, so exit events never
  // fire — probe the pid directly instead of reading child.exitCode.
  waitFor(() => !processAlive(child.pid), 10000, 'worker exit');
}

describe('capability ownership lifecycle (multi-process)', () => {
  test('two processes racing open leave exactly one owner and one run pointer', () => {
    const repo = fixture();
    const barrier = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-validation-race-'));
    try {
      const first = spawnBarrierWorker(barrier, 'a', openOperation(repo));
      const second = spawnBarrierWorker(barrier, 'b', openOperation(repo));
      waitFor(() => fs.existsSync(first.ready), 15000, 'first ready');
      waitFor(() => fs.existsSync(second.ready), 15000, 'second ready');
      const [a, b] = releaseAndAwait([first, second]);

      const outcomes = [a, b];
      const created = outcomes.filter((r) => r.ok && r.result.status === 'created');
      const refused = outcomes.filter((r) => !r.ok);
      assert.strictEqual(created.length, 1, JSON.stringify(outcomes));
      assert.strictEqual(refused.length, 1, JSON.stringify(outcomes));
      assert.match(refused[0].error, /another validation open|already active/);

      const parent = path.dirname(created[0].result.runDir);
      const runs = fs.readdirSync(parent).filter((name) => name.startsWith('groundwork-validation-'));
      assert.strictEqual(runs.length, 1, 'exactly one run directory may survive the race');
      const pointer = JSON.parse(fs.readFileSync(path.join(parent, 'active.json'), 'utf8'));
      assert.strictEqual(pointer.runDir, runs[0]);
    } finally {
      fs.rmSync(barrier, { recursive: true, force: true });
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('a non-owner capability is rejected by every mutating operation', () => {
    const helper = require(HELPER);
    const repo = fixture();
    try {
      const created = helper.openValidationSession(identity(repo));
      const forged = 'f'.repeat(48);
      const coordinatorFile = path.join(created.runDir, 'coordinator-iter1.json');
      write(coordinatorFile, JSON.stringify(coordinatorState()));
      assert.throws(() => helper.checkpointValidationSession(created.runDir, {
        expectedStage: 'initial-audit-pending',
        nextStage: 'review-batch-complete',
        iteration: 1,
        coordinatorFile,
        ownerToken: forged,
      }), /capability does not match/);
      assert.throws(() => helper.beginFixerTransaction(created.runDir, {
        iteration: 1,
        envelopeFile: coordinatorFile,
        ownerToken: forged,
      }), /capability does not match/);
      assert.throws(() => helper.completeFixerTransaction(created.runDir, {
        iteration: 1,
        resultFile: coordinatorFile,
        ownerToken: forged,
      }), /capability does not match/);
      assert.throws(() => helper.completeValidationSession(created.runDir, {
        expectedStage: 'review-batch-complete',
        iterations: 1,
        fixed: 0,
        unworked: 0,
        action: 'none',
        ownerToken: forged,
      }), /capability does not match/);
      assert.throws(() => helper.heartbeatRegister(created.runDir, forged), /capability does not match/);
      assert.throws(() => helper.heartbeatBeat(created.runDir, forged), /capability does not match/);
      assert.throws(() => helper.heartbeatStop(created.runDir, forged), /capability does not match/);
      assert.throws(() => helper.openValidationSession({
        ...identity(repo),
        resumeRun: created.state.runId,
        ownerToken: forged,
      }), /capability does not match/);
      // A live owner cannot be abandoned or taken over, token or not.
      assert.throws(() => helper.abandonValidationSession(identity(repo), true), /cannot abandon a live/);
      const state = JSON.parse(fs.readFileSync(
        path.join(created.runDir, '.validation-session.json'), 'utf8'));
      assert.strictEqual(state.revision, created.state.revision, 'a rejected mutation must not change state');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('two authorized contenders serialize; the loser rereads and fails stage/revision', () => {
    const helper = require(HELPER);
    const repo = fixture();
    const barrier = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-validation-contend-'));
    try {
      const created = helper.openValidationSession(identity(repo));
      const coordinatorFile = path.join(created.runDir, 'coordinator-iter1.json');
      write(coordinatorFile, JSON.stringify(coordinatorState()));
      const operation = {
        op: 'checkpoint',
        runDir: created.runDir,
        expectedStage: 'initial-audit-pending',
        nextStage: 'review-batch-complete',
        iteration: 1,
        coordinatorFile,
        ownerToken: created.ownerToken,
      };
      const first = spawnBarrierWorker(barrier, 'a', operation);
      const second = spawnBarrierWorker(barrier, 'b', operation);
      waitFor(() => fs.existsSync(first.ready), 15000, 'first ready');
      waitFor(() => fs.existsSync(second.ready), 15000, 'second ready');
      const [a, b] = releaseAndAwait([first, second]);

      const successes = [a, b].filter((r) => r.ok);
      const failures = [a, b].filter((r) => !r.ok);
      assert.strictEqual(successes.length, 1, JSON.stringify([a, b]));
      assert.strictEqual(failures.length, 1, JSON.stringify([a, b]));
      assert.match(failures[0].error, /validation session stage is|revision/);

      const state = JSON.parse(fs.readFileSync(
        path.join(created.runDir, '.validation-session.json'), 'utf8'));
      assert.strictEqual(state.stage, 'review-batch-complete');
      assert.strictEqual(state.revision, created.state.revision + 1, 'exactly one transition may land');
    } finally {
      fs.rmSync(barrier, { recursive: true, force: true });
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('a live heartbeat worker keeps the session unreclaimable while beats advance', () => {
    const helper = require(HELPER);
    const repo = fixture();
    try {
      const created = helper.openValidationSession(identity(repo));
      const worker = spawnHeartbeatWorker(created.runDir, created.ownerToken, {
        GROUNDWORK_VALIDATION_BEAT_MS: '100',
      });
      try {
        waitFor(() => {
          const heartbeat = heartbeatState(created.runDir);
          return heartbeat.registered && heartbeat.pid === worker.pid;
        }, 15000, 'heartbeat registration');

        assert.throws(() => helper.openValidationSession(identity(repo)), /already active/);

        const before = heartbeatState(created.runDir).lastBeat;
        waitFor(() => heartbeatState(created.runDir).lastBeat !== before, 15000, 'beat advancement');
        const after = heartbeatState(created.runDir).lastBeat;
        assert.notStrictEqual(after, before, 'beats must advance while the worker is live');
        assert.throws(() => helper.openValidationSession(identity(repo)), /already active/);
      } finally {
        killAndWait(worker);
      }
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('heartbeat startup grace prevents immediate reclamation of a just-opened session', () => {
    const helper = require(HELPER);
    const repo = fixture();
    try {
      const created = helper.openValidationSession(identity(repo));
      assert.strictEqual(helper.sessionLiveness(created.state), 'grace');
      assert.throws(() => helper.openValidationSession(identity(repo)), /already active/);
      assert.throws(() => helper.abandonValidationSession(identity(repo), true), /cannot abandon a live/);
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('a crashed heartbeat worker becomes reclaimable after the stale threshold', () => {
    const helper = require(HELPER);
    const repo = fixture();
    const previousStale = process.env.GROUNDWORK_VALIDATION_STALE_MS;
    process.env.GROUNDWORK_VALIDATION_STALE_MS = '800';
    try {
      const created = helper.openValidationSession(identity(repo));
      const worker = spawnHeartbeatWorker(created.runDir, created.ownerToken, {
        GROUNDWORK_VALIDATION_BEAT_MS: '100',
      });
      waitFor(() => heartbeatState(created.runDir).registered, 15000, 'heartbeat registration');
      killAndWait(worker);

      waitFor(() => {
        const age = Date.now() - Date.parse(heartbeatState(created.runDir).lastBeat);
        return age >= 800;
      }, 10000, 'staleness threshold');
      // A stale owner must not be resumable even with the old capability:
      // the successor invalidates it at takeover.
      const reclaimed = helper.openValidationSession(identity(repo));
      assert.strictEqual(reclaimed.status, 'reclaimed');
      assert.strictEqual(reclaimed.state.owner.epoch, created.state.owner.epoch + 1);
      assert.notStrictEqual(reclaimed.ownerToken, created.ownerToken);
      assert.throws(() => helper.openValidationSession({
        ...identity(repo),
        resumeRun: created.state.runId,
        ownerToken: created.ownerToken,
      }), /capability does not match/);
    } finally {
      if (previousStale === undefined) delete process.env.GROUNDWORK_VALIDATION_STALE_MS;
      else process.env.GROUNDWORK_VALIDATION_STALE_MS = previousStale;
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('an old heartbeat worker cannot write after a successor takeover', () => {
    const helper = require(HELPER);
    const repo = fixture();
    try {
      const created = helper.openValidationSession(identity(repo));
      // Long beat interval so the worker stays registered but silent while
      // the takeover happens beneath it.
      const worker = spawnHeartbeatWorker(created.runDir, created.ownerToken, {
        GROUNDWORK_VALIDATION_BEAT_MS: '5000',
      });
      waitFor(() => heartbeatState(created.runDir).registered, 15000, 'heartbeat registration');

      const stateFile = path.join(created.runDir, '.validation-session.json');
      const frozen = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      frozen.owner.heartbeat.lastBeat = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      frozen.owner.heartbeat.graceUntil = new Date(Date.now() - 60 * 1000).toISOString();
      write(stateFile, JSON.stringify(frozen));

      const reclaimed = helper.openValidationSession(identity(repo));
      assert.strictEqual(reclaimed.status, 'reclaimed');
      const digestAfterTakeover = JSON.parse(fs.readFileSync(stateFile, 'utf8')).owner.tokenDigest;

      // The old worker's next beat (within ~5s) must fail authentication.
      waitFor(() => !processAlive(worker.pid), 12000, 'old worker exit');
      const finalState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.strictEqual(finalState.owner.tokenDigest, digestAfterTakeover);
      assert.strictEqual(finalState.owner.epoch, reclaimed.state.owner.epoch);
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('abandon never unlinks a successor pointer published mid-abandon', () => {
    const helper = require(HELPER);
    const repo = fixture();
    try {
      const created = helper.openValidationSession(identity(repo));
      const stateFile = path.join(created.runDir, '.validation-session.json');
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      state.owner.heartbeat.graceUntil = new Date(Date.now() - 60 * 1000).toISOString();
      state.owner.heartbeat.lastBeat = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      write(stateFile, JSON.stringify(state));

      const parent = path.dirname(created.runDir);
      const successorName = `groundwork-validation-${'b'.repeat(32)}`;
      fs.mkdirSync(path.join(parent, successorName));
      const activeFile = path.join(parent, 'active.json');

      assert.throws(
        () => helper.abandonValidationSession(identity(repo), true, undefined, {
          beforeUnlink: () => {
            // A successor open publishes between our stale observation and
            // our unlink: the reclaimer must abort, not remove it.
            write(activeFile, JSON.stringify({ version: 2, runDir: successorName }));
          },
        }),
        /pointer changed during abandon/
      );
      const pointer = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
      assert.strictEqual(pointer.runDir, successorName, 'the successor pointer was unlinked');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('fixer-inflight recovery requires the owner capability or a safe takeover', () => {
    const helper = require(HELPER);
    const repo = fixture();
    try {
      const created = helper.openValidationSession(identity(repo));
      const coordinatorFile = path.join(created.runDir, 'coordinator-iter1.json');
      write(coordinatorFile, JSON.stringify(coordinatorState()));
      helper.checkpointValidationSession(created.runDir, {
        expectedStage: 'initial-audit-pending',
        nextStage: 'review-batch-complete',
        iteration: 1,
        coordinatorFile,
        ownerToken: created.ownerToken,
      });
      const envelopeFile = path.join(created.runDir, 'repair-envelope-iter1.json');
      write(envelopeFile, JSON.stringify({ iteration: 1, findings: [] }));
      helper.beginFixerTransaction(created.runDir, {
        iteration: 1,
        envelopeFile,
        ownerToken: created.ownerToken,
      });

      // Naming the run id alone is not ownership.
      assert.throws(() => helper.openValidationSession({
        ...identity(repo),
        resumeRun: created.state.runId,
      }), /already active/);

      const recovered = helper.openValidationSession(resume(repo, created));
      assert.strictEqual(recovered.status, 'recovered');
      assert.strictEqual(recovered.state.stage, 'fixer-prepared');

      // An unauthenticated takeover of a live recovered session is refused;
      // after staleness it reclaims with a successor capability.
      helper.beginFixerTransaction(created.runDir, {
        iteration: 1,
        envelopeFile,
        ownerToken: created.ownerToken,
      });
      const stateFile = path.join(created.runDir, '.validation-session.json');
      const stale = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      stale.owner.heartbeat.graceUntil = new Date(Date.now() - 60 * 1000).toISOString();
      stale.owner.heartbeat.lastBeat = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      write(stateFile, JSON.stringify(stale));
      const reclaimed = helper.openValidationSession(identity(repo));
      assert.strictEqual(reclaimed.status, 'reclaimed');
      assert.strictEqual(reclaimed.state.stage, 'fixer-prepared');
      assert.deepStrictEqual(reclaimed.recovery, { action: 'rerun-fixer' });
      assert.notStrictEqual(reclaimed.ownerToken, created.ownerToken);
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('completed sessions replay read-only and reject further mutation', () => {
    const helper = require(HELPER);
    const repo = fixture();
    try {
      const session = checkpointInitialReview(helper, repo);
      helper.completeValidationSession(session.runDir, {
        expectedStage: 'review-batch-complete',
        iterations: 1,
        fixed: 0,
        unworked: 0,
        action: 'none',
        ownerToken: session.ownerToken,
      });
      const replayed = helper.openValidationSession(identity(repo));
      assert.strictEqual(replayed.status, 'completed');
      assert.strictEqual(replayed.state.stage, 'validated');
      assert.strictEqual(replayed.ownerToken, undefined);

      const coordinatorFile = path.join(session.runDir, 'coordinator-iter2.json');
      write(coordinatorFile, JSON.stringify(coordinatorState(1)));
      assert.throws(() => helper.checkpointValidationSession(session.runDir, {
        expectedStage: 'review-batch-complete',
        nextStage: 'gates-complete',
        iteration: 1,
        coordinatorFile,
        ownerToken: session.ownerToken,
      }), /validation session stage is validated/);
      assert.throws(() => helper.beginFixerTransaction(session.runDir, {
        iteration: 1,
        envelopeFile: coordinatorFile,
        ownerToken: session.ownerToken,
      }), /cannot begin fixer/);
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('version-1 boundary: completed v1 replays, incomplete v1 is never adopted', () => {
    const helper = require(HELPER);
    const repo = fixture();
    try {
      const created = helper.openValidationSession(identity(repo));
      const stateFile = path.join(created.runDir, '.validation-session.json');
      const coordinatorFile = path.join(created.runDir, 'coordinator-iter1.json');
      write(coordinatorFile, JSON.stringify(coordinatorState()));
      helper.checkpointValidationSession(created.runDir, {
        expectedStage: 'initial-audit-pending',
        nextStage: 'review-batch-complete',
        iteration: 1,
        coordinatorFile,
        ownerToken: created.ownerToken,
      });
      helper.completeValidationSession(created.runDir, {
        expectedStage: 'review-batch-complete',
        iterations: 1,
        fixed: 0,
        unworked: 0,
        action: 'none',
        ownerToken: created.ownerToken,
      });
      // Downgrade the completed record to the version-1 shape: still safely
      // readable, replay-only.
      const completed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      const legacy = { ...completed, version: 1 };
      delete legacy.revision;
      delete legacy.owner;
      write(stateFile, JSON.stringify(legacy));
      const replayed = helper.openValidationSession(identity(repo));
      assert.strictEqual(replayed.status, 'completed');
      assert.strictEqual(replayed.state.completed.iterations, 1);

      // An incomplete v1 session fails closed.
      const repo2 = fixture();
      try {
        const fresh = helper.openValidationSession(identity(repo2));
        const freshFile = path.join(fresh.runDir, '.validation-session.json');
        const legacyIncomplete = JSON.parse(fs.readFileSync(freshFile, 'utf8'));
        legacyIncomplete.version = 1;
        delete legacyIncomplete.revision;
        delete legacyIncomplete.owner;
        write(freshFile, JSON.stringify(legacyIncomplete));
        assert.throws(
          () => helper.openValidationSession(identity(repo2)),
          /version-1 validation session exists and is never adopted/
        );
        // Documented legacy recovery: force-abandon clears the wedged slot.
        helper.abandonValidationSession(identity(repo2), true);
        const next = helper.openValidationSession(identity(repo2));
        assert.strictEqual(next.status, 'created');
      } finally {
        fs.rmSync(repo2.root, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('capability material never leaks into state, output, or diagnostics', () => {
    const repo = fixture();
    try {
      const opened = spawnSync(process.execPath, [
        HELPER, 'open',
        '--repo-root', repo.root, '--project-root', repo.root, '--worktree', repo.root,
        '--task-id', 'TASK-075', '--branch', 'task/TASK-075',
        '--base-head', repo.baseHead, '--protocol-version', '1',
        // stdin must close: open optionally reads the resume capability from
        // it, and an open pipe with no writer would block the child forever.
      ], { input: '', encoding: 'utf8' });
      assert.strictEqual(opened.status, 0, opened.stderr);
      const token = JSON.parse(opened.stdout).owner_token;
      assert.ok(token, 'open returns the capability to its caller');

      const stateFile = path.join(JSON.parse(opened.stdout).run_dir, '.validation-session.json');
      const stateText = fs.readFileSync(stateFile, 'utf8');
      assert.ok(!stateText.includes(token), 'raw capability leaked into session state');

      const coordinatorFile = path.join(path.dirname(stateFile), 'coordinator-iter1.json');
      write(coordinatorFile, JSON.stringify(coordinatorState()));
      const checkpoint = spawnSync(process.execPath, [
        HELPER, 'checkpoint', '--run-dir', path.dirname(stateFile),
        '--expected-stage', 'initial-audit-pending', '--next-stage', 'review-batch-complete',
        '--iteration', '1', '--coordinator-file', coordinatorFile,
      ], { input: `${token}\n`, encoding: 'utf8' });
      assert.strictEqual(checkpoint.status, 0, checkpoint.stderr);
      assert.ok(!checkpoint.stdout.includes(token), 'capability leaked into mutation output');

      const forged = 'e'.repeat(48);
      const failed = spawnSync(process.execPath, [
        HELPER, 'checkpoint', '--run-dir', path.dirname(stateFile),
        '--expected-stage', 'review-batch-complete', '--next-stage', 'gates-complete',
        '--iteration', '1', '--coordinator-file', coordinatorFile,
      ], { input: `${forged}\n`, encoding: 'utf8' });
      assert.notStrictEqual(failed.status, 0);
      assert.ok(!failed.stderr.includes(forged), 'capability leaked into error diagnostics');
      assert.ok(!failed.stderr.includes(token), 'capability leaked into error diagnostics');

      const stop = spawnSync(process.execPath, [
        HELPER, 'heartbeat-stop', '--run-dir', path.dirname(stateFile),
      ], { input: `${token}\n`, encoding: 'utf8' });
      assert.strictEqual(stop.status, 0, stop.stderr);
      assert.ok(!stop.stdout.includes(token), 'capability leaked into heartbeat output');

      const helper = require(HELPER);
      const snapshot = JSON.stringify(helper.validationStatusSnapshot(path.dirname(stateFile)));
      assert.ok(!snapshot.includes(token), 'capability leaked into status snapshots');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });
});

describe('open-path mutation serialization (takeover vs old owner)', () => {
  test('an old owner publishing mid-mutation cannot resurrect its record after takeover', () => {
    const helper = require(HELPER);
    const { acquireOwnedLock } = require(path.resolve(__dirname, '..', 'lib', 'owned-lock.js'));
    const repo = fixture();
    const barrier = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-validation-oldowner-'));
    try {
      const created = helper.openValidationSession(identity(repo));
      const stateFile = path.join(created.runDir, '.validation-session.json');
      const stale = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      stale.owner.heartbeat.graceUntil = new Date(Date.now() - 60 * 1000).toISOString();
      stale.owner.heartbeat.lastBeat = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      write(stateFile, JSON.stringify(stale));
      // The computed revision the old owner will publish from mid-mutation:
      // captured from the pre-takeover (old-owner) state.
      const oldOwnerComputed = JSON.parse(JSON.stringify(stale));
      oldOwnerComputed.revision = stale.revision + 1;

      // The old owner is mid-mutation: it holds the run's mutation lock and
      // has the computed revision above in hand.
      const held = acquireOwnedLock(path.join(created.runDir, '.mutation.lock'));

      const taker = spawnBarrierWorker(barrier, 'taker', openOperation(repo));
      waitFor(() => fs.existsSync(taker.ready), 15000, 'taker ready');
      fs.writeFileSync(taker.release, 'go\n');

      // IPC state barrier: the taker holds the slot's open lock for the whole
      // open critical section, so its presence proves the taker is mid-open;
      // its result marker still being absent while the old owner holds the
      // mutation lock IS the fence — no wall-clock negative assertion.
      const openLock = path.join(path.dirname(created.runDir), 'active.lock');
      waitFor(() => fs.existsSync(openLock), 15000, 'taker entering the open critical section');
      assert.strictEqual(fs.existsSync(taker.result), false,
        'the taker completed while the old owner held the mutation lock');
      assert.strictEqual(
        JSON.parse(fs.readFileSync(stateFile, 'utf8')).owner.epoch,
        created.state.owner.epoch,
        'an unfenced takeover published while the old owner held the lock'
      );

      // The old owner publishes its computed revision regardless.
      write(stateFile, JSON.stringify(oldOwnerComputed));
      held.release();

      waitFor(() => fs.existsSync(taker.result), 20000, 'taker result');
      const outcome = JSON.parse(fs.readFileSync(taker.result, 'utf8'));
      assert.ok(outcome.ok, outcome.error);
      assert.strictEqual(outcome.result.status, 'reclaimed');

      const final = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.strictEqual(final.owner.epoch, created.state.owner.epoch + 1,
        'the old owner record was resurrected over the successor');
      assert.notStrictEqual(final.owner.tokenDigest, created.state.owner.tokenDigest,
        'the old capability digest outlived the takeover');
    } finally {
      fs.rmSync(barrier, { recursive: true, force: true });
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });
});

describe('heartbeat hot path (lightweight, authenticated)', () => {
  // Re-require the helper with a spawn-counting execFileSync so tests can
  // prove which paths spawn git. The wrapper is captured in the fresh module
  // instance's closure; the global is restored immediately after loading.
  function freshHelperCountingGitSpawns() {
    const cp = require('child_process');
    const realExecFileSync = cp.execFileSync;
    const counter = { gitSpawns: 0 };
    cp.execFileSync = function countingExecFileSync(command) {
      if (command === 'git') counter.gitSpawns++;
      return realExecFileSync.apply(cp, arguments);
    };
    try {
      delete require.cache[require.resolve(HELPER)];
      return { helper: require(HELPER), counter };
    } finally {
      cp.execFileSync = realExecFileSync;
    }
  }

  test('a beat updates liveness under the mutation lock without spawning git', () => {
    const { helper, counter } = freshHelperCountingGitSpawns();
    const repo = fixture();
    try {
      const created = helper.openValidationSession(identity(repo));
      helper.heartbeatRegister(created.runDir, created.ownerToken);
      sleepMs(10);
      counter.gitSpawns = 0;

      const stateFile = path.join(created.runDir, '.validation-session.json');
      const before = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      const beat = helper.heartbeatBeat(created.runDir, created.ownerToken);
      assert.strictEqual(counter.gitSpawns, 0, 'the beat path spawned git processes');
      const after = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.strictEqual(after.revision, before.revision + 1, 'the beat must bump the revision');
      assert.notStrictEqual(
        after.owner.heartbeat.lastBeat,
        before.owner.heartbeat.lastBeat,
        'the beat must advance lastBeat'
      );
      assert.strictEqual(beat.owner.heartbeat.lastBeat, after.owner.heartbeat.lastBeat);

      // Authentication is still enforced on every beat — no lightweight path
      // around the capability check.
      assert.throws(
        () => helper.heartbeatBeat(created.runDir, 'f'.repeat(48)),
        /capability does not match/
      );
      assert.strictEqual(counter.gitSpawns, 0);
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('a full mutation verifies the session once (no pre-lock full load)', () => {
    const { helper, counter } = freshHelperCountingGitSpawns();
    const repo = fixture();
    try {
      const created = helper.openValidationSession(identity(repo));
      const coordinatorFile = path.join(created.runDir, 'coordinator-iter1.json');
      write(coordinatorFile, JSON.stringify(coordinatorState()));
      counter.gitSpawns = 0;
      helper.checkpointValidationSession(created.runDir, {
        expectedStage: 'initial-audit-pending',
        nextStage: 'review-batch-complete',
        iteration: 1,
        coordinatorFile,
        ownerToken: created.ownerToken,
      });
      // One loadSession inside the lock = exactly one git spawn. The old
      // pre-lock full load doubled it.
      assert.strictEqual(counter.gitSpawns, 1,
        'a mutation must pay the verification cost once, not twice');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });
});

describe('heartbeat lease survives lock contention (dedicated worker keeps the lease)', () => {
  const { acquireOwnedLock } = require(path.resolve(__dirname, '..', 'lib', 'owned-lock.js'));

  test('a heartbeat beat survives a mutation lock held beyond the acquire timeout', () => {
    const helper = require(HELPER);
    const repo = fixture();
    const barrier = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-validation-contention-'));
    try {
      const created = helper.openValidationSession(identity(repo));
      const before = heartbeatState(created.runDir).lastBeat;

      // A contender holds the run's mutation lock well beyond the beat's
      // acquire timeout (300ms via env) — the heartbeat must keep trying.
      const held = acquireOwnedLock(path.join(created.runDir, '.mutation.lock'));
      const worker = spawnBarrierWorker(barrier, 'beat', {
        op: 'heartbeat-beat',
        runDir: created.runDir,
        ownerToken: created.ownerToken,
      }, {
        GROUNDWORK_MUTATION_LOCK_WAIT_MS: '300',
        GROUNDWORK_HEARTBEAT_LOCK_PATIENCE_MS: '30000',
      });
      waitFor(() => fs.existsSync(worker.ready), 15000, 'beat worker ready');
      fs.writeFileSync(worker.release, 'go\n');

      // Contention observed: past the acquire timeout (300ms here, 5s by
      // default) the worker is still in the game — no result marker, no exit,
      // lease intact. The hold outlasts even the default 5s acquire deadline.
      sleepMs(5200);
      assert.strictEqual(fs.existsSync(worker.result), false,
        'the heartbeat gave up while the mutation lock was merely contended');
      held.release();

      waitFor(() => fs.existsSync(worker.result), 20000, 'beat result');
      const outcome = JSON.parse(fs.readFileSync(worker.result, 'utf8'));
      assert.ok(outcome.ok, `the contended heartbeat beat failed: ${outcome.error}`);
      const after = heartbeatState(created.runDir).lastBeat;
      assert.notStrictEqual(after, before, 'the beat did not advance after contention cleared');
    } finally {
      fs.rmSync(barrier, { recursive: true, force: true });
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('a crashed heartbeat worker is detected by process identity, not just age', () => {
    const helper = require(HELPER);
    const repo = fixture();
    try {
      const created = helper.openValidationSession(identity(repo));
      const worker = spawnHeartbeatWorker(created.runDir, created.ownerToken, {
        GROUNDWORK_VALIDATION_BEAT_MS: '100',
      });
      waitFor(() => heartbeatState(created.runDir).registered, 15000, 'heartbeat registration');
      killAndWait(worker);

      // The last beat is fresh, but the registered worker is provably gone:
      // liveness must follow the recorded process identity immediately.
      const stateFile = path.join(created.runDir, '.validation-session.json');
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.strictEqual(helper.sessionLiveness(state), 'stale');
      const reclaimed = helper.openValidationSession(identity(repo));
      assert.strictEqual(reclaimed.status, 'reclaimed');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('host identity decides heartbeat liveness: dead, mismatched, foreign, malformed', () => {
    const helper = require(HELPER);
    const now = new Date().toISOString();
    const liveHeartbeat = {
      registered: true,
      pid: process.pid,
      host: os.hostname(),
      processStart: require(path.resolve(__dirname, '..', 'lib', 'process-identity.js'))
        .processStartIdentity(process.pid),
      startedAt: now,
      lastBeat: now,
      graceUntil: now,
      stopped: false,
    };
    const withHeartbeat = (overrides) => ({
      stage: 'review-batch-complete',
      owner: { terminal: false, heartbeat: { ...liveHeartbeat, ...overrides } },
    });

    // Fresh beat, same host, provably dead pid: stale.
    assert.strictEqual(helper.sessionLiveness(withHeartbeat({ pid: 424242, processStart: 'proc:1' })), 'stale');
    // Fresh beat, live pid, but a different process instance (start mismatch): stale.
    assert.strictEqual(helper.sessionLiveness(withHeartbeat({ processStart: 'proc:not-this-one' })), 'stale');
    // Fresh beat on a foreign host: never probed, never reaped while young.
    assert.strictEqual(helper.sessionLiveness(withHeartbeat({ host: 'definitely-not-this-host' })), 'live');
    // Malformed identity (no processStart, non-integer pid): undecidable, so
    // the recorded fresh beat governs — the session is not reaped.
    assert.strictEqual(helper.sessionLiveness(withHeartbeat({ pid: 'not-a-pid', processStart: undefined })), 'live');
  });

  test('an unreadable session state fails the heartbeat closed without mutation', () => {
    const helper = require(HELPER);
    const repo = fixture();
    try {
      const created = helper.openValidationSession(identity(repo));
      const stateFile = path.join(created.runDir, '.validation-session.json');
      fs.chmodSync(stateFile, 0o000);
      assert.throws(() => helper.heartbeatBeat(created.runDir, created.ownerToken));
      fs.chmodSync(stateFile, 0o600);
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.strictEqual(state.revision, created.state.revision, 'state changed under an unreadable beat');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });
});

describe('capability transport and storage hardening', () => {
  test('the owner capability is rejected on the command line and accepted on stdin', () => {
    const helper = require(HELPER);
    const repo = fixture();
    try {
      const created = helper.openValidationSession(identity(repo));

      // argv would leak the bearer capability to every ps on the host.
      const argvLeak = spawnSync(process.execPath, [
        HELPER, 'heartbeat-beat', '--run-dir', created.runDir, '--owner-token', created.ownerToken,
      ], { encoding: 'utf8' });
      assert.notStrictEqual(argvLeak.status, 0, 'a capability on the command line was accepted');
      assert.match(argvLeak.stderr, /stdin/i, argvLeak.stderr);

      const piped = spawnSync(process.execPath, [
        HELPER, 'heartbeat-beat', '--run-dir', created.runDir,
      ], { input: `${created.ownerToken}\n`, encoding: 'utf8' });
      assert.strictEqual(piped.status, 0, piped.stderr);
      assert.ok(JSON.parse(piped.stdout).status === 'heartbeat');

      const sentinel = created.ownerToken;
      // The piped form must also not echo the capability back.
      assert.ok(!piped.stdout.includes(sentinel), 'the beat echoed the capability');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('the runner capability store is re-chmodded to 0600 on every replacement', () => {
    const helper = require(HELPER);
    const repo = fixture();
    try {
      const created = helper.openValidationSession({ ...identity(repo), runnerMode: true });
      const capabilityFile = path.join(path.dirname(created.runDir), 'runner-capability.json');
      assert.strictEqual(fs.statSync(capabilityFile).mode & 0o777, 0o600);

      // A pre-existing permissive file must be tightened again on replace.
      fs.chmodSync(capabilityFile, 0o644);
      const stateFile = path.join(created.runDir, '.validation-session.json');
      const stale = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      stale.owner.heartbeat.graceUntil = new Date(Date.now() - 60 * 1000).toISOString();
      stale.owner.heartbeat.lastBeat = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      write(stateFile, JSON.stringify(stale));
      const reclaimed = helper.openValidationSession({ ...identity(repo), runnerMode: true });
      assert.strictEqual(reclaimed.status, 'reclaimed');
      assert.strictEqual(
        fs.statSync(capabilityFile).mode & 0o777,
        0o600,
        'a replaced capability store kept its loose mode'
      );
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('the capability is never read from the environment', () => {
    const source = fs.readFileSync(HELPER, 'utf8');
    assert.doesNotMatch(source, /env\.[A-Z_]*OWNER/i, 'the capability must not come from env');
    assert.doesNotMatch(source, /OWNER_TOKEN\s*=/, 'no OWNER_TOKEN environment contract is read');
  });
});

process.on('exit', () => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
});
