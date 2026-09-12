/**
 * Tests for the validation session ownership lock (B1 + R3).
 *
 * Two concurrent validations of the same (project, taskId, branch) must not
 * silently interleave: the open critical section is serialized by an O_EXCL
 * lockfile, and a fresh incomplete session is only resumable by an
 * orchestration that proves continuation (--resume-run) — anyone else gets
 * an actionable refusal naming the abandon escape hatch.
 *
 * Run with: node tests/validation-lock.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HELPER = path.resolve(__dirname, '..', 'lib', 'validation-session.js');

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'groundwork-validation-lock-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test User');
  write(path.join(root, 'specs', 'tasks.md'), '### TASK-075: Lock\n');
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
  };
}

function identity(repo, extra = {}) {
  return {
    repoRoot: repo.root,
    projectRoot: repo.root,
    worktreePath: repo.root,
    taskId: 'TASK-075',
    branch: 'task/TASK-075',
    baseHead: repo.baseHead,
    protocolVersion: 1,
    ...extra,
  };
}

// The lock path for this identity's slot.
function lockPath(repo) {
  const { openValidationSession } = require(HELPER);
  // Open once to materialize the slot, then locate the lock beside active.json.
  const opened = openValidationSession(identity(repo, { resumeRun: undefined }));
  return path.join(path.dirname(path.join(opened.runDir)), 'active.lock');
}

// A minimal coordinator state that passes validateCoordinatorStateFile.
function coordinatorState(iteration = 1) {
  return {
    iteration,
    review_mode: 'initial-audit',
    validation_baseline: { task: 'TASK-075', base: 'main' },
    finding_ledger: [],
    carried_approvals: [],
    disturbed_invariants: [],
    fixed_ids: [],
    findings_skipped: [],
    active_reviewers: [],
    latest_manifest: null,
  };
}

// Open a session and checkpoint it, pinning the coordinator artifact hash.
function checkpointInitialReview(repo) {
  const helper = require(HELPER);
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

describe('open lockfile serialization', () => {
  test('open releases its lock — no active.lock remains after a completed open', () => {
    const repo = fixture();
    try {
      const { openValidationSession } = require(HELPER);
      const created = openValidationSession(identity(repo));
      const parent = path.dirname(created.runDir);
      assert.strictEqual(fs.existsSync(path.join(parent, 'active.lock')), false);
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('a lock held by a live process refuses a concurrent open with guidance', () => {
    const repo = fixture();
    try {
      const { openValidationSession } = require(HELPER);
      const created = openValidationSession(identity(repo));
      const parent = path.dirname(created.runDir);
      write(path.join(parent, 'active.lock'), JSON.stringify({
        version: 1,
        pid: process.pid,
        host: os.hostname(),
        acquiredAt: new Date().toISOString(),
      }));
      assert.throws(
        () => openValidationSession(identity(repo, { resumeRun: created.state.runId })),
        /another validation open is in progress/
      );
      fs.unlinkSync(path.join(parent, 'active.lock'));
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('a lock whose holder pid is dead is reaped and open proceeds', () => {
    const repo = fixture();
    try {
      const { openValidationSession } = require(HELPER);
      const created = openValidationSession(identity(repo));
      const parent = path.dirname(created.runDir);
      // pid 4000000 is beyond typical pid ranges on both macOS and Linux;
      // even if alive, host mismatch + age make it reapable — use a dead pid
      // AND an aged timestamp to make staleness deterministic.
      write(path.join(parent, 'active.lock'), JSON.stringify({
        version: 1,
        pid: -1,
        host: 'definitely-not-this-host',
        acquiredAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      }));
      const resumed = openValidationSession(identity(repo, { resumeRun: created.state.runId }));
      assert.strictEqual(resumed.status, 'resumed');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });
});

describe('unreadable-lock grace window', () => {
  // The holder creates the lockfile with openSync(wx) and only then writes
  // and fsyncs its JSON. A competing open that hits EEXIST inside that window
  // reads an empty file — the lock must be treated as held until it is
  // provably older than the staleness window.
  test('an empty (partially-written) young lockfile is treated as held, not reaped', () => {
    const repo = fixture();
    try {
      const { openValidationSession } = require(HELPER);
      const created = openValidationSession(identity(repo));
      const lock = path.join(path.dirname(created.runDir), 'active.lock');
      write(lock, '');
      assert.throws(
        () => openValidationSession(identity(repo, { resumeRun: created.state.runId })),
        /another validation open is in progress/
      );
      assert.strictEqual(fs.existsSync(lock), true, 'the young unreadable lock was reaped');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('an empty aged lockfile is reaped and open proceeds', () => {
    const repo = fixture();
    try {
      const { openValidationSession } = require(HELPER);
      const created = openValidationSession(identity(repo));
      const lock = path.join(path.dirname(created.runDir), 'active.lock');
      write(lock, '');
      const aged = new Date(Date.now() - 10 * 60 * 1000);
      fs.utimesSync(lock, aged, aged);
      const resumed = openValidationSession(identity(repo, { resumeRun: created.state.runId }));
      assert.strictEqual(resumed.status, 'resumed');
      assert.strictEqual(fs.existsSync(lock), false, 'the aged unreadable lock survived');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });
});

describe('fresh-session ownership guard', () => {
  test('re-opening a fresh incomplete session without a continuation token is refused', () => {
    const repo = fixture();
    try {
      const { openValidationSession } = require(HELPER);
      const created = openValidationSession(identity(repo));
      assert.throws(
        () => openValidationSession(identity(repo)),
        (error) => {
          assert.ok(/already active/.test(error.message));
          // R3: the refusal is actionable — it names the task, the branch,
          // the escape hatches, and the abandon command.
          assert.ok(error.message.includes('TASK-075'));
          assert.ok(error.message.includes('task/TASK-075'));
          assert.ok(error.message.includes('--resume-run'));
          assert.ok(error.message.includes('abandon --force'));
          return true;
        }
      );
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('the continuation token resumes the same run', () => {
    const repo = fixture();
    try {
      const { openValidationSession } = require(HELPER);
      const created = openValidationSession(identity(repo));
      const resumed = openValidationSession(identity(repo, { resumeRun: created.state.runId }));
      assert.strictEqual(resumed.status, 'resumed');
      assert.strictEqual(resumed.runDir, created.runDir);
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('a stale heartbeat is resumable without the token (crash recovery)', () => {
    const repo = fixture();
    try {
      const { openValidationSession } = require(HELPER);
      const created = openValidationSession(identity(repo));
      const stateFile = path.join(created.runDir, '.validation-session.json');
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      state.updatedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      write(stateFile, JSON.stringify(state));
      const resumed = openValidationSession(identity(repo));
      assert.strictEqual(resumed.status, 'resumed');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });
});

describe('abandon', () => {
  test('refuses to abandon a fresh session without --force', () => {
    const repo = fixture();
    try {
      const { openValidationSession, abandonValidationSession } = require(HELPER);
      openValidationSession(identity(repo));
      assert.throws(
        () => abandonValidationSession(identity(repo), false),
        /already active|wait out the staleness window/
      );
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('--force removes the pointer so the next open starts fresh', () => {
    const repo = fixture();
    try {
      const { openValidationSession, abandonValidationSession } = require(HELPER);
      const created = openValidationSession(identity(repo));
      abandonValidationSession(identity(repo), true);
      const next = openValidationSession(identity(repo));
      assert.strictEqual(next.status, 'created');
      assert.notStrictEqual(next.state.runId, created.state.runId);
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('--force clears a pointer whose recorded identity mismatches (same slot)', () => {
    const repo = fixture();
    try {
      const { openValidationSession, abandonValidationSession } = require(HELPER);
      openValidationSession(identity(repo));
      // Same (task, branch) slot recorded at a different base: the escape
      // hatch must clear the mismatched pointer instead of refusing.
      const otherHead = git(repo.root, 'rev-parse', 'HEAD');
      abandonValidationSession(identity(repo, { baseHead: otherHead }), true);
      const next = openValidationSession(identity(repo, { baseHead: otherHead }));
      assert.strictEqual(next.status, 'created');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('non-force abandon of a mismatched pointer still refuses and keeps it', () => {
    const repo = fixture();
    try {
      const { openValidationSession, abandonValidationSession } = require(HELPER);
      const created = openValidationSession(identity(repo));
      const otherHead = git(repo.root, 'rev-parse', 'HEAD');
      assert.throws(
        () => abandonValidationSession(identity(repo, { baseHead: otherHead }), false),
        /identity does not match/
      );
      // The refusal left the pointer intact: the original owner still resumes.
      const resumed = openValidationSession(identity(repo, { resumeRun: created.state.runId }));
      assert.strictEqual(resumed.runDir, created.runDir);
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('--force clears a slot whose coordinator artifact was mutated after checkpoint', () => {
    const repo = fixture();
    try {
      const helper = require(HELPER);
      const session = checkpointInitialReview(repo);
      // Tamper with the pinned coordinator artifact after its checkpoint: the
      // slot is now wedged for open (hash mismatch), and the documented
      // recovery command is exactly `abandon --force` — it must not wedge too.
      const artifact = path.join(session.runDir, 'coordinator-iter1.json');
      write(artifact, JSON.stringify({
        ...coordinatorState(),
        finding_ledger: [{ id: 'forged-after-checkpoint' }],
      }));
      helper.abandonValidationSession(identity(repo), true);
      assert.strictEqual(
        fs.existsSync(path.join(path.dirname(session.runDir), 'active.json')),
        false,
        'force abandon left the wedged pointer in place'
      );
      // Tamper evidence survives: the run directory and its artifact are not
      // deleted, only the pointer is cleared.
      assert.strictEqual(fs.existsSync(artifact), true,
        'force abandon deleted the pointed run directory');
      const next = helper.openValidationSession(identity(repo));
      assert.strictEqual(next.status, 'created');
      assert.notStrictEqual(next.state.runId, session.state.runId);
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('non-force abandon of a mutated coordinator artifact still throws and keeps the pointer', () => {
    const repo = fixture();
    try {
      const helper = require(HELPER);
      const session = checkpointInitialReview(repo);
      write(path.join(session.runDir, 'coordinator-iter1.json'), JSON.stringify({
        ...coordinatorState(),
        finding_ledger: [{ id: 'forged-after-checkpoint' }],
      }));
      assert.throws(
        () => helper.abandonValidationSession(identity(repo), false),
        /coordinator artifact changed after checkpoint/
      );
      assert.strictEqual(
        fs.existsSync(path.join(path.dirname(session.runDir), 'active.json')),
        true,
        'non-force abandon cleared a pointer whose session failed verification'
      );
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('abandon does not unlink a lock a live concurrent open holds', () => {
    const repo = fixture();
    try {
      const { openValidationSession, abandonValidationSession } = require(HELPER);
      const created = openValidationSession(identity(repo));
      const parent = path.dirname(created.runDir);
      // A concurrent open is mid-critical-section: its live lock must fence
      // abandon, or the pointer it is about to rewrite would be lost.
      write(path.join(parent, 'active.lock'), JSON.stringify({
        version: 1,
        pid: process.pid,
        host: os.hostname(),
        acquiredAt: new Date().toISOString(),
      }));
      assert.throws(
        () => abandonValidationSession(identity(repo), true),
        /another validation open is in progress/
      );
      assert.strictEqual(fs.existsSync(path.join(parent, 'active.json')), true,
        'abandon removed the pointer under a live open lock');
      assert.strictEqual(fs.existsSync(path.join(parent, 'active.lock')), true,
        'abandon removed a live open holder\'s lock');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('abandoning with no active session is a no-op success', () => {
    const repo = fixture();
    try {
      const { abandonValidationSession } = require(HELPER);
      const result = abandonValidationSession(identity(repo), false);
      assert.strictEqual(result.status, 'abandoned');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });
});

describe('lock liveness edges (injected probe)', () => {
  // The liveness probe is injectable — same DI pattern as
  // lib/worktree-identity.js createWorktreeIdentity({execGit}) — so the
  // process.kill branches can be pinned deterministically: EPERM means the
  // process exists but is not ours (alive), ESRCH means dead, a clean return
  // means alive. Pids are chosen so the DEFAULT probe would give the opposite
  // answer, proving the shim is actually consulted.
  const probeThrowing = (code) => () => {
    const error = new Error(`simulated ${code}`);
    error.code = code;
    throw error;
  };
  const probeSilent = () => {};
  const liveLock = (pid) => JSON.stringify({
    version: 1,
    pid,
    host: os.hostname(),
    acquiredAt: new Date().toISOString(),
  });

  test('same-host EPERM means alive: the lock is held', () => {
    const repo = fixture();
    try {
      const { openValidationSession } = require(HELPER);
      const created = openValidationSession(identity(repo));
      const lock = path.join(path.dirname(created.runDir), 'active.lock');
      // 424242 is dead under the default probe; the shim says EPERM (alive).
      write(lock, liveLock(424242));
      assert.throws(
        () => openValidationSession(identity(repo, { resumeRun: created.state.runId }), probeThrowing('EPERM')),
        /another validation open is in progress/
      );
      assert.strictEqual(fs.existsSync(lock), true, 'an EPERM-alive lock was reaped');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('same-host ESRCH means dead: the lock is reaped', () => {
    const repo = fixture();
    try {
      const { openValidationSession } = require(HELPER);
      const created = openValidationSession(identity(repo));
      const lock = path.join(path.dirname(created.runDir), 'active.lock');
      // process.pid is alive under the default probe; the shim says ESRCH.
      write(lock, liveLock(process.pid));
      const resumed = openValidationSession(
        identity(repo, { resumeRun: created.state.runId }),
        probeThrowing('ESRCH')
      );
      assert.strictEqual(resumed.status, 'resumed');
      assert.strictEqual(fs.existsSync(lock), false, 'an ESRCH-dead lock survived');
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('same-host live pid refuses with the busy error', () => {
    const repo = fixture();
    try {
      const { openValidationSession } = require(HELPER);
      const created = openValidationSession(identity(repo));
      const lock = path.join(path.dirname(created.runDir), 'active.lock');
      // 424242 is dead under the default probe; the shim says alive.
      write(lock, liveLock(424242));
      assert.throws(
        () => openValidationSession(identity(repo, { resumeRun: created.state.runId }), probeSilent),
        (error) => {
          assert.ok(/another validation open is in progress/.test(error.message), error.message);
          assert.ok(error.message.includes('424242'), error.message);
          return true;
        }
      );
      assert.strictEqual(fs.existsSync(lock), true);
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('a refused open releases its lock (no active.lock remains)', () => {
    const repo = fixture();
    try {
      const { openValidationSession } = require(HELPER);
      const created = openValidationSession(identity(repo));
      // The fresh-session guard throws inside openLockedSession — the
      // finally-release must still clean up the acquired lock.
      assert.throws(
        () => openValidationSession(identity(repo)),
        /already active/
      );
      assert.strictEqual(
        fs.existsSync(path.join(path.dirname(created.runDir), 'active.lock')),
        false,
        'a refused open leaked its lock'
      );
    } finally {
      fs.rmSync(repo.root, { recursive: true, force: true });
    }
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
