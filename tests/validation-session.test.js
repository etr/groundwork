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
    });
    assert.strictEqual(checkpoint.stage, 'review-batch-complete');
    assert.strictEqual(checkpoint.coordinatorFile, 'coordinator-iter1.json');

    const resumed = openValidationSession(identity(repo));
    assert.strictEqual(resumed.state.stage, 'review-batch-complete');
    assert.strictEqual(resumed.state.iteration, 1);

    write(path.join(repo.root, 'src.txt'), 'continued work\n');
    const continued = openValidationSession(identity(repo));
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
    helper.beginFixerTransaction(session.runDir, { iteration: 1, envelopeFile });

    write(path.join(repo.root, 'src.txt'), 'half fixed\n');
    write(path.join(repo.root, 'partial.txt'), 'unfinished\n');

    const resumed = helper.openValidationSession({ ...identity(repo), runnerMode: true });
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
    helper.beginFixerTransaction(session.runDir, { iteration: 1, envelopeFile });
    write(path.join(repo.root, 'src.txt'), 'half fixed\n');

    const resumed = helper.openValidationSession(identity(repo));
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

test('records a completed fixer result without snapshotting the worktree', () => {
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
    assert.ok(!Object.hasOwn(completed, 'expectedTree'));
    assert.ok(!Object.hasOwn(completed.fixer, 'preSnapshot'));
    assert.ok(!Object.hasOwn(completed.fixer, 'postSnapshot'));
    assert.deepStrictEqual(
      fs.readdirSync(session.runDir).filter((name) => name.startsWith('snapshot-')),
      []
    );

    const resumed = helper.openValidationSession(identity(repo));
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

    const resumed = helper.openValidationSession(identity(repo));
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
