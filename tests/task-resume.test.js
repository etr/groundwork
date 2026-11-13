/**
 * Tests for the shared task-resume layer (lib/task-resume.js): the
 * single-source existing-worktree classifier consumed by both the terminal
 * runner and the interactive-skill CLI, plus the check/sweep/record/clear
 * CLI surface and the read-time validation/integration derivations.
 *
 * Run with: node tests/task-resume.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const LIB = path.join(PLUGIN_ROOT, 'lib', 'task-resume.js');
const VALIDATION_SESSION_CLI = path.join(PLUGIN_ROOT, 'lib', 'validation-session.js');

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

function tempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gw-resume-'));
}

function initRepo(root, taskId = 'TASK-004') {
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test User');
  write(
    path.join(root, 'specs', 'tasks.md'),
    `### ${taskId}: Four\n**Status:** Not Started\n**Blocked by:** None\n`
  );
  write(path.join(root, '.gitignore'), '.worktrees/\n.groundwork-plans/\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
}

function commonDirOf(root) {
  return path.resolve(root, git(root, 'rev-parse', '--git-common-dir'));
}

function setStatus(projectRoot, taskId, status) {
  const taskFile = path.join(projectRoot, 'specs', 'tasks.md');
  const current = fs.readFileSync(taskFile, 'utf8');
  fs.writeFileSync(taskFile, current.replace(/\*\*Status:\*\* \w[^\n]*/, `**Status:** ${status}`));
}

// Creates the task worktree with one commit beyond the fork point.
function makeTaskWorktree(root, taskId = 'TASK-004', branch = `task/${taskId}`, inProgress = true) {
  const worktree = path.join(root, '.worktrees', taskId);
  git(root, 'worktree', 'add', '-b', branch, worktree);
  if (inProgress) setStatus(worktree, taskId, 'In Progress');
  git(worktree, 'add', '-A');
  git(worktree, 'commit', '-m', `${taskId}: implementation`);
  return worktree;
}

function writePlan(projectRoot, taskId, body = 'Plan body A') {
  const file = path.join(projectRoot, '.groundwork-plans', `${taskId}-plan.md`);
  write(file, `# Implementation Plan: ${taskId}\n\n${body}\n`);
  return file;
}

function checkpointFile(root, projectRelative = '.') {
  const crypto = require('crypto');
  const projectKey = crypto.createHash('sha256').update(projectRelative).digest('hex').slice(0, 16);
  return path.join(commonDirOf(root), 'groundwork', 'runner', projectKey, 'TASK-004.json');
}

function writeCheckpoint(root, checkpoint, projectRelative = '.') {
  const file = checkpointFile(root, projectRelative);
  write(file, JSON.stringify(checkpoint));
  return file;
}

function sessionSlotDir(root, project, taskId, branch) {
  const crypto = require('crypto');
  const sha = (value) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
  return path.join(
    commonDirOf(root), 'groundwork', 'validation',
    sha(project), sha(`${taskId}\0${branch}`)
  );
}

// Fabricates a validation session record in the durable slot layout that
// lib/validation-session.js writes; the scan path reads exactly these.
// `worker` may be {pid, processStart} to fabricate a probeable heartbeat.
function writeSessionRecord(root, { project = '.', taskId = 'TASK-004', branch = 'task/TASK-004',
  stage = 'validated', baseHead, startHead, heartbeat = null, graceUntil = null, runId = null, updatedAt = null }) {
  const crypto = require('crypto');
  const os = require('os');
  const resolvedRunId = runId || crypto.randomBytes(16).toString('hex').padEnd(32, '0');
  const runDir = path.join(sessionSlotDir(root, project, taskId, branch), `groundwork-validation-${resolvedRunId}`);
  const owner = { terminal: stage === 'validated', epoch: 1 };
  if (heartbeat) owner.heartbeat = heartbeat;
  else if (graceUntil) owner.heartbeat = { registered: false, graceUntil };
  const state = {
    version: 2,
    protocolVersion: 1,
    runId: resolvedRunId,
    taskId,
    project,
    branch,
    baseHead,
    startHead,
    stage,
    iteration: 1,
    revision: 2,
    owner,
    updatedAt: updatedAt || new Date().toISOString(),
    completed: stage === 'validated',
    worktreePath: path.join(path.dirname(sessionSlotDir(root, project, taskId, branch)), '..', '..', '..', '.worktrees', taskId),
  };
  write(path.join(runDir, '.validation-session.json'), JSON.stringify(state));
  return { runDir, state };
}

function makeResume() {
  const { createTaskResume } = require(LIB);
  return createTaskResume();
}

function check(root, { taskId = 'TASK-004', baseBranch = 'main', projectName = '', planFile, takeOver } = {}) {
  return makeResume().classifyTaskResume({
    repoRoot: root, projectRoot: root, projectName, taskId, baseBranch, planFile, takeOver,
  });
}

function recordPlan(root, planFile, baseBranch = 'main') {
  return makeResume().recordPlan({
    commonDir: commonDirOf(root), repoRoot: root, projectRoot: root,
    taskId: 'TASK-004', baseBranch, planFile,
  });
}

function recordImplemented(root, worktree, branch = 'task/TASK-004', base = 'main') {
  return makeResume().recordImplemented({
    commonDir: commonDirOf(root), repoRoot: root, projectRoot: root,
    taskId: 'TASK-004', baseBranch: base, branch, worktree, projectName: '',
  });
}

describe('parseArgs and CLI contract', () => {
  const { parseArgs } = require(LIB);

  test('check parses task id, project, and options', () => {
    const args = parseArgs(['check', 'TASK-004', '--project', 'web', '--base-branch', 'main', '--fresh-window', '5']);
    assert.strictEqual(args.command, 'check');
    assert.strictEqual(args.taskId, 'TASK-004');
    assert.strictEqual(args.project, 'web');
    assert.strictEqual(args.baseBranch, 'main');
    assert.strictEqual(args.freshWindow, '5');
  });

  test('record requires phase-specific values', () => {
    assert.throws(() => parseArgs(['record', 'TASK-004', '--phase', 'plan']), /--plan-file/);
    assert.throws(() => parseArgs(['record', 'TASK-004', '--phase', 'implemented']), /--worktree/);
    assert.throws(() => parseArgs(['record', 'TASK-004', '--phase', 'bogus']), /plan or implemented/);
  });

  test('duplicate and unknown flags are rejected', () => {
    assert.throws(() => parseArgs(['check', 'TASK-004', '--project', 'a', '--project', 'b']), /twice/);
    assert.throws(() => parseArgs(['check', 'TASK-004', '--take-over', '--take-over']), /twice/);
    assert.throws(() => parseArgs(['check', 'TASK-004', '--bogus']), /unknown option/);
    assert.throws(() => parseArgs(['check', 'TASK-4']), /invalid task id/);
    assert.throws(() => ['frobnicate', 'TASK-004'].join(' ') && parseArgs(['frobnicate', 'TASK-004']), /unknown command/);
  });

  test('--take-over parses as a boolean flag', () => {
    assert.strictEqual(parseArgs(['check', 'TASK-004', '--take-over']).takeOver, true);
    assert.strictEqual(parseArgs(['check', 'TASK-004']).takeOver, undefined);
  });

  test('CLI prints exactly one JSON line and errors exit non-zero', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const good = spawnSync(process.execPath, [LIB, 'check', 'TASK-004'], { cwd: root, encoding: 'utf8' });
      assert.strictEqual(good.status, 0, good.stderr);
      const lines = good.stdout.trim().split('\n');
      assert.strictEqual(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.strictEqual(parsed.v, 1);
      assert.strictEqual(parsed.resume_at, 'fresh');

      const bad = spawnSync(process.execPath, [LIB, 'check', 'TASK-999'], { cwd: root, encoding: 'utf8' });
      assert.strictEqual(bad.status, 1);
      assert.match(bad.stderr, /^task-resume error: /);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('check: resume_at classification', () => {
  test('fresh when no branch, worktree, or session exists', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const result = check(root);
      assert.strictEqual(result.resume_at, 'fresh');
      assert.deepStrictEqual(result.skip_phases, []);
      assert.strictEqual(result.branch_exists, false);
      assert.strictEqual(result.live_owner, 'none');
      assert.strictEqual(result.validation_session.present, false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('fresh with a stale In Progress marker when no artifacts exist', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      setStatus(root, 'TASK-004', 'In Progress');
      git(root, 'add', '-A');
      git(root, 'commit', '-m', 'stale marker');
      const result = check(root);
      assert.strictEqual(result.resume_at, 'fresh');
      assert.ok(result.evidence.some((line) => line.includes('stale marker')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('implement when the worktree is dirty (killed mid-repair)', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      write(path.join(worktree, 'src', 'uncommitted.txt'), 'mid-repair\n');
      const result = check(root);
      assert.strictEqual(result.resume_at, 'implement');
      assert.strictEqual(result.skip_phases.length, 1);
      assert.strictEqual(result.skip_phases[0], 'plan');
      assert.strictEqual(result.resume_existing_worktree, true);
      assert.strictEqual(result.worktree.dirty_files, 1);
      assert.ok(result.actions.some((action) => action.action === 'record-implemented-after-result'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('implement when a clean worktree carries no recognized phase', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      // The in-worktree status was reset (never marked In Progress).
      setStatus(worktree, 'TASK-004', 'Not Started');
      git(worktree, 'add', '-A');
      git(worktree, 'commit', '-m', 'status reset');
      const result = check(root);
      assert.strictEqual(result.resume_at, 'implement');
      assert.strictEqual(result.resume_existing_worktree, true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('validate via legacy-complete: clean worktree, In Progress inside, commits beyond fork', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      makeTaskWorktree(root);
      const result = check(root);
      assert.strictEqual(result.resume_at, 'validate');
      assert.deepStrictEqual(result.skip_phases, ['plan', 'implement']);
      assert.strictEqual(result.worktree.clean, true);
      assert.strictEqual(result.task_status_in_worktree, 'In Progress');
      assert.ok(result.evidence.some((line) => line.includes('legacy-complete')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('validate via recorded implementation checkpoint', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      const planFile = writePlan(root, 'TASK-004');
      recordPlan(root, planFile);
      recordImplemented(root, worktree);
      const result = check(root);
      assert.strictEqual(result.resume_at, 'validate');
      assert.strictEqual(result.checkpoint.present, true);
      assert.strictEqual(result.checkpoint.stage, 'implemented');
      assert.strictEqual(result.checkpoint.implementation_matches, true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('finalize when a terminal validated session covers the current head (derived)', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      const baseSha = git(root, 'rev-parse', 'HEAD');
      const taskHead = git(worktree, 'rev-parse', 'HEAD');
      writeSessionRecord(root, { baseHead: baseSha, startHead: taskHead, stage: 'validated' });
      const result = check(root);
      assert.strictEqual(result.resume_at, 'finalize');
      assert.deepStrictEqual(result.skip_phases, ['plan', 'implement', 'validate']);
      assert.strictEqual(result.validation_session.present, true);
      assert.strictEqual(result.validation_session.stage, 'validated');
      assert.strictEqual(result.validation_session.terminal, true);
      assert.strictEqual(result.checkpoint.derived.validation, true);
      assert.ok(result.actions.some((action) => action.action === 'finalize-from-worktree'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('finalize when a derived integration merge follows a moved base', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      const forkSha = git(root, 'rev-parse', 'HEAD');
      const taskHead0 = git(worktree, 'rev-parse', 'HEAD');

      // Base moves on main after validation froze the fork point.
      write(path.join(root, 'base-moved.txt'), 'base advanced\n');
      git(root, 'add', '-A');
      git(root, 'commit', '-m', 'base advances');
      const movedBase = git(root, 'rev-parse', 'HEAD');

      // Session validated the pre-integration head.
      writeSessionRecord(root, { baseHead: forkSha, startHead: taskHead0, stage: 'validated' });

      // finalize-task's base integration: merge the moved base into the task branch.
      git(worktree, 'merge', '--no-ff', '-m', 'TASK-004: Integrate updated base branch', movedBase);
      const integratedHead = git(worktree, 'rev-parse', 'HEAD');

      const result = check(root);
      assert.strictEqual(result.resume_at, 'finalize');
      assert.strictEqual(result.checkpoint.derived.integration, true);
      assert.strictEqual(result.checkpoint.integration_accepted, true);
      assert.strictEqual(result.worktree.head, integratedHead);
      assert.ok(result.evidence.some((line) => line.includes('integration derived')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('done when the task branch is already merged into the base branch', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      setStatus(worktree, 'TASK-004', 'Complete');
      git(worktree, 'add', '-A');
      git(worktree, 'commit', '-m', 'TASK-004: Mark task complete');
      git(root, 'merge', '--no-ff', '-m', 'Merge task/TASK-004', 'task/TASK-004');
      const result = check(root);
      assert.strictEqual(result.resume_at, 'done');
      assert.strictEqual(result.merged_into_base, true);
      assert.ok(result.actions.some((action) => action.action === 'clear-checkpoint'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('conflict when the plan changed under an existing implementation', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      const planFile = writePlan(root, 'TASK-004', 'Plan body A');
      recordPlan(root, planFile);
      recordImplemented(root, worktree);
      // Re-plan with different content under the recorded implementation.
      writePlan(root, 'TASK-004', 'Plan body B — re-planned');
      const result = check(root);
      assert.strictEqual(result.resume_at, 'conflict');
      assert.ok(result.evidence.some((line) => line.includes('plan file changed under an existing implementation')));
      assert.ok(result.actions.some((action) => action.action === 'surface-evidence'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('conflict when branch and worktree disagree (incomplete resume state)', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      git(root, 'worktree', 'remove', worktree);
      const result = check(root);
      assert.strictEqual(result.resume_at, 'conflict');
      assert.strictEqual(result.branch_exists, true);
      assert.strictEqual(result.worktree.exists, false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('conflict (soft standdown) while a fresh heartbeat cannot be verified', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      const baseSha = git(root, 'rev-parse', 'HEAD');
      const taskHead = git(worktree, 'rev-parse', 'HEAD');
      const nowIso = new Date().toISOString();
      writeSessionRecord(root, {
        baseHead: baseSha, startHead: taskHead, stage: 'review-batch-complete',
        heartbeat: { registered: true, lastBeat: nowIso },
      });
      const result = check(root);
      assert.strictEqual(result.live_owner, 'validation-heartbeat');
      assert.strictEqual(result.live_owner_reason, 'heartbeat-unverifiable');
      assert.strictEqual(result.resume_at, 'conflict');
      assert.ok(result.evidence.some((line) => line.includes('--take-over')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('--take-over resolves the unverifiable heartbeat without asking', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      const baseSha = git(root, 'rev-parse', 'HEAD');
      const taskHead = git(worktree, 'rev-parse', 'HEAD');
      const nowIso = new Date().toISOString();
      writeSessionRecord(root, {
        baseHead: baseSha, startHead: taskHead, stage: 'review-batch-complete',
        heartbeat: { registered: true, lastBeat: nowIso },
      });
      const result = check(root, { takeOver: true });
      assert.strictEqual(result.takeover, true);
      assert.strictEqual(result.live_owner_reason, 'heartbeat-unverifiable');
      assert.strictEqual(result.resume_at, 'validate');
      assert.ok(result.evidence.some((line) => line.includes('standdown overridden')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a killed session stops blocking once its worker probes dead', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      const baseSha = git(root, 'rev-parse', 'HEAD');
      const taskHead = git(worktree, 'rev-parse', 'HEAD');
      const nowIso = new Date().toISOString();
      writeSessionRecord(root, {
        baseHead: baseSha, startHead: taskHead, stage: 'review-batch-complete',
        heartbeat: {
          registered: true, lastBeat: nowIso,
          host: os.hostname(), pid: 4194303, processStart: 'proc:1',
        },
      });
      const result = check(root);
      assert.strictEqual(result.live_owner, 'none');
      assert.strictEqual(result.validation_session.heartbeat_worker_alive, false);
      assert.strictEqual(result.resume_at, 'validate');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a provably-live worker is a hard standdown even with --take-over', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      const baseSha = git(root, 'rev-parse', 'HEAD');
      const taskHead = git(worktree, 'rev-parse', 'HEAD');
      const { spawn } = require('child_process');
      const live = spawn('sleep', ['30'], { stdio: 'ignore', detached: true });
      const { processStartIdentity } = require(path.join(PLUGIN_ROOT, 'lib', 'process-identity'));
      const start = processStartIdentity(live.pid);
      const nowIso = new Date().toISOString();
      writeSessionRecord(root, {
        baseHead: baseSha, startHead: taskHead, stage: 'review-batch-complete',
        heartbeat: {
          registered: true, lastBeat: nowIso,
          host: os.hostname(), pid: live.pid, processStart: start,
        },
      });
      const result = check(root, { takeOver: true });
      assert.strictEqual(result.live_owner_reason, 'heartbeat-worker-alive');
      assert.strictEqual(result.validation_session.heartbeat_worker_alive, true);
      assert.strictEqual(result.resume_at, 'conflict');
      assert.ok(result.evidence.some((line) => line.includes('cannot override a live process')));
      process.kill(live.pid, 'SIGKILL');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('an orphaned worker (beating, dead anchor) is not a standdown', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      const baseSha = git(root, 'rev-parse', 'HEAD');
      const taskHead = git(worktree, 'rev-parse', 'HEAD');
      const { spawn } = require('child_process');
      const live = spawn('sleep', ['30'], { stdio: 'ignore', detached: true });
      const { processStartIdentity } = require(path.join(PLUGIN_ROOT, 'lib', 'process-identity'));
      const start = processStartIdentity(live.pid);
      const nowIso = new Date().toISOString();
      writeSessionRecord(root, {
        baseHead: baseSha, startHead: taskHead, stage: 'review-batch-complete',
        heartbeat: {
          registered: true, lastBeat: nowIso,
          host: os.hostname(), pid: live.pid, processStart: start,
          anchor: { pid: 4194303, host: os.hostname(), processStart: 'proc:1', origin: 'ancestry' },
        },
      });
      const result = check(root);
      // The worker provably beats on, but its owning session is provably
      // dead: an orphan is not a live owner, so no standdown of any kind.
      assert.strictEqual(result.live_owner, 'none');
      assert.strictEqual(result.live_owner_reason, 'heartbeat-orphaned');
      assert.strictEqual(result.validation_session.heartbeat_worker_alive, true);
      assert.strictEqual(result.validation_session.heartbeat_anchor_alive, false);
      assert.strictEqual(result.validation_session.heartbeat_worker_pid, live.pid);
      assert.strictEqual(result.resume_at, 'validate');
      assert.ok(result.evidence.some((line) => line.includes('orphan')));
      process.kill(live.pid, 'SIGKILL');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a hard standdown with a persisted capability file offers the paste-ready stop recipe', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      const baseSha = git(root, 'rev-parse', 'HEAD');
      const taskHead = git(worktree, 'rev-parse', 'HEAD');
      const { spawn } = require('child_process');
      const live = spawn('sleep', ['30'], { stdio: 'ignore', detached: true });
      const { processStartIdentity } = require(path.join(PLUGIN_ROOT, 'lib', 'process-identity'));
      const start = processStartIdentity(live.pid);
      const nowIso = new Date().toISOString();
      const record = writeSessionRecord(root, {
        baseHead: baseSha, startHead: taskHead, stage: 'review-batch-complete',
        heartbeat: {
          registered: true, lastBeat: nowIso,
          host: os.hostname(), pid: live.pid, processStart: start,
        },
      });
      // Legacy-style record: a live worker, no anchor, and the manual
      // capability file a real open persists beside the run directory.
      const capabilityFile = path.join(path.dirname(record.runDir), `manual-capability-${record.state.runId}.json`);
      fs.mkdirSync(path.dirname(capabilityFile), { recursive: true });
      fs.writeFileSync(capabilityFile, '0123456789abcdef0123456789abcdef0123456789abcdef01\n', { mode: 0o600 });
      const result = check(root, { takeOver: true });
      assert.strictEqual(result.live_owner_reason, 'heartbeat-worker-alive');
      assert.strictEqual(result.resume_at, 'conflict');
      assert.ok(result.evidence.some((line) => line.includes('heartbeat-stop') && line.includes(capabilityFile)),
        `expected the stop recipe in evidence: ${JSON.stringify(result.evidence)}`);
      process.kill(live.pid, 'SIGKILL');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a hard standdown without a capability file advises killing the leaked worker', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      const baseSha = git(root, 'rev-parse', 'HEAD');
      const taskHead = git(worktree, 'rev-parse', 'HEAD');
      const { spawn } = require('child_process');
      const live = spawn('sleep', ['30'], { stdio: 'ignore', detached: true });
      const { processStartIdentity } = require(path.join(PLUGIN_ROOT, 'lib', 'process-identity'));
      const start = processStartIdentity(live.pid);
      const nowIso = new Date().toISOString();
      writeSessionRecord(root, {
        baseHead: baseSha, startHead: taskHead, stage: 'review-batch-complete',
        heartbeat: {
          registered: true, lastBeat: nowIso,
          host: os.hostname(), pid: live.pid, processStart: start,
        },
      });
      const result = check(root);
      assert.strictEqual(result.live_owner_reason, 'heartbeat-worker-alive');
      assert.strictEqual(result.resume_at, 'conflict');
      assert.ok(result.evidence.some((line) => line.includes('kill the worker') && line.includes(String(live.pid))),
        `expected the kill advice in evidence: ${JSON.stringify(result.evidence)}`);
      process.kill(live.pid, 'SIGKILL');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a stale heartbeat does not stand down', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      const baseSha = git(root, 'rev-parse', 'HEAD');
      const taskHead = git(worktree, 'rev-parse', 'HEAD');
      const staleBeat = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      writeSessionRecord(root, {
        baseHead: baseSha, startHead: taskHead, stage: 'review-batch-complete',
        heartbeat: { registered: true, lastBeat: staleBeat },
      });
      const result = check(root);
      assert.strictEqual(result.live_owner, 'none');
      assert.strictEqual(result.resume_at, 'validate');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('recent-writer is reported from a fresh checkpoint mtime', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      const planFile = writePlan(root, 'TASK-004');
      recordPlan(root, planFile);
      recordImplemented(root, worktree);
      const result = check(root);
      assert.strictEqual(result.live_owner, 'recent-writer');
      assert.strictEqual(result.live_owner_reason, 'recent-checkpoint');
      // Soft signal only: classification still proceeds.
      assert.strictEqual(result.resume_at, 'validate');
      // And --take-over records the override instead of leaving it implicit.
      const overridden = check(root, { takeOver: true });
      assert.strictEqual(overridden.resume_at, 'validate');
      assert.ok(overridden.evidence.some((line) => line.includes('standdown overridden')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('record and clear', () => {
  test('record plan writes the runner checkpoint and invalidates downstream on change', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      const planFile = writePlan(root, 'TASK-004', 'Plan body A');
      recordPlan(root, planFile);
      recordImplemented(root, worktree);
      const changed = recordPlan(root, writePlan(root, 'TASK-004', 'Plan body B'));
      assert.strictEqual(changed.changed, true);
      assert.strictEqual(changed.invalidated_downstream, true);
      const checkpoint = JSON.parse(fs.readFileSync(checkpointFile(root), 'utf8'));
      assert.strictEqual(checkpoint.taskId, 'TASK-004');
      assert.strictEqual(checkpoint.implementation, undefined);
      // After invalidation the clean, committed worktree is legacy-complete
      // (In Progress inside, commits beyond the fork): validation audits the
      // actual tree, so the resume point moves to validate — the same
      // single-source classification the runner produces on its next run.
      const result = check(root);
      assert.strictEqual(result.resume_at, 'validate');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('record plan rejects foreign plan paths', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      assert.throws(() => recordPlan(root, path.join(root, 'elsewhere.md')), /Plan file must be/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('record implemented verifies the workspace identity and records exact heads', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      writePlan(root, 'TASK-004');
      const result = recordImplemented(root, worktree);
      const checkpoint = JSON.parse(fs.readFileSync(checkpointFile(root), 'utf8'));
      assert.strictEqual(checkpoint.workspace.branch, 'task/TASK-004');
      assert.strictEqual(checkpoint.implementation.taskHead, git(worktree, 'rev-parse', 'HEAD'));
      assert.strictEqual(checkpoint.implementation.taskHead, result.task_head);
      assert.strictEqual(checkpoint.implementation.baseHead, git(root, 'rev-parse', 'HEAD'));
      // A wrong branch is refused.
      assert.throws(
        () => recordImplemented(root, worktree, 'task/other/TASK-004'),
        /does not match the task workspace identity/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('record implemented requires a plan file', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      assert.throws(() => recordImplemented(root, worktree), /No plan file found/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('clear removes the checkpoint', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const planFile = writePlan(root, 'TASK-004');
      recordPlan(root, planFile);
      const cleared = makeResume().clear({
        commonDir: commonDirOf(root), repoRoot: root, projectRoot: root, taskId: 'TASK-004',
      });
      assert.strictEqual(cleared.cleared, true);
      assert.strictEqual(fs.existsSync(checkpointFile(root)), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('sweep', () => {
  test('classifies cleanable, needs_review, and live worktrees', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      // TASK-004: merged + Complete + clean → cleanable.
      const worktree = makeTaskWorktree(root);
      setStatus(worktree, 'TASK-004', 'Complete');
      git(worktree, 'add', '-A');
      git(worktree, 'commit', '-m', 'TASK-004: Mark task complete');
      git(root, 'merge', '--no-ff', '-m', 'Merge task/TASK-004', 'task/TASK-004');

      // TASK-005: unmerged in-flight worktree → needs_review.
      write(
        path.join(root, 'specs', 'tasks.md'),
        `${fs.readFileSync(path.join(root, 'specs', 'tasks.md'), 'utf8')}\n### TASK-005: Five\n**Status:** In Progress\n**Blocked by:** None\n`
      );
      git(root, 'add', '-A');
      git(root, 'commit', '-m', 'add TASK-005');
      const worktree5 = path.join(root, '.worktrees', 'TASK-005');
      git(root, 'worktree', 'add', '-b', 'task/TASK-005', worktree5);
      setStatus(worktree5, 'TASK-005', 'In Progress');
      write(path.join(worktree5, 'wip.txt'), 'wip\n');
      git(worktree5, 'add', '-A');
      git(worktree5, 'commit', '-m', 'TASK-005: wip');
      write(path.join(worktree5, 'uncommitted.txt'), 'dirty\n');

      const result = makeResume().sweepTaskWorktrees({ repoRoot: root, projectRoot: root, projectName: '' });
      assert.strictEqual(result.cleanable.length, 1);
      assert.strictEqual(result.cleanable[0].task_id, 'TASK-004');
      assert.strictEqual(result.cleanable[0].status, 'Complete');
      const review = result.needs_review.find((entry) => entry.task_id === 'TASK-005');
      assert.ok(review, 'TASK-005 lands in needs_review');
      assert.match(review.reason, /not merged/);
      assert.match(review.reason, /dirty/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a task marked Complete but unmerged is needs_review, not cleanable', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      setStatus(worktree, 'TASK-004', 'Complete');
      git(worktree, 'add', '-A');
      git(worktree, 'commit', '-m', 'TASK-004: Mark task complete');
      const result = makeResume().sweepTaskWorktrees({ repoRoot: root, projectRoot: root, projectName: '' });
      assert.strictEqual(result.cleanable.length, 0);
      // The main index still says Not Started (the Complete marking lives
      // on the unmerged task branch), so the honest reason is "not merged".
      assert.match(result.needs_review[0].reason, /not merged/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a live validation session moves a merged worktree to ignored_live', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      setStatus(worktree, 'TASK-004', 'Complete');
      git(worktree, 'add', '-A');
      git(worktree, 'commit', '-m', 'TASK-004: Mark task complete');
      git(root, 'merge', '--no-ff', '-m', 'Merge task/TASK-004', 'task/TASK-004');
      const baseSha = git(root, 'rev-parse', 'HEAD~1');
      writeSessionRecord(root, {
        baseHead: baseSha, startHead: git(worktree, 'rev-parse', 'HEAD'),
        stage: 'review-batch-complete',
        heartbeat: { registered: true, lastBeat: new Date().toISOString(), worker: null },
      });
      const result = makeResume().sweepTaskWorktrees({ repoRoot: root, projectRoot: root, projectName: '' });
      assert.strictEqual(result.cleanable.length, 0);
      assert.strictEqual(result.ignored_live.length, 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('an orphaned validation session stops blocking the sweep and is named in needs_review', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      setStatus(worktree, 'TASK-004', 'Complete');
      git(worktree, 'add', '-A');
      git(worktree, 'commit', '-m', 'TASK-004: Mark task complete');
      const baseSha = git(root, 'rev-parse', 'HEAD');
      const taskHead = git(worktree, 'rev-parse', 'HEAD');
      const { spawn } = require('child_process');
      const live = spawn('sleep', ['30'], { stdio: 'ignore', detached: true });
      const { processStartIdentity } = require(path.join(PLUGIN_ROOT, 'lib', 'process-identity'));
      const start = processStartIdentity(live.pid);
      writeSessionRecord(root, {
        baseHead: baseSha, startHead: taskHead, stage: 'review-batch-complete',
        heartbeat: {
          registered: true, lastBeat: new Date().toISOString(),
          host: os.hostname(), pid: live.pid, processStart: start,
          anchor: { pid: 4194303, host: os.hostname(), processStart: 'proc:1', origin: 'ancestry' },
        },
      });
      const result = makeResume().sweepTaskWorktrees({ repoRoot: root, projectRoot: root, projectName: '' });
      assert.strictEqual(result.ignored_live.length, 0, `expected no ignored_live: ${JSON.stringify(result)}`);
      assert.strictEqual(result.cleanable.length, 0);
      assert.strictEqual(result.needs_review.length, 1);
      assert.match(result.needs_review[0].reason, /orphaned validation worker/);
      process.kill(live.pid, 'SIGKILL');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('real validation-session records', () => {
  test('a real open session is honored: grace standdown, then terminal finalize', () => {
    const root = tempRepo();
    try {
      initRepo(root);
      const worktree = makeTaskWorktree(root);
      const planFile = writePlan(root, 'TASK-004');
      recordPlan(root, planFile);
      recordImplemented(root, worktree);
      const baseSha = git(root, 'rev-parse', 'HEAD');

      // A real open writes the real slot layout the scan path reads.
      const opened = spawnSync(process.execPath, [VALIDATION_SESSION_CLI, 'open',
        '--repo-root', root, '--project-root', worktree, '--worktree', worktree,
        '--task-id', 'TASK-004', '--branch', 'task/TASK-004', '--base-head', baseSha,
        '--protocol-version', '1'], { cwd: root, encoding: 'utf8' });
      assert.strictEqual(opened.status, 0, opened.stderr);
      const openResult = JSON.parse(opened.stdout.trim().split('\n').pop());
      assert.ok(openResult.capability_file, 'open persists and reports the capability file');

      // Fresh open: the owner is inside its grace window — standdown.
      const during = check(root);
      assert.strictEqual(during.validation_session.present, true);
      assert.strictEqual(during.live_owner, 'validation-heartbeat');
      assert.strictEqual(during.resume_at, 'conflict');

      // Advance to the terminal state the `complete` command produces
      // (stage validated, terminal owner, completed metrics).
      const stateFile = path.join(openResult.run_dir, '.validation-session.json');
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      state.stage = 'validated';
      state.completed = { iterations: 2, fixed: 1, unworked: 3, action: 'none', commit: null };
      state.owner = { ...state.owner, terminal: true };
      fs.writeFileSync(stateFile, JSON.stringify(state));

      const result = check(root);
      assert.strictEqual(result.validation_session.present, true);
      assert.strictEqual(result.validation_session.stage, 'validated');
      assert.strictEqual(result.validation_session.terminal, true);
      assert.strictEqual(result.resume_at, 'finalize');
      assert.strictEqual(result.checkpoint.derived.validation, true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('shared core parity with the runner', () => {
  test('the runner re-exports the shared classifier and checkpoint IO', () => {
    const runner = require(path.join(PLUGIN_ROOT, 'bin', 'groundwork-run.js'));
    assert.strictEqual(typeof runner.assertClean, 'function');
    assert.strictEqual(typeof runner.assertRegisteredWorktree, 'function');
    assert.strictEqual(typeof runner.parseTaskCatalog, 'function');
    const core = require(LIB).createTaskResumeCore();
    assert.strictEqual(typeof core.classifyExistingWorktree, 'function');
    assert.strictEqual(typeof core.saveCheckpoint, 'function');
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
