/**
 * Tests for durable validation sessions and interrupted-fixer recovery.
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

    const resumed = openValidationSession(identity(repo));
    assert.strictEqual(resumed.status, 'resumed');
    assert.strictEqual(resumed.runDir, created.runDir);
    assert.strictEqual(resumed.state.runId, created.state.runId);
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

test('persists a completed review boundary and rejects unexplained tree drift', () => {
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
    });
    assert.strictEqual(checkpoint.stage, 'review-batch-complete');
    assert.strictEqual(checkpoint.coordinatorFile, 'coordinator-iter1.json');

    const resumed = openValidationSession(identity(repo));
    assert.strictEqual(resumed.state.stage, 'review-batch-complete');
    assert.strictEqual(resumed.state.iteration, 1);

    write(path.join(repo.root, 'src.txt'), 'external mutation\n');
    assert.throws(
      () => openValidationSession(identity(repo)),
      /worktree changed outside a recorded validation transition/
    );
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

test('quarantines and rolls back an interrupted runner-owned fixer', () => {
  const helper = require(HELPER);
  const repo = fixture();
  try {
    const session = checkpointInitialReview(helper, repo);
    const envelopeFile = path.join(session.runDir, 'repair-envelope-iter1.json');
    write(envelopeFile, JSON.stringify({ iteration: 1, findings: ['security-reviewer-iter1-1'] }));
    helper.beginFixerTransaction(session.runDir, { iteration: 1, envelopeFile });

    write(path.join(repo.root, 'src.txt'), 'half fixed\n');
    write(path.join(repo.root, 'partial.txt'), 'unfinished\n');

    const resumed = helper.openValidationSession({ ...identity(repo), runnerMode: true });
    assert.strictEqual(resumed.status, 'recovered');
    assert.strictEqual(resumed.state.stage, 'fixer-prepared');
    assert.strictEqual(resumed.recovery.action, 'rerun-fixer');
    assert.strictEqual(fs.readFileSync(path.join(repo.root, 'src.txt'), 'utf8'), 'implementation\n');
    assert.ok(!fs.existsSync(path.join(repo.root, 'partial.txt')));
    assert.ok(fs.existsSync(path.join(session.runDir, resumed.recovery.quarantinePatch)));
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

test('preserves an interrupted manual fixer until recovery is authorized', () => {
  const helper = require(HELPER);
  const repo = fixture();
  try {
    const session = checkpointInitialReview(helper, repo);
    const envelopeFile = path.join(session.runDir, 'repair-envelope-iter1.json');
    write(envelopeFile, JSON.stringify({ iteration: 1, findings: ['security-reviewer-iter1-1'] }));
    helper.beginFixerTransaction(session.runDir, { iteration: 1, envelopeFile });
    write(path.join(repo.root, 'src.txt'), 'half fixed\n');

    const resumed = helper.openValidationSession(identity(repo));
    assert.strictEqual(resumed.status, 'needs-recovery');
    assert.strictEqual(resumed.state.stage, 'fixer-inflight');
    assert.strictEqual(fs.readFileSync(path.join(repo.root, 'src.txt'), 'utf8'), 'half fixed\n');
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

test('rolls back an interrupted manual fixer only after explicit authorization', () => {
  const helper = require(HELPER);
  const repo = fixture();
  try {
    const session = checkpointInitialReview(helper, repo);
    const envelopeFile = path.join(session.runDir, 'repair-envelope-iter1.json');
    write(envelopeFile, JSON.stringify({ iteration: 1, findings: ['security-reviewer-iter1-1'] }));
    helper.beginFixerTransaction(session.runDir, { iteration: 1, envelopeFile });
    write(path.join(repo.root, 'src.txt'), 'half fixed\n');

    const recovered = helper.openValidationSession({
      ...identity(repo),
      recoverPartialFixer: true,
    });
    assert.strictEqual(recovered.status, 'recovered');
    assert.strictEqual(recovered.state.stage, 'fixer-prepared');
    assert.strictEqual(fs.readFileSync(path.join(repo.root, 'src.txt'), 'utf8'), 'implementation\n');
    assert.ok(fs.existsSync(path.join(session.runDir, recovered.recovery.quarantinePatch)));
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
      }),
      /invalid validation stage transition/
    );
    assert.throws(
      () => helper.checkpointValidationSession(created.runDir, {
        expectedStage: 'initial-audit-pending',
        nextStage: 'review-batch-complete',
        iteration: 2,
        coordinatorFile: complete,
      }),
      /iteration/
    );
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

test('adopts a completed fixer result as the next durable recovery boundary', () => {
  const helper = require(HELPER);
  const repo = fixture();
  try {
    const session = checkpointInitialReview(helper, repo);
    const envelopeFile = path.join(session.runDir, 'repair-envelope-iter1.json');
    write(envelopeFile, JSON.stringify({ iteration: 1, findings: ['security-reviewer-iter1-1'] }));
    helper.beginFixerTransaction(session.runDir, { iteration: 1, envelopeFile });
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
    });
    assert.strictEqual(completed.stage, 'fixer-result-ready');
    assert.notStrictEqual(completed.expectedTree, completed.fixer.preSnapshot.tree);

    const resumed = helper.openValidationSession(identity(repo));
    assert.strictEqual(resumed.status, 'resumed');
    assert.strictEqual(resumed.state.stage, 'fixer-result-ready');
    assert.strictEqual(fs.readFileSync(path.join(repo.root, 'src.txt'), 'utf8'), 'fixed\n');
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

test('reconciles one idempotent unworked-findings report after a completion-boundary crash', () => {
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

    const resumed = helper.openValidationSession(identity(repo));
    assert.strictEqual(resumed.status, 'resumed');
    assert.strictEqual(resumed.state.unworkedArtifact, path.relative(repo.root, first.written));
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
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

process.on('exit', () => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
});
