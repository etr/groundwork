/**
 * Tests for the terminal-first, fresh-process Groundwork task runner.
 *
 * Run with: node tests/groundwork-run.test.js
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const RUNNER = path.join(PLUGIN_ROOT, 'bin', 'groundwork-run.js');

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

function completeTaskFile(projectRoot, taskId) {
  const taskFile = path.join(projectRoot, 'specs', 'tasks.md');
  const current = fs.readFileSync(taskFile, 'utf8');
  fs.writeFileSync(taskFile, current.replace('**Status:** In Progress', '**Status:** Complete'));
}

function finalizeMock(root, worktree, taskId, branch, baseBranch, taskProjectRoot = worktree) {
  completeTaskFile(taskProjectRoot, taskId);
  git(worktree, 'add', '.');
  git(worktree, 'commit', '-m', `Finalize ${taskId}`);
  const taskHead = git(worktree, 'rev-parse', 'HEAD');
  const baseHead = git(root, 'rev-parse', baseBranch);
  return `RESULT: READY_TO_MERGE | task_id=${taskId} | task_head=${taskHead} | base_head=${baseHead} | merge_message=Merge ${taskId}: complete task`;
}

function validated(worktree, iterations = 1, fixed = 0, unworked = 0) {
  return `RESULT: VALIDATED | iterations=${iterations} | fixed=${fixed} | unworked=${unworked} | validated_head=${git(worktree, 'rev-parse', 'HEAD')}`;
}

function writePlan(projectRoot, taskId = 'TASK-004') {
  write(
    path.join(projectRoot, '.groundwork-plans', `${taskId}-plan.md`),
    `# Implementation Plan: ${taskId}\n\n## Context\n- Identifier: ${taskId}\n- Branch prefix: task\n`
  );
}

function assertPrecreatedWorktree(root, worktree, branch) {
  assert.ok(fs.existsSync(worktree), `runner did not precreate ${worktree}`);
  assert.strictEqual(git(root, 'rev-parse', `refs/heads/${branch}`), git(root, 'rev-parse', 'HEAD'));
}

function waitForFile(file, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(file)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${file}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
}

function gateChild(root, mode, project, taskId, readyFile, releaseFile, blockedFile = '', pauses = {}) {
  return spawn(process.execPath, [
    path.join(PLUGIN_ROOT, 'tests', 'fixtures', 'repository-gate-child.js'),
    RUNNER,
    path.join(root, '.git'),
    mode,
    project,
    taskId,
    readyFile,
    releaseFile,
    blockedFile,
    pauses.publishReady || '',
    pauses.publishRelease || '',
    pauses.removeReady || '',
    pauses.removeRelease || '',
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
}

describe('module and CLI contract', () => {
  test('exposes a terminal runner deep-module API', () => {
    assert.ok(fs.existsSync(RUNNER), 'bin/groundwork-run.js is missing');
    const runner = require(RUNNER);
    for (const name of [
      'parseArgs',
      'parseTaskCatalog',
      'orderTasks',
      'parsePlanResult',
      'parseImplementationResult',
      'parseValidationResult',
      'parseFinalizeResult',
      'buildInvocation',
      'formatElapsed',
      'formatLocalTimestamp',
      'normalizeActivity',
      'assertRegisteredWorktree',
      'acquireProjectLease',
      'acquireRepositoryGate',
      'processStartIdentity',
      'runTasks',
    ]) {
      assert.strictEqual(typeof runner[name], 'function', `${name} is not exported`);
    }
    assert.strictEqual(runner.acquireRunnerLease, undefined, 'obsolete global lease must not be exported');
  });

  test('serializes complete tasks for one project without blocking another project lease', () => {
    const { acquireProjectLease } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-project-lease-'));
    const waits = [];
    let releaseApi;
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      releaseApi = acquireProjectLease(commonDir, { project: 'api', taskId: 'TASK-004' }, {
        log: () => {}, now: () => 1_000,
      });
      const releaseWeb = acquireProjectLease(commonDir, { project: 'web', taskId: 'TASK-004' }, {
        log: () => {}, now: () => 1_000,
      });
      const releaseNextApi = acquireProjectLease(commonDir, { project: 'api', taskId: 'TASK-005' }, {
        log: () => {}, now: () => 31_000,
        wait(milliseconds) { waits.push(milliseconds); releaseApi(); },
      });
      assert.deepStrictEqual(waits, [1_000]);
      releaseWeb();
      releaseNextApi();
    } finally {
      if (releaseApi) {
        try { releaseApi(); } catch {}
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('gives a waiting writer priority over new repository readers', () => {
    const { acquireRepositoryGate } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-repository-gate-'));
    let releaseReader;
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      releaseReader = acquireRepositoryGate(commonDir, 'read', { project: 'api', taskId: 'TASK-004' }, {
        log: () => {}, now: () => 1_000,
      });
      const writer = acquireRepositoryGate(commonDir, 'write', { project: 'api', taskId: 'TASK-004' }, {
        log: () => {}, now: () => 31_000,
        wait() { releaseReader(); },
      });
      const reader = acquireRepositoryGate(commonDir, 'read', { project: 'web', taskId: 'TASK-004' }, {
        log: () => {}, now: () => 61_000,
        wait() { writer(); },
      });
      reader();
    } finally {
      if (releaseReader) {
        try { releaseReader(); } catch {}
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('reclaims a stale repository gate lease before admitting a reader', () => {
    const { acquireRepositoryGate } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-stale-gate-'));
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const writer = path.join(commonDir, 'groundwork', 'repository-gate', 'writer.lock');
      write(writer, `${JSON.stringify({
        version: 1,
        pid: 2147483647,
        token: 'a'.repeat(48),
        project: 'stale',
        taskId: 'TASK-999',
        startedAt: 1,
      })}\n`);
      const release = acquireRepositoryGate(commonDir, 'read', { project: 'api', taskId: 'TASK-004' }, {
        log: () => {}, now: () => 1_000,
      });
      assert.strictEqual(fs.existsSync(writer), false);
      release();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('reclaims a lease when its PID belongs to a different process instance', () => {
    const { acquireRepositoryGate, processStartIdentity } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-reused-pid-'));
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const writer = path.join(commonDir, 'groundwork', 'repository-gate', 'writer.lock');
      write(writer, `${JSON.stringify({
        version: 1,
        pid: process.pid,
        processStart: `${processStartIdentity(process.pid)}-old`,
        token: 'a'.repeat(48),
        project: 'stale',
        projectPath: '.',
        taskId: 'TASK-999',
        startedAt: Date.now() - 60_000,
      })}\n`);

      const release = acquireRepositoryGate(
        commonDir,
        'read',
        { project: 'api', projectPath: '.', taskId: 'TASK-004' },
        { log: () => {} }
      );

      release();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('blocks new readers while a writer intent is queued', () => {
    const { acquireRepositoryGate, processStartIdentity } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-writer-intent-'));
    let waits = 0;
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const waitingDir = path.join(commonDir, 'groundwork', 'repository-gate', 'writers-waiting');
      const token = 'b'.repeat(48);
      const intent = path.join(waitingDir, `${token}.lock`);
      write(intent, `${JSON.stringify({
        version: 1,
        pid: process.pid,
        processStart: processStartIdentity(process.pid),
        token,
        project: 'api',
        projectPath: '.',
        taskId: 'TASK-004',
        startedAt: Date.now(),
      })}\n`);

      const release = acquireRepositoryGate(
        commonDir,
        'read',
        { project: 'web', projectPath: '.', taskId: 'TASK-005' },
        {
          log: () => {},
          wait() {
            waits++;
            fs.unlinkSync(intent);
          },
        }
      );

      assert.strictEqual(waits, 1);
      release();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('retries when a cooperative holder releases before lease inspection', () => {
    const { acquireRepositoryGate } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-release-race-'));
    let releaseWriter;
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const writerPath = path.join(commonDir, 'groundwork', 'repository-gate', 'writer.lock');
      releaseWriter = acquireRepositoryGate(
        commonDir,
        'write',
        { project: 'api', projectPath: '.', taskId: 'TASK-004' },
        { log: () => {} }
      );
      let released = false;
      const releaseReader = acquireRepositoryGate(
        commonDir,
        'read',
        { project: 'web', projectPath: '.', taskId: 'TASK-005' },
        {
          log: () => {},
          beforeLeaseInspect(file) {
            if (!released && file === writerPath) {
              released = true;
              releaseWriter();
            }
          },
        }
      );
      releaseReader();
      assert.strictEqual(released, true);
    } finally {
      if (releaseWriter) {
        try { releaseWriter(); } catch {}
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('cleans up newly acquired gate leases when peer enumeration fails', () => {
    const { acquireRepositoryGate } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-scan-cleanup-'));
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const gateRoot = path.join(commonDir, 'groundwork', 'repository-gate');
      const waiting = path.join(gateRoot, 'writers-waiting');
      let waitingScans = 0;
      assert.throws(
        () => acquireRepositoryGate(
          commonDir,
          'read',
          { project: 'api', projectPath: '.', taskId: 'TASK-004' },
          {
            log: () => {},
            beforeLeaseDirectoryScan(directory) {
              if (directory === waiting && ++waitingScans === 2) write(path.join(waiting, 'invalid.lock'), 'bad\n');
            },
          }
        ),
        /filename is invalid/
      );
      assert.deepStrictEqual(fs.readdirSync(path.join(gateRoot, 'readers')), []);

      fs.unlinkSync(path.join(waiting, 'invalid.lock'));
      write(path.join(gateRoot, 'readers', 'invalid.lock'), 'bad\n');
      assert.throws(
        () => acquireRepositoryGate(
          commonDir,
          'write',
          { project: 'api', projectPath: '.', taskId: 'TASK-004' },
          { log: () => {} }
        ),
        /filename is invalid/
      );
      assert.strictEqual(fs.existsSync(path.join(gateRoot, 'writer.lock')), false);
      assert.deepStrictEqual(fs.readdirSync(waiting), []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('waits for a live legacy reclaimer before publishing a successor lease', () => {
    const { acquireRepositoryGate, processStartIdentity } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-live-legacy-recovery-'));
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const gateRoot = path.join(commonDir, 'groundwork', 'repository-gate');
      const writer = path.join(gateRoot, 'writer.lock');
      const recovery = path.join(gateRoot, '.reclaim.lock');
      const staleWriter = {
        version: 1,
        pid: 2147483647,
        processStart: 'dead',
        token: 'a'.repeat(48),
        project: 'stale',
        projectPath: '.',
        taskId: 'TASK-999',
        startedAt: 1,
      };
      write(writer, `${JSON.stringify(staleWriter)}\n`);
      write(recovery, `${JSON.stringify({
        version: 1,
        pid: process.pid,
        processStart: processStartIdentity(process.pid),
        token: 'b'.repeat(48),
        project: 'recovery',
        projectPath: '.',
        taskId: 'setup',
        startedAt: Date.now(),
      })}\n`);

      let legacyRemovalCompleted = false;
      const release = acquireRepositoryGate(
        commonDir,
        'read',
        { project: 'api', projectPath: '.', taskId: 'TASK-004' },
        {
          log: () => {},
          wait() {
            assert.strictEqual(fs.readFileSync(writer, 'utf8'), `${JSON.stringify(staleWriter)}\n`);
            assert.strictEqual(
              fs.readdirSync(path.join(gateRoot, 'readers')).filter((name) => name.endsWith('.lock')).length,
              0,
              'the new runner published a successor before the legacy unlink boundary completed'
            );
            fs.unlinkSync(writer);
            fs.unlinkSync(recovery);
            legacyRemovalCompleted = true;
          },
        }
      );

      assert.strictEqual(legacyRemovalCompleted, true);
      release();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('serializes a new reclaimer and successor behind a paused legacy reclaimer', () => {
    const { acquireRepositoryGate } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-legacy-reclaimer-race-'));
    const signals = path.join(root, 'signals');
    fs.mkdirSync(signals);
    const children = [];
    let successorRelease;
    let successorReady;
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const gateRoot = path.join(commonDir, 'groundwork', 'repository-gate');
      const writer = path.join(gateRoot, 'writer.lock');
      write(writer, `${JSON.stringify({
        version: 1,
        pid: 2147483647,
        processStart: 'dead',
        token: 'a'.repeat(48),
        project: 'stale',
        projectPath: '.',
        taskId: 'TASK-999',
        startedAt: 1,
      })}\n`);

      const file = (name) => path.join(signals, name);
      const legacyStart = file('legacy-start');
      const legacyReady = file('legacy-ready');
      const legacyRelease = file('legacy-release');
      const legacyDone = file('legacy-done');
      children.push(spawn(process.execPath, [
        path.join(PLUGIN_ROOT, 'tests', 'fixtures', 'legacy-reclaimer-child.js'),
        RUNNER,
        commonDir,
        legacyStart,
        legacyReady,
        legacyRelease,
        legacyDone,
      ], { stdio: ['ignore', 'ignore', 'inherit'] }));

      let recoveryBoundaryReached = false;
      let legacyReleased = false;
      const release = acquireRepositoryGate(
        commonDir,
        'write',
        { project: 'new', projectPath: '.', taskId: 'TASK-004' },
        {
          log: () => {},
          beforeLegacyRecoveryPublish() {
            if (recoveryBoundaryReached) return;
            recoveryBoundaryReached = true;
            write(legacyStart, 'start\n');
            waitForFile(legacyReady);

            successorReady = file('successor-ready');
            successorRelease = file('successor-release');
            children.push(gateChild(
              root,
              'write',
              'successor',
              'TASK-005',
              successorReady,
              successorRelease,
              file('successor-blocked')
            ));
            waitForFile(file('successor-blocked'));
            assert.strictEqual(fs.existsSync(successorReady), false);
            assert.strictEqual(fs.readFileSync(writer, 'utf8').includes('"project":"stale"'), true);
          },
          mutationWait() {
            if (!legacyReleased) {
              legacyReleased = true;
              assert.strictEqual(fs.existsSync(successorReady), false);
              write(legacyRelease, 'release\n');
              waitForFile(legacyDone);
            }
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
          },
          wait() {
            if (!successorReady) {
              throw new Error('new reclaimer skipped the atomic legacy recovery boundary');
            }
            waitForFile(successorReady);
            write(successorRelease, 'release\n');
            waitForFile(path.join(signals, 'successor-ready.released'));
          },
        }
      );

      assert.strictEqual(recoveryBoundaryReached, true);
      assert.strictEqual(legacyReleased, true);
      release();
    } finally {
      if (successorRelease && !fs.existsSync(successorRelease)) write(successorRelease, 'release\n');
      for (const child of children) child.kill();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('publishes complete lease records and cleans staging files when initialization fails', () => {
    const { acquireProjectLease, acquireRepositoryGate } = require(RUNNER);
    const scenarios = [
      {
        name: 'project',
        target: (file) => file.includes(`${path.sep}projects${path.sep}`),
        acquire: (commonDir, dependencies) => acquireProjectLease(
          commonDir,
          { project: 'api', projectPath: '.', taskId: 'TASK-004' },
          dependencies
        ),
      },
      {
        name: 'reader',
        target: (file) => file.includes(`${path.sep}readers${path.sep}`),
        acquire: (commonDir, dependencies) => acquireRepositoryGate(
          commonDir,
          'read',
          { project: 'api', projectPath: '.', taskId: 'TASK-004' },
          dependencies
        ),
      },
      {
        name: 'writer intent',
        target: (file) => file.includes(`${path.sep}writers-waiting${path.sep}`),
        acquire: (commonDir, dependencies) => acquireRepositoryGate(
          commonDir,
          'write',
          { project: 'api', projectPath: '.', taskId: 'TASK-004' },
          dependencies
        ),
      },
      {
        name: 'writer',
        target: (file) => file.endsWith(`${path.sep}writer.lock`),
        acquire: (commonDir, dependencies) => acquireRepositoryGate(
          commonDir,
          'write',
          { project: 'api', projectPath: '.', taskId: 'TASK-004' },
          dependencies
        ),
      },
    ];

    const phases = ['create', 'partial write', 'fsync', 'directory fsync'];
    for (const scenario of scenarios) {
      for (const phase of phases) {
        const root = fs.mkdtempSync(path.join(
          os.tmpdir(),
          `gw-run-atomic-${scenario.name.replace(' ', '-')}-${phase.replace(' ', '-')}-`
        ));
        try {
          initRepo(root);
          const commonDir = path.join(root, '.git');
          let injected = false;
          function inject(file, stagingFile, fd, currentPhase) {
            if (phase !== currentPhase || !scenario.target(file)) return;
            injected = true;
            assert.strictEqual(
              fs.existsSync(file),
              phase === 'directory fsync',
              `${scenario.name} publication state was wrong during ${phase}`
            );
            if (phase === 'partial write') fs.ftruncateSync(fd, 8);
            if (phase === 'fsync') {
              assert.doesNotThrow(() => JSON.parse(fs.readFileSync(stagingFile, 'utf8')));
            }
            throw new Error(`injected ${scenario.name} ${phase} failure`);
          }
          assert.throws(
            () => scenario.acquire(commonDir, {
              log: () => {},
              afterLeaseStagingCreate(file, stagingFile, fd) {
                inject(file, stagingFile, fd, 'create');
              },
              afterLeaseStagingWrite(file, stagingFile, fd) {
                inject(file, stagingFile, fd, 'partial write');
              },
              afterLeaseStagingSync(file, stagingFile, fd) {
                inject(file, stagingFile, fd, 'fsync');
              },
              beforeLeaseDirectorySync(file) {
                inject(file, null, null, 'directory fsync');
              },
            }),
            new RegExp(`injected ${scenario.name} ${phase} failure`)
          );
          assert.strictEqual(injected, true);
          const groundwork = path.join(commonDir, 'groundwork');
          const remaining = fs.existsSync(groundwork)
            ? fs.readdirSync(groundwork, { recursive: true }).map(String)
            : [];
          assert.deepStrictEqual(
            remaining.filter((name) => name.includes('.staging-') || name.endsWith('.lock')),
            [],
            `${scenario.name} left a published or staging lease behind after ${phase}`
          );
        } finally {
          fs.rmSync(root, { recursive: true, force: true });
        }
      }
    }
  });

  test('cleans a published mutation ticket when choosing-entry removal fails', () => {
    const { acquireRepositoryGate } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-mutation-cleanup-'));
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const originalUnlinkSync = fs.unlinkSync;
      let choosingFailures = 0;
      try {
        fs.unlinkSync = function injectedUnlink(file) {
          if (String(file).includes(`${path.sep}.lease-mutation${path.sep}choosing${path.sep}`)
              && /^[0-9a-f]{48}\.lock$/.test(path.basename(String(file)))) {
            choosingFailures++;
            const error = new Error('injected choosing-entry unlink failure');
            error.code = 'EIO';
            throw error;
          }
          return originalUnlinkSync.apply(this, arguments);
        };
        assert.throws(
          () => acquireRepositoryGate(
            commonDir,
            'read',
            { project: 'api', projectPath: '.', taskId: 'TASK-004' },
            { log: () => {} }
          ),
          /injected choosing-entry unlink failure/
        );
      } finally {
        fs.unlinkSync = originalUnlinkSync;
      }

      assert.ok(choosingFailures >= 2, 'the choosing entry cleanup path was not exercised');
      const tickets = path.join(commonDir, 'groundwork', 'repository-gate', '.lease-mutation', 'tickets');
      assert.deepStrictEqual(fs.readdirSync(tickets), [], 'failed mutation acquisition left a live ticket');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('waits for a live choosing contender with the short mutation retry', () => {
    const { acquireRepositoryGate, processStartIdentity } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-mutation-choosing-'));
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const gateRoot = path.join(commonDir, 'groundwork', 'repository-gate');
      const choosing = path.join(gateRoot, '.lease-mutation', 'choosing');
      const readers = path.join(gateRoot, 'readers');
      const token = 'c'.repeat(48);
      const chooser = path.join(choosing, `${token}.lock`);
      write(chooser, `${JSON.stringify({
        version: 1,
        pid: process.pid,
        processStart: processStartIdentity(process.pid),
        token,
        ticket: 0,
        startedAt: 1,
      })}\n`);

      let mutationWaits = 0;
      const release = acquireRepositoryGate(
        commonDir,
        'read',
        { project: 'api', projectPath: '.', taskId: 'TASK-004' },
        {
          log: () => {},
          mutationWait(milliseconds) {
            mutationWaits++;
            assert.ok(milliseconds <= 25, `slow choosing retry: ${milliseconds}`);
            assert.deepStrictEqual(
              fs.readdirSync(readers).filter((name) => name.endsWith('.lock')),
              [],
              'the contender published while another process was still choosing'
            );
            fs.unlinkSync(chooser);
          },
          wait() {
            throw new Error('choosing contention used the ordinary one-second lease wait');
          },
        }
      );

      assert.strictEqual(mutationWaits, 1);
      release();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('keeps waiting for the oldest mutation owner when a nearer predecessor dies', () => {
    const { acquireRepositoryGate, processStartIdentity } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-mutation-dead-predecessor-'));
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const gateRoot = path.join(commonDir, 'groundwork', 'repository-gate');
      const tickets = path.join(gateRoot, '.lease-mutation', 'tickets');
      const readers = path.join(gateRoot, 'readers');
      const processStart = processStartIdentity(process.pid);
      const oldestToken = '1'.repeat(48);
      const nearerToken = '2'.repeat(48);
      const oldest = path.join(tickets, `${oldestToken}.lock`);
      const nearer = path.join(tickets, `${nearerToken}.lock`);
      for (const [file, token, ticket, pid] of [
        [oldest, oldestToken, 1, 111111],
        [nearer, nearerToken, 2, 222222],
      ]) {
        write(file, `${JSON.stringify({
          version: 1,
          pid,
          processStart: `live:${pid}`,
          token,
          ticket,
          startedAt: 1,
        })}\n`);
      }

      let mutationWaits = 0;
      let nearerIsLive = true;
      const release = acquireRepositoryGate(
        commonDir,
        'read',
        { project: 'api', projectPath: '.', taskId: 'TASK-004' },
        {
          log: () => {},
          processStartIdentity(pid) {
            if (pid === process.pid) return processStart;
            if (pid === 111111) return 'live:111111';
            if (pid === 222222 && nearerIsLive) return 'live:222222';
            return null;
          },
          mutationWait() {
            mutationWaits++;
            assert.deepStrictEqual(
              fs.readdirSync(readers).filter((name) => name.endsWith('.lock')),
              [],
              'the contender entered while the oldest mutation owner was live'
            );
            if (mutationWaits === 1) nearerIsLive = false;
            else fs.unlinkSync(oldest);
          },
        }
      );

      assert.strictEqual(mutationWaits, 2);
      release();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('waits on mutation predecessors with a bounded backing-off retry', () => {
    const { acquireRepositoryGate, processStartIdentity } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-mutation-contention-'));
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const gateRoot = path.join(commonDir, 'groundwork', 'repository-gate');
      const tickets = path.join(gateRoot, '.lease-mutation', 'tickets');
      const readers = path.join(gateRoot, 'readers');
      const processStart = processStartIdentity(process.pid);
      const contenderCount = 20;
      const predecessors = [];
      for (let index = 1; index <= contenderCount; index++) {
        const token = index.toString(16).padStart(48, '0');
        const file = path.join(tickets, `${token}.lock`);
        predecessors.push(file);
        write(file, `${JSON.stringify({
          version: 1,
          pid: process.pid,
          processStart,
          token,
          ticket: index,
          startedAt: 1,
        })}\n`);
      }

      const waits = [];
      let identityChecks = 0;
      const release = acquireRepositoryGate(
        commonDir,
        'read',
        { project: 'api', projectPath: '.', taskId: 'TASK-004' },
        {
          log: () => {},
          processStartIdentity(pid) {
            identityChecks++;
            return pid === process.pid ? processStart : null;
          },
          wait(milliseconds) {
            waits.push(milliseconds);
            assert.deepStrictEqual(
              fs.readdirSync(readers).filter((name) => name.endsWith('.lock')),
              [],
              'the contender bypassed a lower mutation ticket'
            );
            fs.unlinkSync(predecessors[waits.length - 1]);
          },
        }
      );

      assert.strictEqual(waits.length, contenderCount);
      assert.deepStrictEqual(
        waits,
        [10, 20, 40, 80, 160, ...Array(contenderCount - 5).fill(250)],
        `mutation retry progression changed: ${waits.join(',')}`
      );
      assert.ok(
        identityChecks <= contenderCount + 8,
        `mutation acquisition validated nonblocking contenders (${identityChecks} identity checks)`
      );
      release();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects startup when it detects a live pre-upgrade runner', () => {
    const { acquireRepositoryGate } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-main-version-overlap-'));
    const legacyRunner = path.join(root, 'legacy-groundwork-run.js');
    let releaseLegacy;
    try {
      initRepo(root);
      write(
        legacyRunner,
        execFileSync('git', ['show', 'main:bin/groundwork-run.js'], {
          cwd: PLUGIN_ROOT,
          encoding: 'utf8',
        })
      );
      const { acquireRunnerLease } = require(legacyRunner);
      const commonDir = path.join(root, '.git');
      releaseLegacy = acquireRunnerLease(
        commonDir,
        { project: 'legacy', taskId: 'TASK-004' },
        { log: () => {} }
      );
      assert.throws(
        () => acquireRepositoryGate(
          commonDir,
          'write',
          { project: 'new', projectPath: '.', taskId: 'TASK-005' },
          {
            log: () => {},
            wait() {
              throw new Error('v2 must not wait inside a mixed-version repository');
            },
          }
        ),
        /drained upgrade.*stop all earlier runners and launchers/i
      );
    } finally {
      if (releaseLegacy) {
        try { releaseLegacy(); } catch {}
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('new writers do not publish a legacy runner lock', () => {
    const { acquireRepositoryGate } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-main-version-boundary-'));
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const releaseWriter = acquireRepositoryGate(
        commonDir,
        'write',
        { project: 'new', projectPath: '.', taskId: 'TASK-005' },
        { log: () => {} }
      );
      assert.strictEqual(
        fs.existsSync(path.join(commonDir, 'groundwork', 'runner.lock')),
        false,
        'v2 writers must not advertise an atomic compatibility barrier to legacy launchers'
      );
      releaseWriter();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('fails closed without deleting a stale legacy recovery record', () => {
    const { acquireRepositoryGate } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-stale-legacy-recovery-'));
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const gateRoot = path.join(commonDir, 'groundwork', 'repository-gate');
      const writer = path.join(gateRoot, 'writer.lock');
      const recovery = path.join(gateRoot, '.reclaim.lock');
      const stale = (token, project, taskId) => `${JSON.stringify({
        version: 1,
        pid: 2147483647,
        processStart: 'dead',
        token,
        project,
        projectPath: '.',
        taskId,
        startedAt: 1,
      })}\n`;
      const staleWriter = stale('a'.repeat(48), 'stale', 'TASK-999');
      const staleRecovery = stale('b'.repeat(48), 'recovery', 'setup');
      write(writer, staleWriter);
      write(recovery, staleRecovery);

      assert.throws(
        () => acquireRepositoryGate(
          commonDir,
          'read',
          { project: 'api', projectPath: '.', taskId: 'TASK-004' },
          { log: () => {} }
        ),
        /legacy recovery record/
      );
      assert.strictEqual(fs.readFileSync(writer, 'utf8'), staleWriter);
      assert.strictEqual(fs.readFileSync(recovery, 'utf8'), staleRecovery);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('ignores and reclaims stale staging records without blocking lease scans', () => {
    const { acquireRepositoryGate, activeProjectOwners } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-stale-staging-'));
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const gateRoot = path.join(commonDir, 'groundwork', 'repository-gate');
      const stagedWriter = path.join(gateRoot, 'writers-waiting', `.staging-${'a'.repeat(48)}-${'b'.repeat(16)}.tmp`);
      const stagedReader = path.join(gateRoot, 'readers', `.staging-${'c'.repeat(48)}-${'d'.repeat(16)}.tmp`);
      const stagedProject = path.join(commonDir, 'groundwork', 'projects', `.staging-${'e'.repeat(48)}-${'f'.repeat(16)}.tmp`);
      for (const staged of [stagedWriter, stagedReader, stagedProject]) {
        write(staged, '{incomplete');
        fs.utimesSync(staged, new Date(0), new Date(0));
      }

      const releaseReader = acquireRepositoryGate(
        commonDir,
        'read',
        { project: 'api', projectPath: '.', taskId: 'TASK-004' },
        { log: () => {}, stagingReclaimMs: 0 }
      );
      releaseReader();
      const releaseWriter = acquireRepositoryGate(
        commonDir,
        'write',
        { project: 'api', projectPath: '.', taskId: 'TASK-004' },
        { log: () => {}, stagingReclaimMs: 0 }
      );
      releaseWriter();
      assert.deepStrictEqual(
        activeProjectOwners(commonDir, root, { stagingReclaimMs: 0, registeredWorktrees: () => [] }),
        []
      );
      for (const staged of [stagedWriter, stagedReader, stagedProject]) {
        assert.strictEqual(fs.existsSync(staged), false, `${staged} was not reclaimed`);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('keeps a release handle when final staging cleanup fails', () => {
    const { acquireRepositoryGate } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-staging-cleanup-failure-'));
    const originalUnlinkSync = fs.unlinkSync;
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      fs.unlinkSync = function injectedUnlink(file) {
        if (path.basename(String(file)).startsWith('.staging-')) {
          const error = new Error('injected staging cleanup failure');
          error.code = 'EIO';
          throw error;
        }
        return originalUnlinkSync.apply(this, arguments);
      };
      let release;
      assert.doesNotThrow(() => {
        release = acquireRepositoryGate(
          commonDir,
          'read',
          { project: 'api', projectPath: '.', taskId: 'TASK-004' },
          { log: () => {} }
        );
      });
      fs.unlinkSync = originalUnlinkSync;
      assert.strictEqual(typeof release, 'function');
      const readers = path.join(commonDir, 'groundwork', 'repository-gate', 'readers');
      const publishedReader = fs.readdirSync(readers).find((name) => name.endsWith('.lock'));
      assert.ok(publishedReader, 'acquisition did not retain a published reader lease');
      assert.throws(
        () => acquireRepositoryGate(
          commonDir,
          'write',
          { project: 'api', projectPath: '.', taskId: 'TASK-004' },
          {
            log: () => {},
            wait() {
              assert.strictEqual(fs.existsSync(path.join(readers, publishedReader)), true);
              throw new Error('published reader lease still owns the gate');
            },
          }
        ),
        /published reader lease still owns the gate/
      );
      release();
      assert.strictEqual(fs.existsSync(path.join(readers, publishedReader)), false);
      const releaseWriter = acquireRepositoryGate(
        commonDir,
        'write',
        { project: 'api', projectPath: '.', taskId: 'TASK-004' },
        { log: () => {} }
      );
      releaseWriter();
    } finally {
      fs.unlinkSync = originalUnlinkSync;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('reads registered worktrees once while checking all active project owners', () => {
    const { activeProjectOwners, processStartIdentity } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-project-owner-registry-'));
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const projectDirectory = path.join(commonDir, 'groundwork', 'projects');
      const records = [
        { project: 'api', projectPath: 'apps/api', taskId: 'TASK-004' },
        { project: 'web', projectPath: 'apps/web', taskId: 'TASK-005' },
      ].map((owner) => {
        const worktreePath = path.join(root, '.worktrees', `${owner.project}-${owner.taskId}`);
        fs.mkdirSync(worktreePath, { recursive: true });
        const projectKey = crypto.createHash('sha256').update(owner.project).digest('hex').slice(0, 32);
        const checkpointKey = crypto.createHash('sha256').update(owner.projectPath).digest('hex').slice(0, 16);
        write(path.join(projectDirectory, `${projectKey}.lock`), `${JSON.stringify({
          version: 1,
          pid: process.pid,
          processStart: processStartIdentity(process.pid),
          token: crypto.randomBytes(24).toString('hex'),
          ...owner,
          startedAt: Date.now(),
        })}\n`);
        write(path.join(commonDir, 'groundwork', 'runner', checkpointKey, `${owner.taskId}.json`), `${JSON.stringify({
          taskId: owner.taskId,
          project: owner.projectPath,
          workspace: { branch: `task/${owner.project}/${owner.taskId}`, worktreePath },
        })}\n`);
        return { path: fs.realpathSync(worktreePath), branch: `refs/heads/task/${owner.project}/${owner.taskId}` };
      });
      let discoveries = 0;
      const owners = activeProjectOwners(commonDir, root, {
        registeredWorktrees() { discoveries++; return records; },
      });
      assert.strictEqual(discoveries, 1);
      assert.deepStrictEqual(owners.map((owner) => owner.project).sort(), ['api', 'web']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('serializes stale removal with successor publication at the final removal boundary', () => {
    const { acquireRepositoryGate } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-stale-removal-boundary-'));
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const writer = path.join(commonDir, 'groundwork', 'repository-gate', 'writer.lock');
      write(writer, `${JSON.stringify({
        version: 1,
        pid: 2147483647,
        processStart: 'dead',
        token: 'a'.repeat(48),
        project: 'stale',
        projectPath: '.',
        taskId: 'TASK-999',
        startedAt: 1,
      })}\n`);
      let checkedBoundary = false;
      const releaseReader = acquireRepositoryGate(
        commonDir,
        'read',
        { project: 'reader', projectPath: '.', taskId: 'TASK-004' },
        {
          log: () => {},
          beforeLeaseRemove(file) {
            if (checkedBoundary || file !== writer) return;
            checkedBoundary = true;
            assert.throws(
              () => acquireRepositoryGate(
                commonDir,
                'write',
                { project: 'successor', projectPath: '.', taskId: 'TASK-005' },
                { log: () => {}, wait() { throw new Error('successor blocked by lease mutation'); } }
              ),
              /successor blocked by lease mutation/
            );
          },
        }
      );
      assert.strictEqual(checkedBoundary, true);
      releaseReader();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('coordinates repository gates and project leases across processes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-cross-process-gates-'));
    const signals = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-cross-project-signals-'));
    const children = [];
    try {
      initRepo(root);
      const readAReady = path.join(signals, 'read-a-ready');
      const readBReady = path.join(signals, 'read-b-ready');
      const readARelease = path.join(signals, 'read-a-release');
      const readBRelease = path.join(signals, 'read-b-release');
      children.push(gateChild(root, 'read', 'api', 'TASK-004', readAReady, readARelease));
      children.push(gateChild(root, 'read', 'web', 'TASK-005', readBReady, readBRelease));
      waitForFile(readAReady);
      waitForFile(readBReady);

      const projectAReady = path.join(signals, 'project-a-ready');
      const projectBReady = path.join(signals, 'project-b-ready');
      const projectBBlocked = path.join(signals, 'project-b-blocked');
      const projectARelease = path.join(signals, 'project-a-release');
      const projectBRelease = path.join(signals, 'project-b-release');
      children.push(gateChild(root, 'project', 'api', 'TASK-006', projectAReady, projectARelease));
      waitForFile(projectAReady);
      children.push(gateChild(root, 'project', 'api', 'TASK-007', projectBReady, projectBRelease, projectBBlocked));
      waitForFile(projectBBlocked);
      assert.strictEqual(fs.existsSync(projectBReady), false);

      write(projectARelease, 'release\n');
      waitForFile(projectBReady);
      for (const file of [readARelease, readBRelease, projectBRelease]) write(file, 'release\n');
      for (const ready of [readAReady, readBReady, projectAReady, projectBReady]) {
        waitForFile(path.join(signals, `${path.basename(ready)}.released`));
      }
    } finally {
      for (const child of children) child.kill();
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(signals, { recursive: true, force: true });
    }
  });

  test('keeps a complete staged writer private while a competing process waits', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-cross-process-publish-'));
    const signals = path.join(root, 'signals');
    fs.mkdirSync(signals);
    const children = [];
    try {
      initRepo(root);
      const file = (name) => path.join(signals, name);
      children.push(gateChild(
        root,
        'write',
        'api',
        'TASK-004',
        file('first-ready'),
        file('first-release'),
        file('first-blocked'),
        { publishReady: file('publish-ready'), publishRelease: file('publish-release') }
      ));
      waitForFile(file('publish-ready'));
      const gateRoot = path.join(root, '.git', 'groundwork', 'repository-gate');
      assert.strictEqual(fs.existsSync(path.join(gateRoot, 'writer.lock')), false);
      const staged = fs.readdirSync(gateRoot).filter((name) => name.startsWith('.staging-'));
      assert.strictEqual(staged.length, 1);
      assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(gateRoot, staged[0]), 'utf8')));

      children.push(gateChild(
        root,
        'write',
        'web',
        'TASK-005',
        file('second-ready'),
        file('second-release'),
        file('second-blocked')
      ));
      waitForFile(file('second-blocked'));
      assert.strictEqual(fs.existsSync(file('second-ready')), false);

      write(file('publish-release'), 'continue\n');
      waitForFile(file('first-ready'));
      assert.strictEqual(fs.existsSync(file('second-ready')), false);
      write(file('first-release'), 'release\n');
      waitForFile(file('second-ready'));
      write(file('second-release'), 'release\n');
    } finally {
      for (const child of children) child.kill();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('gives a queued writer priority over a new reader across processes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-cross-process-priority-'));
    const signals = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-priority-signals-'));
    const children = [];
    try {
      initRepo(root);
      const file = (name) => path.join(signals, name);
      children.push(gateChild(root, 'read', 'api', 'TASK-004', file('reader-a-ready'), file('reader-a-release')));
      waitForFile(file('reader-a-ready'));
      children.push(gateChild(root, 'write', 'web', 'TASK-005', file('writer-ready'), file('writer-release'), file('writer-blocked')));
      waitForFile(file('writer-blocked'));
      const waitingWriters = path.join(root, '.git', 'groundwork', 'repository-gate', 'writers-waiting');
      assert.strictEqual(fs.readdirSync(waitingWriters).filter((name) => name.endsWith('.lock')).length, 1);
      children.push(gateChild(root, 'read', 'docs', 'TASK-006', file('reader-c-ready'), file('reader-c-release'), file('reader-c-blocked')));
      waitForFile(file('reader-c-blocked'));
      assert.strictEqual(fs.existsSync(file('writer-ready')), false);
      assert.strictEqual(fs.existsSync(file('reader-c-ready')), false);

      write(file('reader-a-release'), 'release\n');
      waitForFile(file('writer-ready'));
      assert.strictEqual(fs.existsSync(file('reader-c-ready')), false);
      write(file('writer-release'), 'release\n');
      waitForFile(file('reader-c-ready'));
      write(file('reader-c-release'), 'release\n');
    } finally {
      for (const child of children) child.kill();
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(signals, { recursive: true, force: true });
    }
  });

  test('runs different monorepo projects concurrently without shared Git-state corruption', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-cross-project-runners-'));
    const signals = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-cross-project-signals-'));
    const children = [];
    try {
      git(root, 'init', '-b', 'main');
      git(root, 'config', 'user.email', 'test@example.com');
      git(root, 'config', 'user.name', 'Test User');
      write(path.join(root, '.groundwork.yml'), 'version: 1\nprojects:\n  api:\n    path: apps/api\n  web:\n    path: apps/web\n');
      for (const project of ['api', 'web']) {
        write(path.join(root, 'apps', project, 'specs', 'tasks.md'), '### TASK-004: Four\n**Status:** Not Started\n**Blocked by:** None\n');
      }
      write(path.join(root, '.gitignore'), '.worktrees/\n.groundwork-plans/\n');
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'base');
      const baseHead = git(root, 'rev-parse', 'main');
      const exclude = fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8');

      for (const project of ['api', 'web']) {
        children.push(spawn(process.execPath, [
          path.join(PLUGIN_ROOT, 'tests', 'fixtures', 'parallel-runner-child.js'),
          RUNNER,
          root,
          project,
          path.join(signals, `${project}-ready`),
          path.join(signals, `${project}-release`),
          path.join(signals, `${project}-done`),
        ], { stdio: ['ignore', 'ignore', 'inherit'] }));
      }
      waitForFile(path.join(signals, 'api-ready'), 10_000);
      waitForFile(path.join(signals, 'web-ready'), 10_000);
      assert.strictEqual(git(root, 'rev-parse', 'main'), baseHead);
      const inFlightExclude = fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8');
      assert.strictEqual(inFlightExclude, `${exclude}/apps/api/.groundwork-plans/\n/apps/web/.groundwork-plans/\n`);
      const registry = git(root, 'worktree', 'list', '--porcelain');
      assert.match(registry, /branch refs\/heads\/task\/api\/TASK-004/);
      assert.match(registry, /branch refs\/heads\/task\/web\/TASK-004/);

      write(path.join(signals, 'api-release'), 'release\n');
      write(path.join(signals, 'web-release'), 'release\n');
      waitForFile(path.join(signals, 'api-done'), 20_000);
      waitForFile(path.join(signals, 'web-done'), 20_000);
      for (const project of ['api', 'web']) {
        const result = fs.readFileSync(path.join(signals, `${project}-done`), 'utf8');
        assert.strictEqual(result, 'done\n', result);
        assert.match(fs.readFileSync(path.join(root, 'apps', project, 'specs', 'tasks.md'), 'utf8'), /\*\*Status:\*\* Complete/);
      }
      assert.strictEqual(fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8'), inFlightExclude);
    } finally {
      for (const child of children) child.kill();
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(signals, { recursive: true, force: true });
    }
  });

  test('serializes three stale-writer reclaimers across the final identity-check boundary', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-cross-process-reclaim-'));
    const signals = path.join(root, 'signals');
    fs.mkdirSync(signals);
    const children = [];
    try {
      initRepo(root);
      const writer = path.join(root, '.git', 'groundwork', 'repository-gate', 'writer.lock');
      write(writer, `${JSON.stringify({
        version: 1,
        pid: 2147483647,
        processStart: 'dead',
        token: 'a'.repeat(48),
        project: 'stale',
        projectPath: '.',
        taskId: 'TASK-999',
        startedAt: 1,
      })}\n`);
      const firstReady = path.join(signals, 'first-ready');
      const secondReady = path.join(signals, 'second-ready');
      const firstRelease = path.join(signals, 'first-release');
      const secondRelease = path.join(signals, 'second-release');
      const firstBlocked = path.join(signals, 'first-blocked');
      const secondBlocked = path.join(signals, 'second-blocked');
      const thirdReady = path.join(signals, 'third-ready');
      const thirdRelease = path.join(signals, 'third-release');
      const thirdBlocked = path.join(signals, 'third-blocked');
      const removeReady = path.join(signals, 'remove-ready');
      const removeRelease = path.join(signals, 'remove-release');
      children.push(gateChild(
        root,
        'write',
        'api',
        'TASK-004',
        firstReady,
        firstRelease,
        firstBlocked,
        { removeReady, removeRelease }
      ));
      waitForFile(removeReady);
      children.push(gateChild(root, 'write', 'web', 'TASK-005', secondReady, secondRelease, secondBlocked));
      children.push(gateChild(root, 'write', 'docs', 'TASK-006', thirdReady, thirdRelease, thirdBlocked));
      waitForFile(secondBlocked);
      waitForFile(thirdBlocked);
      assert.strictEqual(fs.existsSync(firstReady), false);
      assert.strictEqual(fs.existsSync(secondReady), false);
      assert.strictEqual(fs.existsSync(thirdReady), false);

      write(removeRelease, 'continue\n');
      const contenders = [
        { ready: firstReady, release: firstRelease },
        { ready: secondReady, release: secondRelease },
        { ready: thirdReady, release: thirdRelease },
      ];
      const deadline = Date.now() + 10_000;
      while (!contenders.some((contender) => fs.existsSync(contender.ready))) {
        if (Date.now() >= deadline) throw new Error('No contender acquired the reclaimed writer gate');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
      const firstAcquired = contenders.find((contender) => fs.existsSync(contender.ready));
      assert.strictEqual(contenders.filter((contender) => fs.existsSync(contender.ready)).length, 1);
      write(firstAcquired.release, 'release\n');

      const remaining = contenders.filter((contender) => contender !== firstAcquired);
      while (!remaining.some((contender) => fs.existsSync(contender.ready))) {
        if (Date.now() >= deadline) throw new Error('No second contender acquired the writer gate');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
      const secondAcquired = remaining.find((contender) => fs.existsSync(contender.ready));
      assert.strictEqual(remaining.filter((contender) => fs.existsSync(contender.ready)).length, 1);
      write(secondAcquired.release, 'release\n');
      const finalContender = remaining.find((contender) => contender !== secondAcquired);
      waitForFile(finalContender.ready);
      write(finalContender.release, 'release\n');
    } finally {
      for (const child of children) child.kill();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('runTasks waits for repository writers and releases its gate after failure', () => {
    const { acquireRepositoryGate, runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-lease-integration-'));
    let releaseFirst;
    let waits = 0;
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      releaseFirst = acquireRepositoryGate(
        commonDir,
        'write',
        { project: 'other', taskId: 'TASK-999' },
        { log: () => {}, now: () => 1_000 }
      );

      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            log: () => {},
            leaseNow: () => 31_000,
            leaseWait() {
              waits++;
              releaseFirst();
            },
            invokePhase() {
              throw new Error('phase reached');
            },
          }
        ),
        /phase reached/
      );
      assert.strictEqual(waits, 1);
      assert.strictEqual(fs.existsSync(path.join(commonDir, 'groundwork', 'runner.lock')), false);
    } finally {
      if (releaseFirst) {
        try { releaseFirst(); } catch {}
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('runTasks releases its reader gate when peer enumeration fails before a phase', () => {
    const { acquireRepositoryGate, runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-peer-enumeration-cleanup-'));
    try {
      initRepo(root);
      const commonDir = path.join(root, '.git');
      const projects = path.join(commonDir, 'groundwork', 'projects');
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            log: () => {},
            beforePhase() { write(path.join(projects, 'invalid.lock'), 'bad\n'); },
            invokePhase() { throw new Error('phase should not be reached'); },
          }
        ),
        /Project lease filename is invalid/
      );
      assert.deepStrictEqual(
        fs.readdirSync(path.join(commonDir, 'groundwork', 'repository-gate', 'readers')),
        []
      );
      fs.unlinkSync(path.join(projects, 'invalid.lock'));
      const releaseWriter = acquireRepositoryGate(
        commonDir,
        'write',
        { project: 'other', projectPath: '.', taskId: 'TASK-999' },
        { log: () => {}, wait() { throw new Error('reader gate leaked'); } }
      );
      releaseWriter();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('supports explicit task and all subcommands', () => {
    const { parseArgs } = require(RUNNER);
    assert.deepStrictEqual(
      parseArgs(['task', '4', '--harness', 'claude', '--project', 'api']),
      {
        command: 'task',
        harness: 'claude',
        repo: process.cwd(),
        project: 'api',
        tasks: ['TASK-004'],
        fromTask: null,
        toTask: null,
        dryRun: false,
      }
    );
    assert.deepStrictEqual(
      parseArgs(['all', '--harness', 'codex', '--dry-run']).command,
      'all'
    );
    assert.throws(() => parseArgs(['--harness', 'codex']), /task or all/);
    assert.throws(() => parseArgs(['all', '--harness', 'pi']), /claude or codex/);
  });

  test('accepts explicit task lists and inclusive range bounds', () => {
    const { parseArgs } = require(RUNNER);
    assert.deepStrictEqual(
      parseArgs(['task', '4', 'TASK-009', '--harness', 'codex']).tasks,
      ['TASK-004', 'TASK-009']
    );
    const range = parseArgs(['all', '--from', '2', '--to', 'TASK-009', '--harness', 'claude']);
    assert.strictEqual(range.fromTask, 'TASK-002');
    assert.strictEqual(range.toTask, 'TASK-009');
    assert.throws(
      () => parseArgs(['task', '4', '--from', '2', '--harness', 'codex']),
      /task list.*range/i
    );
    assert.throws(
      () => parseArgs(['all', '--from', '9', '--to', '2', '--harness', 'codex']),
      /from.*before.*to/i
    );
  });

  test('dry-run does not modify repository-local excludes', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-dry-run-'));
    try {
      initRepo(root);
      const exclude = path.join(root, '.git', 'info', 'exclude');
      const before = fs.readFileSync(exclude, 'utf8');
      assert.deepStrictEqual(
        runTasks({
          command: 'all',
          harness: 'codex',
          repo: root,
          project: null,
          tasks: [],
          dryRun: true,
        }, { log: () => {} }),
        ['TASK-004']
      );
      assert.strictEqual(fs.readFileSync(exclude, 'utf8'), before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('dry-run selects an inclusive task range in catalog order', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-range-'));
    try {
      git(root, 'init', '-b', 'main');
      git(root, 'config', 'user.email', 'test@example.com');
      git(root, 'config', 'user.name', 'Test User');
      write(path.join(root, 'specs', 'tasks.md'),
        '### TASK-001: One\n**Status:** Not Started\n**Blocked by:** None\n\n' +
        '### TASK-002: Two\n**Status:** Not Started\n**Blocked by:** None\n\n' +
        '### TASK-003: Three\n**Status:** Complete\n**Blocked by:** None\n\n' +
        '### TASK-004: Four\n**Status:** Not Started\n**Blocked by:** None\n');
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'base');

      const selected = runTasks({
        command: 'all',
        harness: 'codex',
        repo: root,
        project: null,
        tasks: [],
        fromTask: 'TASK-002',
        toTask: 'TASK-004',
        dryRun: true,
      }, { log: () => {} });

      assert.deepStrictEqual(selected, ['TASK-002', 'TASK-004']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('requires the primary worktree as the repository root', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-primary-'));
    const linked = path.join(root, '.worktrees', 'existing');
    try {
      initRepo(root);
      git(root, 'worktree', 'add', '-b', 'task/existing', linked);
      assert.throws(
        () => runTasks({
          command: 'all',
          harness: 'codex',
          repo: linked,
          project: null,
          tasks: [],
          dryRun: true,
        }, { log: () => {} }),
        /primary worktree/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('task catalog', () => {
  const markdown = `### TASK-003: Third
**Status:** Not Started
**Blocked by:** TASK-001, TASK-002

### TASK-001: First
**Status:** Complete
**Blocked by:** None

### TASK-002: Second
**Status:** Not Started
**Blocked by:** TASK-001
`;

  test('parses list-prefixed task status metadata', () => {
    const { parseTaskCatalog } = require(RUNNER);
    const task = parseTaskCatalog(
      '### TASK-074: Training capsule\n\n- **Status:** Complete\n- **Blocked by:** None\n'
    ).get('TASK-074');

    assert.strictEqual(task.status, 'Complete');
    assert.deepStrictEqual(task.blockedBy, []);
  });

  test('parses and topologically orders incomplete tasks', () => {
    const { parseTaskCatalog, orderTasks } = require(RUNNER);
    const catalog = parseTaskCatalog(markdown);
    assert.deepStrictEqual(catalog.get('TASK-003').blockedBy, ['TASK-001', 'TASK-002']);
    assert.deepStrictEqual(orderTasks(catalog), ['TASK-002', 'TASK-003']);
    assert.deepStrictEqual(orderTasks(catalog, ['TASK-003', 'TASK-002']), ['TASK-002', 'TASK-003']);
  });

  test('rejects missing dependencies and cycles', () => {
    const { parseTaskCatalog, orderTasks } = require(RUNNER);
    assert.throws(
      () => orderTasks(parseTaskCatalog('### TASK-001: One\n**Status:** Not Started\n**Blocked by:** TASK-999')),
      /TASK-999/
    );
    const cycle = parseTaskCatalog(
      '### TASK-001: One\n**Status:** Not Started\n**Blocked by:** TASK-002\n' +
      '### TASK-002: Two\n**Status:** Not Started\n**Blocked by:** TASK-001\n'
    );
    assert.throws(() => orderTasks(cycle), /cycle/i);
  });
});

describe('fresh harness adapters', () => {
  test('streams Git record output larger than the synchronous child-process buffer', () => {
    const { forEachGitRecord } = require(RUNNER);
    const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-large-git-'));
    const fakeGit = path.join(fakeBin, 'git');
    const originalPath = process.env.PATH;
    try {
      write(fakeGit, `#!/usr/bin/env node
const fs = require('fs');
const record = Buffer.from('ignored.txt\\0');
for (let index = 0; index < 100000; index++) fs.writeSync(1, record);
`);
      fs.chmodSync(fakeGit, 0o755);
      process.env.PATH = `${fakeBin}${path.delimiter}${originalPath}`;

      let records = 0;
      forEachGitRecord(fakeBin, ['ls-files', '-z'], (record) => {
        assert.strictEqual(record, 'ignored.txt');
        records++;
      });

      assert.strictEqual(records, 100000);
    } finally {
      process.env.PATH = originalPath;
      fs.rmSync(fakeBin, { recursive: true, force: true });
    }
  });

  test('never resumes Claude or Codex sessions', () => {
    const { buildInvocation } = require(RUNNER);
    const claude = buildInvocation({
      harness: 'claude',
      cwd: '/repo',
      pluginRoot: '/plugin',
      prompt: 'phase',
      resultFile: '/tmp/result',
    });
    assert.strictEqual(claude.command, 'claude');
    assert.ok(claude.args.includes('--no-session-persistence'));
    assert.ok(claude.args.includes('--plugin-dir'));
    assert.ok(claude.args.includes('stream-json'));
    assert.ok(claude.args.includes('--verbose'));
    assert.ok(!claude.args.includes('--resume'));

    const codex = buildInvocation({
      harness: 'codex',
      cwd: '/repo',
      pluginRoot: '/plugin',
      prompt: 'phase',
      resultFile: '/tmp/result',
    });
    assert.strictEqual(codex.command, 'codex');
    assert.deepStrictEqual(codex.args.slice(0, 2), ['exec', '--ephemeral']);
    assert.ok(codex.args.includes('--approve-for-me'));
    assert.ok(!codex.args.includes('--sandbox'));
    assert.ok(codex.args.includes('--json'));
    assert.ok(codex.args.includes('--color'));
    assert.ok(codex.args.includes('never'));
    assert.ok(codex.args.includes('--output-last-message'));
    assert.ok(!codex.args.includes('resume'));
  });

  test('shows sanitized commands and suppresses generic turn noise', () => {
    const { formatElapsed, formatLocalTimestamp, normalizeActivity } = require(RUNNER);
    assert.strictEqual(formatElapsed(0), '00:00');
    assert.strictEqual(formatElapsed(90_000), '01:30');
    assert.strictEqual(formatElapsed(3_661_000), '1:01:01');
    const local = new Date(2026, 0, 2, 3, 4, 5);
    assert.match(formatLocalTimestamp(local.getTime()), /^2026-01-02 03:04:05 \S+$/);

    const state = {};
    assert.strictEqual(normalizeActivity('codex', { type: 'turn.started' }, state, 1_000), null);
    const codex = normalizeActivity('codex', {
      type: 'item.started',
      item: {
        id: '1',
        type: 'command_execution',
        command: 'OPENAI_API_KEY=secret-value codex exec --token another-secret task',
      },
    }, state, 1_000);
    assert.strictEqual(codex, '$ OPENAI_API_KEY=[redacted] codex exec --token [redacted] task');

    const claudeState = {};
    assert.strictEqual(normalizeActivity('claude', {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'git   status --short' } }] },
    }, claudeState, 2_000), '$ git status --short');
    assert.strictEqual(normalizeActivity('claude', {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1' }] },
    }, claudeState, 2_500), null);
    assert.strictEqual(normalizeActivity('codex', { type: 'unknown' }, {}), null);
  });

  test('reports only failed or long-running command completions', () => {
    const { normalizeActivity } = require(RUNNER);
    const state = {};
    normalizeActivity('codex', {
      type: 'item.started',
      item: { id: 'short', type: 'command_execution', command: 'git status' },
    }, state, 1_000);
    assert.strictEqual(normalizeActivity('codex', {
      type: 'item.completed',
      item: { id: 'short', type: 'command_execution', status: 'completed', exit_code: 0 },
    }, state, 1_500), null);

    normalizeActivity('codex', {
      type: 'item.started',
      item: { id: 'long', type: 'command_execution', command: 'npm test' },
    }, state, 2_000);
    assert.strictEqual(normalizeActivity('codex', {
      type: 'item.completed',
      item: { id: 'long', type: 'command_execution', status: 'completed', exit_code: 0 },
    }, state, 14_000), 'command completed in 12s');

    normalizeActivity('codex', {
      type: 'item.started',
      item: { id: 'failed', type: 'command_execution', command: 'npm test' },
    }, state, 20_000);
    assert.strictEqual(normalizeActivity('codex', {
      type: 'item.completed',
      item: { id: 'failed', type: 'command_execution', status: 'failed', exit_code: 1 },
    }, state, 20_100), 'command failed (exit 1)');
  });

  test('reports validation-agent launch and verdicts for each iteration', () => {
    const { normalizeActivity } = require(RUNNER);
    const launched = 'GROUNDWORK_VALIDATION_PROGRESS {"iteration":2,"status":"launched","agents":["code-quality-reviewer","security-reviewer"]}';
    const completed = 'GROUNDWORK_VALIDATION_PROGRESS {"iteration":2,"status":"completed","agents":[{"name":"code-quality-reviewer","verdict":"approve"},{"name":"security-reviewer","verdict":"request-changes"}]}';

    assert.strictEqual(normalizeActivity('codex', {
      type: 'item.completed',
      item: { type: 'agent_message', text: launched },
    }), 'validation iteration 2 launched — code-quality-reviewer, security-reviewer');
    assert.strictEqual(normalizeActivity('codex', {
      type: 'item.completed',
      item: { type: 'agent_message', text: completed },
    }), 'validation iteration 2 completed — code-quality-reviewer: approve, security-reviewer: request-changes');
    assert.strictEqual(normalizeActivity('claude', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: completed }] },
    }), 'validation iteration 2 completed — code-quality-reviewer: approve, security-reviewer: request-changes');
  });

  test('parses all four bounded phase results', () => {
    const runner = require(RUNNER);
    assert.strictEqual(
      runner.parsePlanResult('RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task').identifier,
      'TASK-004'
    );
    assert.strictEqual(
      runner.parseImplementationResult('RESULT: IMPLEMENTED | worktree_path=/repo/.worktrees/TASK-004 | branch=task/TASK-004 | base_branch=main').branch,
      'task/TASK-004'
    );
    assert.deepStrictEqual(
      runner.parseValidationResult(`notes\nRESULT: VALIDATED | iterations=2 | fixed=3 | unworked=1 | validated_head=${'a'.repeat(40)}`),
      { iterations: 2, fixed: 3, unworked: 1, validatedHead: 'a'.repeat(40) }
    );
    assert.deepStrictEqual(
      runner.parseFinalizeResult('RESULT: REVALIDATE | task_head=abc123 | base_head=def456 | reason=base advanced'),
      { outcome: 'revalidate', taskHead: 'abc123', baseHead: 'def456', reason: 'base advanced' }
    );
    assert.strictEqual(
      runner.parseFinalizeResult('RESULT: READY_TO_MERGE | task_id=TASK-004 | task_head=def456 | base_head=abc123 | merge_message=Merge TASK-004').outcome,
      'ready'
    );
  });

  test('child environments omit unrelated credentials and process injection variables', () => {
    const { buildChildEnv } = require(RUNNER);
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      NODE_OPTIONS: process.env.NODE_OPTIONS,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };
    try {
      process.env.DATABASE_URL = 'secret-db';
      process.env.NODE_OPTIONS = '--require /tmp/inject.js';
      process.env.OPENAI_API_KEY = 'codex-auth';
      const env = buildChildEnv('codex', { GROUNDWORK_RUNNER_MODE: 'true' });
      assert.strictEqual(env.DATABASE_URL, undefined);
      assert.strictEqual(env.NODE_OPTIONS, undefined);
      assert.strictEqual(env.OPENAI_API_KEY, 'codex-auth');
      assert.strictEqual(env.GROUNDWORK_RUNNER_MODE, 'true');
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test('uses the real subprocess boundary and Codex last-message file', () => {
    const { invokePhase } = require(RUNNER);
    const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-fake-bin-'));
    const previousPath = process.env.PATH;
    try {
      const codex = path.join(fakeBin, 'codex');
      write(codex, '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = "--output-last-message" ]; then shift; result="$1"; fi\n  shift\ndone\nprintf "%s\\n" "RESULT: TEST" > "$result"\n');
      fs.chmodSync(codex, 0o755);
      process.env.PATH = `${fakeBin}:${previousPath}`;
      assert.strictEqual(
        invokePhase({
          harness: 'codex',
          phase: 'plan',
          cwd: process.cwd(),
          pluginRoot: PLUGIN_ROOT,
          prompt: 'test prompt',
          env: {},
        }).trim(),
        'RESULT: TEST'
      );
    } finally {
      process.env.PATH = previousPath;
      fs.rmSync(fakeBin, { recursive: true, force: true });
    }
  });

  test('reports streamed activity and a heartbeat while a phase is running', () => {
    const { invokePhase } = require(RUNNER);
    const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-progress-bin-'));
    const progressFile = path.join(fakeBin, 'progress.log');
    const previousPath = process.env.PATH;
    let progressFd;
    try {
      const codex = path.join(fakeBin, 'codex');
      write(codex, `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const resultIndex = args.indexOf('--output-last-message');
process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'GROUNDWORK_VALIDATION_PROGRESS {"iteration":1,"status":"launched","agents":["code-quality-reviewer","security-reviewer"]}' } }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'item.started', item: { id: '1', type: 'command_execution', command: 'git status --short' } }) + '\\n');
setTimeout(() => {
  fs.writeFileSync(args[resultIndex + 1], 'RESULT: TEST\\n');
}, 80);
`);
      fs.chmodSync(codex, 0o755);
      process.env.PATH = `${fakeBin}:${previousPath}`;
      progressFd = fs.openSync(progressFile, 'w');

      const output = invokePhase({
        harness: 'codex',
        phase: 'plan',
        taskId: 'TASK-004',
        cwd: process.cwd(),
        pluginRoot: PLUGIN_ROOT,
        prompt: 'test prompt',
        env: {},
        heartbeatMs: 20,
        progressFd,
      });

      fs.closeSync(progressFd);
      progressFd = undefined;
      const progress = fs.readFileSync(progressFile, 'utf8');
      assert.strictEqual(output.trim(), 'RESULT: TEST');
      assert.match(progress, /\[\d{4}-\d\d-\d\d \d\d:\d\d:\d\d \S+\] \[TASK-004 plan \d\d:\d\d\] Codex session started/);
      assert.match(progress, /validation iteration 1 launched — code-quality-reviewer, security-reviewer/);
      assert.match(progress, /\[\d{4}-\d\d-\d\d \d\d:\d\d:\d\d \S+\] \[TASK-004 plan \d\d:\d\d\] \$ git status --short/);
      assert.match(progress, /\[\d{4}-\d\d-\d\d \d\d:\d\d:\d\d \S+\] \[TASK-004 plan \d\d:\d\d\] Codex still running/);
    } finally {
      if (progressFd !== undefined) fs.closeSync(progressFd);
      process.env.PATH = previousPath;
      fs.rmSync(fakeBin, { recursive: true, force: true });
    }
  });

  test('extracts the final result from Claude stream JSON', () => {
    const { invokePhase } = require(RUNNER);
    const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-claude-stream-bin-'));
    const previousPath = process.env.PATH;
    try {
      const claude = path.join(fakeBin, 'claude');
      write(claude, '#!/bin/sh\nprintf \'%s\\n\' \'{"type":"result","result":"RESULT: TEST"}\'\n');
      fs.chmodSync(claude, 0o755);
      process.env.PATH = `${fakeBin}:${previousPath}`;
      assert.strictEqual(invokePhase({
        harness: 'claude',
        phase: 'plan',
        taskId: 'TASK-004',
        cwd: process.cwd(),
        pluginRoot: PLUGIN_ROOT,
        prompt: 'test prompt',
        env: {},
      }).trim(), 'RESULT: TEST');
    } finally {
      process.env.PATH = previousPath;
      fs.rmSync(fakeBin, { recursive: true, force: true });
    }
  });

  test('propagates a real child-process failure', () => {
    const { invokePhase } = require(RUNNER);
    const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-failing-bin-'));
    const previousPath = process.env.PATH;
    try {
      const claude = path.join(fakeBin, 'claude');
      write(claude, '#!/bin/sh\nprintf "%s\\n" "simulated failure" >&2\nexit 7\n');
      fs.chmodSync(claude, 0o755);
      process.env.PATH = `${fakeBin}:${previousPath}`;
      assert.throws(
        () => invokePhase({
          harness: 'claude',
          phase: 'validate',
          cwd: process.cwd(),
          pluginRoot: PLUGIN_ROOT,
          prompt: 'test prompt',
          env: {},
        }),
        /exited 7: simulated failure/
      );
    } finally {
      process.env.PATH = previousPath;
      fs.rmSync(fakeBin, { recursive: true, force: true });
    }
  });
});

describe('filesystem safety', () => {
  test('rejects a symlinked checkpoint parent before writing outside Git state', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-state-link-'));
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-state-external-'));
    try {
      initRepo(root);
      writePlan(root);
      fs.symlinkSync(external, path.join(root, '.git', 'groundwork'));

      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          { log: () => {}, invokePhase: () => { throw new Error('phase should not run'); } }
        ),
        /checkpoint.*symlink|Runner lease directory.*symlink/i
      );
      assert.deepStrictEqual(fs.readdirSync(external), []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(external, { recursive: true, force: true });
    }
  });

  test('rejects a symlinked tasks file before invoking a phase', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-task-link-'));
    const external = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-external-task-')), 'tasks.md');
    try {
      git(root, 'init', '-b', 'main');
      git(root, 'config', 'user.email', 'test@example.com');
      git(root, 'config', 'user.name', 'Test User');
      write(external, '### TASK-004: Four\n**Status:** Not Started\n**Blocked by:** None\n');
      fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
      fs.symlinkSync(external, path.join(root, 'specs', 'tasks.md'));
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'base');
      assert.throws(
        () => runTasks(
          { command: 'all', harness: 'codex', repo: root, project: null, tasks: [], dryRun: true },
          { log: () => {}, invokePhase: () => { throw new Error('phase should not run'); } }
        ),
        /symlink/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(path.dirname(external), { recursive: true, force: true });
    }
  });

  test('rejects an oversized task spec before invoking a phase', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-large-task-'));
    try {
      initRepo(root);
      fs.truncateSync(path.join(root, 'specs', 'tasks.md'), 10 * 1024 * 1024 + 1);
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'oversized tasks');
      assert.throws(
        () => runTasks(
          { command: 'all', harness: 'codex', repo: root, project: null, tasks: [], dryRun: true },
          { log: () => {}, invokePhase: () => { throw new Error('phase should not run'); } }
        ),
        /10 MiB/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects command-bearing repository Git configuration', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-git-command-'));
    try {
      initRepo(root);
      git(root, 'config', 'filter.unsafe.smudge', '/tmp/groundwork-unsafe-filter');
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          { log: () => {}, invokePhase: () => { throw new Error('phase should not run'); } }
        ),
        /command-bearing/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects tracked base edits hidden with assume-unchanged', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-assume-unchanged-'));
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            log: () => {},
            invokePhase() {
              write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              git(root, 'update-index', '--assume-unchanged', '.gitignore');
              fs.appendFileSync(path.join(root, '.gitignore'), 'hidden-change\n');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            },
          }
        ),
        /tracked content|assume-unchanged/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects unrelated ref changes made by a phase', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-unrelated-ref-'));
    try {
      initRepo(root);
      git(root, 'tag', 'keep-me');
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            log: () => {},
            invokePhase() {
              write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              git(root, 'tag', '-d', 'keep-me');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            },
          }
        ),
        /repository refs/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects changes to an inactive task branch made by a phase', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-inactive-task-ref-'));
    try {
      initRepo(root);
      git(root, 'branch', 'task/TASK-075');
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            log: () => {},
            invokePhase() {
              write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              git(root, 'update-ref', '-d', 'refs/heads/task/TASK-075');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            },
          }
        ),
        /inactive task branch|repository refs/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects changes to an inactive task checkpoint made by a phase', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-inactive-checkpoint-'));
    try {
      initRepo(root);
      const projectKey = crypto.createHash('sha256').update('.').digest('hex').slice(0, 16);
      const peerCheckpoint = path.join(root, '.git', 'groundwork', 'runner', projectKey, 'TASK-075.json');
      write(peerCheckpoint, '{"peer":"before"}\n');
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            log: () => {},
            invokePhase() {
              write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              write(peerCheckpoint, '{"peer":"after"}\n');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            },
          }
        ),
        /inactive task checkpoint|checkpoint state/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('does not trust project lease owner fields rewritten during a phase', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-forged-owner-'));
    try {
      initRepo(root);
      git(root, 'branch', 'task/TASK-075');
      const projectLease = path.join(
        root,
        '.git',
        'groundwork',
        'projects',
        `${crypto.createHash('sha256').update('.').digest('hex').slice(0, 32)}.lock`
      );
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            log: () => {},
            invokePhase() {
              const forged = JSON.parse(fs.readFileSync(projectLease, 'utf8'));
              forged.taskId = 'TASK-075';
              fs.writeFileSync(projectLease, `${JSON.stringify(forged)}\n`);
              write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              git(root, 'update-ref', '-d', 'refs/heads/task/TASK-075');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            },
          }
        ),
        /inactive task branch|repository refs|lease ownership changed/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a live scoped peer authorizes only its registered scoped task ref', () => {
    const { acquireProjectLease, runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-exact-peer-ref-'));
    const peerWorktree = path.join(root, '.worktrees', 'api-TASK-075');
    let releasePeer;
    try {
      git(root, 'init', '-b', 'main');
      git(root, 'config', 'user.email', 'test@example.com');
      git(root, 'config', 'user.name', 'Test User');
      write(path.join(root, '.groundwork.yml'), 'version: 1\nprojects:\n  api:\n    path: apps/api\n  web:\n    path: apps/web\n');
      write(path.join(root, 'apps', 'api', 'specs', 'tasks.md'), '### TASK-075: Peer\n**Status:** Not Started\n**Blocked by:** None\n');
      write(path.join(root, 'apps', 'web', 'specs', 'tasks.md'), '### TASK-004: Current\n**Status:** Not Started\n**Blocked by:** None\n');
      write(path.join(root, '.gitignore'), '.worktrees/\n.groundwork-plans/\n');
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'base');
      git(root, 'worktree', 'add', '-b', 'task/api/TASK-075', peerWorktree);
      git(root, 'branch', 'task/TASK-075');
      const commonDir = path.join(root, '.git');
      const projectKey = crypto.createHash('sha256').update('apps/api').digest('hex').slice(0, 16);
      write(path.join(commonDir, 'groundwork', 'runner', projectKey, 'TASK-075.json'), `${JSON.stringify({
        version: 1,
        taskId: 'TASK-075',
        project: 'apps/api',
        baseBranch: 'main',
        workspace: { branch: 'task/api/TASK-075', worktreePath: peerWorktree },
      })}\n`);
      releasePeer = acquireProjectLease(
        commonDir,
        { project: 'api', projectPath: 'apps/api', taskId: 'TASK-075' },
        { log: () => {} }
      );
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: 'web', tasks: ['TASK-004'], dryRun: false },
          {
            log: () => {},
            invokePhase(input) {
              write(path.join(input.projectRoot, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              git(root, 'update-ref', '-d', 'refs/heads/task/TASK-075');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            },
          }
        ),
        /inactive task branch|repository refs/
      );
    } finally {
      if (releasePeer) {
        try { releasePeer(); } catch {}
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects base submodule changes even when configured to ignore them', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-submodule-'));
    const submodule = path.join(root, 'vendor', 'sub');
    try {
      initRepo(root);
      fs.mkdirSync(submodule, { recursive: true });
      git(submodule, 'init', '-b', 'main');
      git(submodule, 'config', 'user.email', 'test@example.com');
      git(submodule, 'config', 'user.name', 'Test User');
      write(path.join(submodule, 'tracked.txt'), 'before\n');
      git(submodule, 'add', '.');
      git(submodule, 'commit', '-m', 'submodule base');
      git(root, 'add', 'vendor/sub');
      git(root, 'commit', '-m', 'add embedded submodule');
      git(root, 'config', 'submodule.vendor/sub.ignore', 'all');
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            log: () => {},
            invokePhase() {
              write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              write(path.join(submodule, 'tracked.txt'), 'after\n');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            },
          }
        ),
        /tracked content|submodule|not clean/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('allows an ignored virtualenv interpreter symlink to an external file', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-ignored-link-'));
    const external = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-link-target-')), 'target');
    try {
      initRepo(root);
      fs.appendFileSync(path.join(root, '.gitignore'), 'scratch-link\n');
      git(root, 'add', '.gitignore');
      git(root, 'commit', '-m', 'ignore scratch link');
      write(external, 'outside\n');
      fs.symlinkSync(external, path.join(root, 'scratch-link'));
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          { log: () => {}, invokePhase: () => { throw new Error('phase reached'); } }
        ),
        /phase reached/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(path.dirname(external), { recursive: true, force: true });
    }
  });

  test('does not read contents of ignored cache files during preflight', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-ignored-cache-'));
    const cache = path.join(root, '.cache', 'opaque.bin');
    try {
      initRepo(root);
      fs.appendFileSync(path.join(root, '.gitignore'), '.cache/\n');
      git(root, 'add', '.gitignore');
      git(root, 'commit', '-m', 'ignore cache');
      write(cache, 'opaque\n');
      fs.chmodSync(cache, 0o000);

      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          { log: () => {}, invokePhase: () => { throw new Error('phase reached'); } }
        ),
        /phase reached/
      );
    } finally {
      if (fs.existsSync(cache)) fs.chmodSync(cache, 0o600);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('advances after a successful phase creates an ignored cache path', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-ignored-churn-'));
    const phases = [];
    try {
      initRepo(root);
      fs.appendFileSync(path.join(root, '.gitignore'), '.cache/\n');
      git(root, 'add', '.gitignore');
      git(root, 'commit', '-m', 'ignore tool cache');

      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            log: () => {},
            invokePhase(input) {
              phases.push(input.phase);
              if (input.phase === 'plan') {
                write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
                write(path.join(root, '.cache', 'tool-state'), 'generated\n');
                return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
              }
              throw new Error('implementation reached');
            },
          }
        ),
        /implementation reached/
      );
      assert.deepStrictEqual(phases, ['plan', 'implement']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('allows another monorepo project to remain dirty in an unrelated worktree', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-other-project-dirty-'));
    const unrelated = path.join(root, '.worktrees', 'TASK-075');
    const selectedProject = path.join(root, 'packages', 'bottle-budget');
    try {
      initRepo(root);
      write(path.join(root, 'packages', 'artistai', 'feature.txt'), 'base\n');
      write(
        path.join(selectedProject, 'specs', 'tasks.md'),
        '### TASK-004: Bottle budget\n**Status:** Not Started\n**Blocked by:** None\n'
      );
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'Add monorepo projects');
      git(root, 'worktree', 'add', '-b', 'task/TASK-075', unrelated);
      write(path.join(unrelated, 'packages', 'artistai', 'feature.txt'), 'in progress\n');

      assert.throws(
        () => runTasks(
          {
            command: 'task',
            harness: 'codex',
            repo: root,
            project: 'bottle-budget',
            tasks: ['TASK-004'],
            dryRun: false,
          },
          {
            log: () => {},
            resolveProject() {
              return {
                projectName: 'bottle-budget',
                projectRoot: selectedProject,
                specsDir: path.join(selectedProject, 'specs'),
              };
            },
            invokePhase() {
              throw new Error('phase reached');
            },
          }
        ),
        /phase reached/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('still rejects selected-project changes in an unrelated worktree', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-selected-project-dirty-'));
    const unrelated = path.join(root, '.worktrees', 'TASK-075');
    const selectedProject = path.join(root, 'packages', 'bottle-budget');
    try {
      initRepo(root);
      write(path.join(selectedProject, 'feature.txt'), 'base\n');
      write(
        path.join(selectedProject, 'specs', 'tasks.md'),
        '### TASK-004: Bottle budget\n**Status:** Not Started\n**Blocked by:** None\n'
      );
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'Add selected project');
      git(root, 'worktree', 'add', '-b', 'task/TASK-075', unrelated);
      write(path.join(unrelated, 'packages', 'bottle-budget', 'feature.txt'), 'in progress\n');

      assert.throws(
        () => runTasks(
          {
            command: 'task',
            harness: 'codex',
            repo: root,
            project: 'bottle-budget',
            tasks: ['TASK-004'],
            dryRun: false,
          },
          {
            log: () => {},
            resolveProject() {
              return {
                projectName: 'bottle-budget',
                projectRoot: selectedProject,
                specsDir: path.join(selectedProject, 'specs'),
              };
            },
            invokePhase() {
              throw new Error('phase reached');
            },
          }
        ),
        /Selected project in unrelated worktree .* is not clean/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('uses a project-qualified workspace when task IDs overlap across projects', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-overlapping-task-id-'));
    const unrelated = path.join(root, '.worktrees', 'TASK-075');
    const selectedProject = path.join(root, 'packages', 'bottle-budget');
    const phases = [];
    try {
      initRepo(root);
      write(path.join(root, 'packages', 'artistai', 'feature.txt'), 'base\n');
      write(
        path.join(selectedProject, 'specs', 'tasks.md'),
        '### TASK-075: Bottle task\n**Status:** Not Started\n**Blocked by:** None\n'
      );
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'Add overlapping project task');
      git(root, 'worktree', 'add', '-b', 'task/TASK-075', unrelated);
      write(path.join(unrelated, 'packages', 'artistai', 'feature.txt'), 'in progress\n');

      assert.throws(
        () => runTasks(
          {
            command: 'task',
            harness: 'codex',
            repo: root,
            project: 'bottle-budget',
            tasks: ['TASK-075'],
            dryRun: false,
          },
          {
            log: () => {},
            resolveProject() {
              return {
                projectName: 'bottle-budget',
                projectRoot: selectedProject,
                specsDir: path.join(selectedProject, 'specs'),
              };
            },
            invokePhase(input) {
              phases.push(input.phase);
              if (input.phase === 'plan') {
                writePlan(selectedProject, 'TASK-075');
                return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-075-plan.md | identifier=TASK-075 | branch_prefix=task';
              }
              assert.strictEqual(input.branch, 'task/bottle-budget/TASK-075');
              assert.strictEqual(
                input.worktreePath,
                path.join(fs.realpathSync(root), '.worktrees', 'bottle-budget-TASK-075')
              );
              assert.match(input.prompt, /task\/bottle-budget\/TASK-075/);
              throw new Error('scoped implementation reached');
            },
          }
        ),
        /scoped implementation reached/
      );
      assert.deepStrictEqual(phases, ['plan', 'implement']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('four-phase orchestration', () => {
  test('runner prepares the linked task worktree before planning and plans from its project root', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-prepared-worktree-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            log: () => {},
            invokePhase(input) {
              assert.strictEqual(input.phase, 'plan');
              assert.strictEqual(input.cwd, fs.realpathSync(worktree));
              assert.strictEqual(input.worktreePath, fs.realpathSync(worktree));
              assert.strictEqual(git(root, 'rev-parse', 'refs/heads/task/TASK-004'), git(root, 'rev-parse', 'HEAD'));
              throw new Error('planned workspace verified');
            },
          }
        ),
        /planned workspace verified/
      );
      assert.ok(fs.existsSync(worktree));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('reuses a legacy monorepo workspace owned by the selected project checkpoint', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-legacy-monorepo-'));
    const projectRoot = path.join(root, 'apps', 'api');
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    try {
      git(root, 'init', '-b', 'main');
      git(root, 'config', 'user.email', 'test@example.com');
      git(root, 'config', 'user.name', 'Test User');
      write(path.join(projectRoot, 'specs', 'tasks.md'), '### TASK-004: Four\n**Status:** Not Started\n**Blocked by:** None\n');
      write(path.join(root, '.gitignore'), '.worktrees/\n.groundwork-plans/\n');
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'base');
      writePlan(projectRoot);
      git(root, 'worktree', 'add', '-b', 'task/TASK-004', worktree);
      const worktreeTasks = path.join(worktree, 'apps', 'api', 'specs', 'tasks.md');
      fs.writeFileSync(worktreeTasks, fs.readFileSync(worktreeTasks, 'utf8').replace('Not Started', 'In Progress'));
      write(path.join(worktree, 'apps', 'api', 'feature.txt'), 'implemented\n');
      git(worktree, 'add', '.');
      git(worktree, 'commit', '-m', 'Legacy implementation');

      const projectRelative = 'apps/api';
      const projectKey = crypto.createHash('sha256').update(projectRelative).digest('hex').slice(0, 16);
      write(
        path.join(root, '.git', 'groundwork', 'runner', projectKey, 'TASK-004.json'),
        `${JSON.stringify({ version: 1, taskId: 'TASK-004', project: projectRelative, baseBranch: 'main' })}\n`
      );

      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: 'api', tasks: ['TASK-004'], dryRun: false },
          {
            log: () => {},
            resolveProject() {
              return { projectName: 'api', projectRoot, specsDir: path.join(projectRoot, 'specs') };
            },
            invokePhase(input) {
              assert.strictEqual(input.phase, 'validate');
              assert.strictEqual(input.branch, 'task/TASK-004');
              assert.strictEqual(input.worktreePath, fs.realpathSync(worktree));
              throw new Error('legacy validation reached');
            },
          }
        ),
        /legacy validation reached/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('skips an existing plan and a verifiably completed implementation', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-skip-artifacts-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    const phases = [];
    const logs = [];
    try {
      initRepo(root);
      writePlan(root);
      git(root, 'worktree', 'add', '-b', 'task/TASK-004', worktree);
      const taskFile = path.join(worktree, 'specs', 'tasks.md');
      fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
      write(path.join(worktree, 'feature.txt'), 'implemented\n');
      git(worktree, 'add', '.');
      git(worktree, 'commit', '-m', 'Implement TASK-004');

      runTasks(
        { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
        {
          pluginRoot: PLUGIN_ROOT,
          log: (message) => logs.push(message),
          invokePhase(input) {
            phases.push(input.phase);
            if (input.phase === 'validate') return validated(worktree);
            if (input.phase === 'finalize') {
              return finalizeMock(root, worktree, 'TASK-004', 'task/TASK-004', 'main');
            }
            throw new Error(`${input.phase} should have been skipped`);
          },
        }
      );

      assert.deepStrictEqual(phases, ['validate', 'finalize']);
      assert.ok(logs.some((line) => line.endsWith('[TASK-004] plan skipped — existing plan')));
      assert.ok(logs.some((line) => line.endsWith('[TASK-004] implement skipped — existing clean worktree')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('resumes implementation when an existing task worktree is ambiguous', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-resume-implementation-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    const phases = [];
    try {
      initRepo(root);
      writePlan(root);
      git(root, 'worktree', 'add', '-b', 'task/TASK-004', worktree);
      write(path.join(worktree, 'partial.txt'), 'partial\n');

      runTasks(
        { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
        {
          pluginRoot: PLUGIN_ROOT,
          log: () => {},
          invokePhase(input) {
            phases.push(input.phase);
            if (input.phase === 'implement') {
              assert.strictEqual(input.resumeExistingWorktree, true);
              assert.match(input.prompt, /reuse the existing registered worktree/i);
              const taskFile = path.join(worktree, 'specs', 'tasks.md');
              fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', 'Finish TASK-004');
              return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
            }
            if (input.phase === 'validate') return validated(worktree);
            return finalizeMock(root, worktree, 'TASK-004', 'task/TASK-004', 'main');
          },
        }
      );

      assert.deepStrictEqual(phases, ['implement', 'validate', 'finalize']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('restores a transient task-worktree hooksPath after implementation', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-worktree-hooks-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    const originalHooks = path.join(root, 'scripts', 'githooks');
    try {
      initRepo(root);
      write(path.join(originalHooks, 'pre-push'), '#!/bin/sh\n');
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'add hooks');
      git(root, 'config', 'core.hooksPath', originalHooks);
      writePlan(root);

      runTasks(
        { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
        {
          pluginRoot: PLUGIN_ROOT,
          log: () => {},
          invokePhase(input) {
            if (input.phase === 'implement') {
              assertPrecreatedWorktree(root, worktree, 'task/TASK-004');
              const taskFile = path.join(worktree, 'specs', 'tasks.md');
              fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', 'Implement TASK-004');
              git(worktree, 'config', 'core.hooksPath', path.join(worktree, 'scripts', 'githooks'));
              return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
            }
            if (input.phase === 'validate') return validated(worktree);
            return finalizeMock(root, worktree, 'TASK-004', 'task/TASK-004', 'main');
          },
        }
      );

      assert.strictEqual(git(root, 'config', '--get', 'core.hooksPath'), originalHooks);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('repairs a leaked task-worktree hooksPath before cleanup on resume', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-resume-hooks-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    const nextWorktree = path.join(root, '.worktrees', 'TASK-005');
    const primaryHooks = path.join(root, 'scripts', 'githooks');
    try {
      initRepo(root);
      write(path.join(primaryHooks, 'pre-push'), '#!/bin/sh\n');
      fs.appendFileSync(
        path.join(root, 'specs', 'tasks.md'),
        '\n### TASK-005: Five\n**Status:** Not Started\n**Blocked by:** None\n'
      );
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'add hooks');
      writePlan(root);
      git(root, 'worktree', 'add', '-b', 'task/TASK-004', worktree);
      const taskFile = path.join(worktree, 'specs', 'tasks.md');
      fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
      git(worktree, 'add', '.');
      git(worktree, 'commit', '-m', 'Implement TASK-004');
      git(root, 'config', 'core.hooksPath', path.join(worktree, 'scripts', 'githooks'));

      runTasks(
        { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004', 'TASK-005'], dryRun: false },
        {
          pluginRoot: PLUGIN_ROOT,
          log: () => {},
          invokePhase(input) {
            const selectedWorktree = input.taskId === 'TASK-004' ? worktree : nextWorktree;
            if (input.phase === 'plan') {
              writePlan(root, 'TASK-005');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-005-plan.md | identifier=TASK-005 | branch_prefix=task';
            }
            if (input.phase === 'implement') {
              assertPrecreatedWorktree(root, nextWorktree, 'task/TASK-005');
              const nextTaskFile = path.join(nextWorktree, 'specs', 'tasks.md');
              fs.writeFileSync(nextTaskFile, fs.readFileSync(nextTaskFile, 'utf8').replace(
                '### TASK-005: Five\n**Status:** Not Started',
                '### TASK-005: Five\n**Status:** In Progress'
              ));
              git(nextWorktree, 'add', '.');
              git(nextWorktree, 'commit', '-m', 'Implement TASK-005');
              return `RESULT: IMPLEMENTED | worktree_path=${nextWorktree} | branch=task/TASK-005 | base_branch=main`;
            }
            if (input.phase === 'validate') return validated(selectedWorktree);
            if (input.phase === 'finalize') {
              return finalizeMock(
                root,
                selectedWorktree,
                input.taskId,
                `task/${input.taskId}`,
                'main'
              );
            }
            throw new Error(`Unexpected ${input.phase}`);
          },
        }
      );

      assert.strictEqual(git(root, 'config', '--get', 'core.hooksPath'), fs.realpathSync(primaryHooks));
      assert.strictEqual(fs.existsSync(worktree), false);
      assert.strictEqual(fs.existsSync(nextWorktree), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('reuses validation only when its base and task heads still match', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-resume-validation-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    const firstPhases = [];
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            pluginRoot: PLUGIN_ROOT,
            log: () => {},
            invokePhase(input) {
              firstPhases.push(input.phase);
              if (input.phase === 'plan') {
                writePlan(root);
                return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
              }
              if (input.phase === 'implement') {
                assertPrecreatedWorktree(root, worktree, 'task/TASK-004');
                const taskFile = path.join(worktree, 'specs', 'tasks.md');
                fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
                write(path.join(worktree, 'feature.txt'), 'implemented\n');
                git(worktree, 'add', '.');
                git(worktree, 'commit', '-m', 'Implement TASK-004');
                return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
              }
              if (input.phase === 'validate') return validated(worktree, 2, 1, 0);
              return 'RESULT: FAILURE | stop after validation';
            },
          }
        ),
        /stop after validation/
      );
      assert.deepStrictEqual(firstPhases, ['plan', 'implement', 'validate', 'finalize']);

      const secondPhases = [];
      runTasks(
        { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
        {
          pluginRoot: PLUGIN_ROOT,
          log: () => {},
          invokePhase(input) {
            secondPhases.push(input.phase);
            if (input.phase !== 'finalize') throw new Error(`${input.phase} should have been checkpointed`);
            return finalizeMock(root, worktree, 'TASK-004', 'task/TASK-004', 'main');
          },
        }
      );
      assert.deepStrictEqual(secondPhases, ['finalize']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('reuses validation after finalization already committed only task bookkeeping', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-resume-bookkeeping-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            pluginRoot: PLUGIN_ROOT,
            log: () => {},
            invokePhase(input) {
              if (input.phase === 'plan') {
                writePlan(root);
                return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
              }
              if (input.phase === 'implement') {
                assertPrecreatedWorktree(root, worktree, 'task/TASK-004');
                const taskFile = path.join(worktree, 'specs', 'tasks.md');
                fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
                write(path.join(worktree, 'feature.txt'), 'implemented\n');
                git(worktree, 'add', '.');
                git(worktree, 'commit', '-m', 'Implement TASK-004');
                return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
              }
              if (input.phase === 'validate') return validated(worktree);
              completeTaskFile(worktree, 'TASK-004');
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', 'TASK-004: Mark task complete');
              return 'RESULT: FAILURE | interrupted after bookkeeping';
            },
          }
        ),
        /interrupted after bookkeeping/
      );

      const phases = [];
      runTasks(
        { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
        {
          pluginRoot: PLUGIN_ROOT,
          log: () => {},
          invokePhase(input) {
            phases.push(input.phase);
            if (input.phase !== 'finalize') throw new Error(`${input.phase} should have been checkpointed`);
            return `RESULT: READY_TO_MERGE | task_id=TASK-004 | task_head=${git(worktree, 'rev-parse', 'HEAD')} | base_head=${git(root, 'rev-parse', 'HEAD')} | merge_message=Merge TASK-004`;
          },
        }
      );
      assert.deepStrictEqual(phases, ['finalize']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects a plan reached through a symlinked plan directory', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-plan-link-'));
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-external-plan-'));
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            pluginRoot: PLUGIN_ROOT,
            log: () => {},
            invokePhase() {
              fs.rmdirSync(path.join(root, '.groundwork-plans'));
              fs.symlinkSync(external, path.join(root, '.groundwork-plans'), 'dir');
              write(path.join(external, 'TASK-004-plan.md'), '# External plan\n');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            },
          }
        ),
        /contains a symlink/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(external, { recursive: true, force: true });
    }
  });

  test('rejects a task worktree root replaced by a symlink during validation', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-worktree-link-'));
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-external-worktree-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    const moved = path.join(external, 'TASK-004');
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            pluginRoot: PLUGIN_ROOT,
            log: () => {},
            invokePhase(input) {
              if (input.phase === 'plan') {
                write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
                return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
              }
              if (input.phase === 'implement') {
                assertPrecreatedWorktree(root, worktree, 'task/TASK-004');
                const taskFile = path.join(worktree, 'specs', 'tasks.md');
                fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
                git(worktree, 'add', '.');
                git(worktree, 'commit', '-m', 'Implement TASK-004');
                return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
              }
              git(root, 'worktree', 'move', worktree, moved);
              fs.symlinkSync(moved, worktree, 'dir');
              return validated(moved);
            },
          }
        ),
        /Registered worktrees changed|not a real directory|symlink/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(external, { recursive: true, force: true });
    }
  });

  test('runs plan, implement, validate, and finalize in separate calls with explicit project context', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-four-phases-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    const calls = [];
    const logs = [];
    try {
      initRepo(root);
      const completed = runTasks(
        {
          command: 'task',
          harness: 'codex',
          repo: root,
          project: 'api',
          tasks: ['TASK-004'],
          dryRun: false,
        },
        {
          pluginRoot: PLUGIN_ROOT,
          log: (message) => logs.push(message),
          resolveProject() {
            return { projectName: 'api', projectRoot: root, specsDir: path.join(root, 'specs') };
          },
          invokePhase(input) {
            calls.push(input);
            assert.strictEqual(input.env.GROUNDWORK_PROJECT, 'api');
            assert.strictEqual(input.env.GROUNDWORK_PROJECT_ROOT, input.projectRoot);
            if (input.phase === 'plan') {
              write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            }
            if (input.phase === 'implement') {
              assertPrecreatedWorktree(root, worktree, 'task/TASK-004');
              const taskFile = path.join(worktree, 'specs', 'tasks.md');
              fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
              write(path.join(worktree, 'feature.txt'), 'implemented\n');
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', 'Implement TASK-004');
              return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
            }
            if (input.phase === 'validate') {
              return validated(worktree);
            }
            return finalizeMock(root, worktree, 'TASK-004', 'task/TASK-004', 'main');
          },
        }
      );

      assert.deepStrictEqual(calls.map((call) => call.phase), ['plan', 'implement', 'validate', 'finalize']);
      const startedLogs = logs.filter((line) => line.includes('started'));
      assert.deepStrictEqual(
        startedLogs.map((line) => line.replace(/^\[[^\]]+\] /, '')),
        [
          '[TASK-004] plan started — Codex',
          '[TASK-004] implement started — Codex',
          '[TASK-004] validate started — Codex',
          '[TASK-004] finalize started — Codex',
        ]
      );
      assert.ok(startedLogs.every((line) => /^\[\d{4}-\d\d-\d\d \d\d:\d\d:\d\d \S+\]/.test(line)));
      assert.strictEqual(logs.filter((line) => /completed in \d\d:\d\d$/.test(line)).length, 4);
      const realRoot = fs.realpathSync(root);
      const realWorktree = path.join(realRoot, '.worktrees', 'TASK-004');
      assert.deepStrictEqual(calls.map((call) => call.cwd), [realWorktree, realWorktree, realWorktree, realWorktree]);
      assert.ok(calls[0].prompt.includes('groundwork-plan-task'));
      assert.ok(calls[1].prompt.includes('groundwork-implement-task'));
      assert.ok(calls[1].prompt.includes(path.join(realRoot, '.worktrees', 'TASK-004')));
      assert.ok(calls[1].prompt.includes('precreated registered worktree'));
      assert.ok(!calls[1].prompt.includes('Create the task worktree'));
      assert.ok(calls[2].prompt.includes('groundwork-validate'));
      assert.ok(calls[3].prompt.includes('groundwork-finalize-task'));
      assert.ok(calls.every((call) => call.prompt.includes('--project api')));
      assert.deepStrictEqual(completed, [{
        taskId: 'TASK-004',
        validation: { iterations: 1, fixed: 0, unworked: 0 },
      }]);
      assert.ok(fs.existsSync(path.join(root, 'feature.txt')));
      assert.ok(fs.readFileSync(path.join(root, 'specs', 'tasks.md'), 'utf8').includes('**Status:** Complete'));
      assert.strictEqual(git(root, 'status', '--porcelain'), '');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('bounds full unrelated-worktree inspections to writer-gated lifecycle points', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-bounded-worktree-scan-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    let inspections = 0;
    try {
      initRepo(root);
      runTasks(
        { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
        {
          pluginRoot: PLUGIN_ROOT,
          log: () => {},
          inspectUnrelatedWorktrees(repoRoot, projectRoot, taskWorktree) {
            inspections++;
            return require(RUNNER).snapshotUnrelatedWorktrees(repoRoot, projectRoot, taskWorktree);
          },
          invokePhase(input) {
            if (input.phase === 'plan') {
              writePlan(root);
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            }
            if (input.phase === 'implement') {
              assertPrecreatedWorktree(root, worktree, 'task/TASK-004');
              const taskFile = path.join(worktree, 'specs', 'tasks.md');
              fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', 'Implement TASK-004');
              return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
            }
            if (input.phase === 'validate') return validated(worktree);
            return finalizeMock(root, worktree, 'TASK-004', 'task/TASK-004', 'main');
          },
        }
      );

      assert.strictEqual(inspections, 2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('accepts task completion already committed in the validated tree', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-validated-complete-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    try {
      initRepo(root);

      const completed = runTasks(
        { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
        {
          pluginRoot: PLUGIN_ROOT,
          log: () => {},
          invokePhase(input) {
            if (input.phase === 'plan') {
              writePlan(root);
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            }
            if (input.phase === 'implement') {
              assertPrecreatedWorktree(root, worktree, 'task/TASK-004');
              const taskFile = path.join(worktree, 'specs', 'tasks.md');
              fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
              write(path.join(worktree, 'feature.txt'), 'implemented\n');
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', 'Implement TASK-004');
              return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
            }
            if (input.phase === 'validate') {
              completeTaskFile(worktree, 'TASK-004');
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', 'Validate and complete TASK-004');
              return validated(worktree);
            }
            return `RESULT: READY_TO_MERGE | task_id=TASK-004 | task_head=${git(worktree, 'rev-parse', 'HEAD')} | base_head=${git(root, 'rev-parse', 'HEAD')} | merge_message=Merge TASK-004`;
          },
        }
      );

      assert.deepStrictEqual(completed, [{
        taskId: 'TASK-004',
        validation: { iterations: 1, fixed: 0, unworked: 0 },
      }]);
      assert.strictEqual(fs.existsSync(worktree), false);
      assert.match(fs.readFileSync(path.join(root, 'specs', 'tasks.md'), 'utf8'), /\*\*Status:\*\* Complete/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('revalidates in another fresh process when finalization integrates a moved base', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-revalidate-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    const phases = [];
    const validationBases = [];
    let finalizeCalls = 0;
    let movedBase;
    try {
      initRepo(root);
      runTasks(
        {
          command: 'task',
          harness: 'claude',
          repo: root,
          project: null,
          tasks: ['TASK-004'],
          dryRun: false,
        },
        {
          pluginRoot: PLUGIN_ROOT,
          log: () => {},
          beforePhase(input) {
            if (input.phase === 'finalize' && !movedBase) {
              write(path.join(root, 'base-update.txt'), 'new base\n');
              git(root, 'add', '.');
              git(root, 'commit', '-m', 'Advance base');
              movedBase = git(root, 'rev-parse', 'HEAD');
            }
          },
          invokePhase(input) {
            phases.push(input.phase);
            if (input.phase === 'plan') {
              write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            }
            if (input.phase === 'implement') {
              assertPrecreatedWorktree(root, worktree, 'task/TASK-004');
              const taskFile = path.join(worktree, 'specs', 'tasks.md');
              fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
              write(path.join(worktree, 'feature.txt'), 'implemented\n');
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', 'Implement TASK-004');
              return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
            }
            if (input.phase === 'validate') {
              validationBases.push(input.baseSha);
              return validated(worktree);
            }
            finalizeCalls++;
            if (finalizeCalls === 1) {
              git(worktree, 'merge', 'main', '-m', 'Integrate updated base');
              return `RESULT: REVALIDATE | task_head=${git(worktree, 'rev-parse', 'HEAD')} | base_head=${git(root, 'rev-parse', 'main')} | reason=base advanced`;
            }
            return finalizeMock(root, worktree, 'TASK-004', 'task/TASK-004', 'main');
          },
        }
      );
      assert.deepStrictEqual(phases, ['plan', 'implement', 'validate', 'finalize', 'validate', 'finalize']);
      assert.strictEqual(validationBases[1], movedBase);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('revalidates when the base advances after READY but before publication', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-ready-publication-race-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    const phases = [];
    let publicationAttempts = 0;
    let finalizeAttempts = 0;
    try {
      initRepo(root);
      runTasks(
        { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
        {
          pluginRoot: PLUGIN_ROOT,
          log: () => {},
          beforePublication() {
            publicationAttempts++;
            if (publicationAttempts !== 1) return;
            write(path.join(root, 'concurrent-base.txt'), 'advanced\n');
            git(root, 'add', '.');
            git(root, 'commit', '-m', 'Advance base before publication');
          },
          invokePhase(input) {
            phases.push(input.phase);
            if (input.phase === 'plan') {
              writePlan(root);
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            }
            if (input.phase === 'implement') {
              assertPrecreatedWorktree(root, worktree, 'task/TASK-004');
              const taskFile = path.join(worktree, 'specs', 'tasks.md');
              fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
              write(path.join(worktree, 'feature.txt'), 'implemented\n');
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', 'Implement TASK-004');
              return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
            }
            if (input.phase === 'validate') {
              if (phases.filter((phase) => phase === 'validate').length === 2) {
                assert.ok(fs.existsSync(worktree), 'worktree was cleaned before revalidation');
                git(worktree, 'merge', 'main', '-m', 'Integrate advanced base');
              }
              return validated(worktree);
            }
            finalizeAttempts++;
            if (finalizeAttempts === 1) {
              return finalizeMock(root, worktree, 'TASK-004', 'task/TASK-004', 'main');
            }
            return `RESULT: READY_TO_MERGE | task_id=TASK-004 | task_head=${git(worktree, 'rev-parse', 'HEAD')} | base_head=${git(root, 'rev-parse', 'main')} | merge_message=Merge TASK-004`;
          },
        }
      );

      assert.deepStrictEqual(phases, ['plan', 'implement', 'validate', 'finalize', 'validate', 'finalize']);
      assert.strictEqual(fs.existsSync(worktree), false);
      assert.ok(fs.existsSync(path.join(root, 'concurrent-base.txt')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('uses the selected project inside the task worktree for monorepo validation and finalization', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-monorepo-context-'));
    const worktree = path.join(root, '.worktrees', 'api-TASK-004');
    const taskProject = path.join(worktree, 'apps', 'api');
    const calls = [];
    try {
      git(root, 'init', '-b', 'main');
      git(root, 'config', 'user.email', 'test@example.com');
      git(root, 'config', 'user.name', 'Test User');
      write(path.join(root, '.groundwork.yml'), 'version: 1\nprojects:\n  api:\n    path: apps/api\n');
      write(path.join(root, 'apps', 'api', 'specs', 'tasks.md'), '### TASK-004: Four\n**Status:** Not Started\n**Blocked by:** None\n');
      write(path.join(root, '.gitignore'), '.worktrees/\n.groundwork-plans/\n');
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'base');

      runTasks(
        {
          command: 'task',
          harness: 'codex',
          repo: root,
          project: 'api',
          tasks: ['TASK-004'],
          dryRun: false,
        },
        {
          pluginRoot: PLUGIN_ROOT,
          log: () => {},
          invokePhase(input) {
            calls.push(input);
            if (input.phase === 'plan') {
              write(path.join(root, 'apps', 'api', '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            }
            if (input.phase === 'implement') {
              assertPrecreatedWorktree(root, worktree, 'task/api/TASK-004');
              const taskFile = path.join(taskProject, 'specs', 'tasks.md');
              fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
              write(path.join(taskProject, 'feature.txt'), 'implemented\n');
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', 'Implement TASK-004');
              return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/api/TASK-004 | base_branch=main`;
            }
            if (input.phase === 'validate') return validated(worktree);
            return finalizeMock(root, worktree, 'TASK-004', 'task/api/TASK-004', 'main', taskProject);
          },
        }
      );

      const validateCall = calls.find((call) => call.phase === 'validate');
      const finalizeCall = calls.find((call) => call.phase === 'finalize');
      const expectedTaskProject = path.join(fs.realpathSync(root), '.worktrees', 'api-TASK-004', 'apps', 'api');
      assert.strictEqual(validateCall.cwd, expectedTaskProject);
      assert.strictEqual(finalizeCall.cwd, expectedTaskProject);
      assert.strictEqual(validateCall.env.GROUNDWORK_PROJECT_ROOT, validateCall.cwd);
      assert.strictEqual(finalizeCall.env.GROUNDWORK_PROJECT_ROOT, finalizeCall.cwd);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('preserves the worktree when finalization fails', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-preserve-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          {
            command: 'task',
            harness: 'codex',
            repo: root,
            project: null,
            tasks: ['TASK-004'],
            dryRun: false,
          },
          {
            pluginRoot: PLUGIN_ROOT,
            log: () => {},
            invokePhase(input) {
              if (input.phase === 'plan') {
                write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
                return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
              }
              if (input.phase === 'implement') {
                assertPrecreatedWorktree(root, worktree, 'task/TASK-004');
                write(path.join(worktree, 'feature.txt'), 'implemented\n');
                git(worktree, 'add', '.');
                git(worktree, 'commit', '-m', 'Implement TASK-004');
                return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
              }
              if (input.phase === 'validate') return validated(worktree);
              return 'RESULT: FAILURE | merge conflict needs judgment';
            },
          }
        ),
        /merge conflict needs judgment[\s\S]*Worktree preserved/
      );
      assert.ok(fs.existsSync(worktree));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects a false READY receipt when task bookkeeping did not occur', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-false-finalized-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          {
            command: 'task',
            harness: 'codex',
            repo: root,
            project: null,
            tasks: ['TASK-004'],
            dryRun: false,
          },
          {
            pluginRoot: PLUGIN_ROOT,
            log: () => {},
            invokePhase(input) {
              if (input.phase === 'plan') {
                write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
                return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
              }
              if (input.phase === 'implement') {
                assertPrecreatedWorktree(root, worktree, 'task/TASK-004');
                write(path.join(worktree, 'feature.txt'), 'implemented\n');
                git(worktree, 'add', '.');
                git(worktree, 'commit', '-m', 'Implement TASK-004');
                return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
              }
              if (input.phase === 'validate') return validated(worktree);
              return `RESULT: READY_TO_MERGE | task_id=TASK-004 | task_head=${git(worktree, 'rev-parse', 'HEAD')} | base_head=${git(root, 'rev-parse', 'HEAD')} | merge_message=Merge TASK-004`;
            },
          }
        ),
        /did not make only the required/
      );
      assert.ok(fs.existsSync(worktree));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects post-validation code before merging or cleaning up', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-unvalidated-finalize-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            pluginRoot: PLUGIN_ROOT,
            log: () => {},
            invokePhase(input) {
              if (input.phase === 'plan') {
                write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
                return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
              }
              if (input.phase === 'implement') {
                assertPrecreatedWorktree(root, worktree, 'task/TASK-004');
                const taskFile = path.join(worktree, 'specs', 'tasks.md');
                fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
                write(path.join(worktree, 'feature.txt'), 'implemented\n');
                git(worktree, 'add', '.');
                git(worktree, 'commit', '-m', 'Implement TASK-004');
                return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
              }
              if (input.phase === 'validate') return validated(worktree);
              completeTaskFile(worktree, 'TASK-004');
              write(path.join(worktree, 'unvalidated-code.js'), 'malicious();\n');
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', 'Unvalidated final changes');
              const taskHead = git(worktree, 'rev-parse', 'HEAD');
              return `RESULT: READY_TO_MERGE | task_id=TASK-004 | task_head=${taskHead} | base_head=${git(root, 'rev-parse', 'HEAD')} | merge_message=Merge TASK-004`;
            },
          }
        ),
        /changed non-bookkeeping paths/
      );
      assert.ok(fs.existsSync(worktree));
      assert.ok(!fs.existsSync(path.join(root, 'unvalidated-code.js')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('all runs dependent tasks sequentially from each newly merged base', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-all-'));
    const phases = [];
    const implementationBases = [];
    try {
      git(root, 'init', '-b', 'main');
      git(root, 'config', 'user.email', 'test@example.com');
      git(root, 'config', 'user.name', 'Test User');
      write(path.join(root, 'specs', 'tasks.md'),
        '### TASK-001: One\n**Status:** Not Started\n**Blocked by:** None\n\n' +
        '### TASK-002: Two\n**Status:** Not Started\n**Blocked by:** TASK-001\n');
      write(path.join(root, '.gitignore'), '.worktrees/\n.groundwork-plans/\n');
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'base');

      runTasks(
        {
          command: 'all',
          harness: 'codex',
          repo: root,
          project: null,
          tasks: [],
          dryRun: false,
        },
        {
          pluginRoot: PLUGIN_ROOT,
          log: () => {},
          invokePhase(input) {
            phases.push(`${input.taskId}:${input.phase}`);
            const worktree = path.join(root, '.worktrees', input.taskId);
            const branch = `task/${input.taskId}`;
            if (input.phase === 'plan') {
              write(path.join(root, '.groundwork-plans', `${input.taskId}-plan.md`), '# Plan\n');
              return `RESULT: PLANNED | plan_file_path=.groundwork-plans/${input.taskId}-plan.md | identifier=${input.taskId} | branch_prefix=task`;
            }
            if (input.phase === 'implement') {
              implementationBases.push(git(root, 'rev-parse', 'HEAD'));
              assertPrecreatedWorktree(root, worktree, branch);
              const taskFile = path.join(worktree, 'specs', 'tasks.md');
              fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('**Status:** Not Started', '**Status:** In Progress'));
              write(path.join(worktree, `${input.taskId}.txt`), 'implemented\n');
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', `Implement ${input.taskId}`);
              return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=${branch} | base_branch=main`;
            }
            if (input.phase === 'validate') return validated(worktree);
            return finalizeMock(root, worktree, input.taskId, branch, 'main');
          },
        }
      );

      assert.deepStrictEqual(phases, [
        'TASK-001:plan', 'TASK-001:implement', 'TASK-001:validate', 'TASK-001:finalize',
        'TASK-002:plan', 'TASK-002:implement', 'TASK-002:validate', 'TASK-002:finalize',
      ]);
      assert.notStrictEqual(implementationBases[0], implementationBases[1]);
      const catalog = require(RUNNER).parseTaskCatalog(fs.readFileSync(path.join(root, 'specs', 'tasks.md'), 'utf8'));
      assert.strictEqual(catalog.get('TASK-001').status, 'Complete');
      assert.strictEqual(catalog.get('TASK-002').status, 'Complete');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('all stops before starting a later task after a failure', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-all-stop-'));
    const tasksSeen = [];
    const logs = [];
    try {
      git(root, 'init', '-b', 'main');
      git(root, 'config', 'user.email', 'test@example.com');
      git(root, 'config', 'user.name', 'Test User');
      write(path.join(root, 'specs', 'tasks.md'),
        '### TASK-001: One\n**Status:** Not Started\n**Blocked by:** None\n\n' +
        '### TASK-002: Two\n**Status:** Not Started\n**Blocked by:** TASK-001\n');
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'base');
      assert.throws(
        () => runTasks(
          { command: 'all', harness: 'codex', repo: root, project: null, tasks: [], dryRun: false },
          {
            pluginRoot: PLUGIN_ROOT,
            log: (message) => logs.push(message),
            invokePhase(input) {
              tasksSeen.push(input.taskId);
              return 'RESULT: FAILURE | planning blocked';
            },
          }
        ),
        /planning blocked/
      );
      assert.deepStrictEqual(tasksSeen, ['TASK-001']);
      assert.match(logs.at(-1), /^\[\d{4}-\d\d-\d\d \d\d:\d\d:\d\d \S+\] \[TASK-001\] plan failed after \d\d:\d\d$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects an implementation receipt for an unexpected branch or worktree', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-wrong-worktree-'));
    const worktree = path.join(root, '.worktrees', 'wrong');
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          {
            command: 'task',
            harness: 'codex',
            repo: root,
            project: null,
            tasks: ['TASK-004'],
            dryRun: false,
          },
          {
            pluginRoot: PLUGIN_ROOT,
            log: () => {},
            invokePhase(input) {
              if (input.phase === 'plan') {
                write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
                return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
              }
              git(root, 'worktree', 'add', '-b', 'task/wrong', worktree);
              return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/wrong | base_branch=main`;
            },
          }
        ),
        /inactive task branch|unrelated registered worktree|expected branch task\/TASK-004/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('skill and export integration', () => {
  test('restores just-do-it as the original in-session workflow', () => {
    const skill = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', 'just-do-it', 'SKILL.md'), 'utf8');
    assert.ok(skill.includes('#### Phase A: Plan'));
    assert.ok(skill.includes('#### Phase C: Validate'));
    assert.ok(!skill.includes('groundwork-run.js'));
  });

  test('finalize-task has the same chain/dual visibility as validate', () => {
    const finalize = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', 'finalize-task', 'SKILL.md'), 'utf8');
    const frontmatter = finalize.split('---')[1];
    assert.ok(!frontmatter.includes('disable-model-invocation: true'));
    assert.ok(!frontmatter.includes('user-invocable: false'));
    assert.ok(finalize.includes('RESULT: FINALIZED'));
    assert.ok(finalize.includes('RESULT: REVALIDATE'));
  });

  test('all four phase skills accept an explicit optional project', () => {
    for (const name of ['plan-task', 'implement-task', 'validate', 'finalize-task']) {
      const skill = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', name, 'SKILL.md'), 'utf8');
      assert.ok(skill.includes('--project'), `${name} does not document --project`);
    }
  });

  test('runner mode prevents task-executor memory reuse and fixes the worktree path', () => {
    const implement = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', 'implement-task', 'SKILL.md'), 'utf8');
    const executor = fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', 'task-executor', 'AGENT.md'), 'utf8');
    assert.ok(implement.includes('WORKTREE PATH: [runner-supplied absolute worktree path]'));
    assert.ok(implement.includes('TASK BRANCH: [runner-supplied exact branch]'));
    assert.ok(executor.includes('skip reading and writing agent memory'));
    assert.ok(executor.includes('use that exact registered path'));
    assert.ok(executor.includes('use that exact branch'));
  });

  test('runner implementation contracts resume an existing exact worktree', () => {
    const implement = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', 'implement-task', 'SKILL.md'), 'utf8');
    const executor = fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', 'task-executor', 'AGENT.md'), 'utf8');
    assert.ok(implement.includes('RESUME EXISTING WORKTREE'));
    assert.match(executor, /already exists[\s\S]*reuse/i);
    assert.match(executor, /do not repeat[\s\S]*completed/i);
  });

  test('runner mode assigns task-worktree lifecycle exclusively to the runner', () => {
    const implement = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', 'implement-task', 'SKILL.md'), 'utf8');
    assert.match(implement, /runner exclusively owns.*worktree lifecycle/i);
    assert.match(implement, /verify.*precreated.*registered worktree/i);
  });

  test('validation emits bounded reviewer progress markers', () => {
    const validate = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', 'validate', 'SKILL.md'), 'utf8');
    assert.match(validate, /GROUNDWORK_VALIDATION_PROGRESS[\s\S]*"status":"launched"/);
    assert.match(validate, /GROUNDWORK_VALIDATION_PROGRESS[\s\S]*"status":"completed"/);
    assert.match(validate, /same assistant turn[\s\S]*launch/i);
  });

  test('Codex export installs the standalone runner outside any skill directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-install-'));
    try {
      execFileSync(
        'bash',
        [path.join(PLUGIN_ROOT, 'install-skills.sh'), '--codex', '--project', '--force', '--source', PLUGIN_ROOT],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
      const installedRunner = path.join(root, '.codex', 'groundwork-run.js');
      assert.ok(fs.existsSync(installedRunner), 'standalone Codex runner was not installed');
      assert.ok(!fs.existsSync(path.join(root, '.codex', 'skills', 'groundwork-just-do-it', 'scripts', 'groundwork-run.js')));
      assert.strictEqual(fs.readFileSync(installedRunner, 'utf8'), fs.readFileSync(RUNNER, 'utf8'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Codex export refuses a symlinked standalone runner destination', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-install-link-'));
    const external = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-install-external-')), 'runner.js');
    try {
      write(external, 'sentinel\n');
      fs.mkdirSync(path.join(root, '.codex'), { recursive: true });
      fs.symlinkSync(external, path.join(root, '.codex', 'groundwork-run.js'));
      assert.throws(
        () => execFileSync(
          'bash',
          [path.join(PLUGIN_ROOT, 'install-skills.sh'), '--codex', '--project', '--force', '--source', PLUGIN_ROOT],
          { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        ),
        /Command failed/
      );
      assert.strictEqual(fs.readFileSync(external, 'utf8'), 'sentinel\n');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(path.dirname(external), { recursive: true, force: true });
    }
  });
});

process.on('exit', () => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
});
