/**
 * Tests for the shared atomic write helper.
 *
 * Run with: node tests/atomic-write.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeFileSyncAtomic, writeJsonSyncAtomic } = require('../lib/atomic-write');

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

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gw-atomic-'));
}

describe('writeFileSyncAtomic', () => {
  test('writes the exact content to the destination', () => {
    const dir = tmpDir();
    try {
      const file = path.join(dir, 'state.json');
      writeFileSyncAtomic(file, 'hello\n');
      assert.strictEqual(fs.readFileSync(file, 'utf8'), 'hello\n');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('leaves no temporary files behind on success', () => {
    const dir = tmpDir();
    try {
      const file = path.join(dir, 'state.json');
      writeFileSyncAtomic(file, 'x');
      assert.deepStrictEqual(fs.readdirSync(dir), ['state.json']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('creates missing parent directories with mkdir: true', () => {
    const dir = tmpDir();
    try {
      const file = path.join(dir, 'a', 'b', 'state.json');
      writeFileSyncAtomic(file, 'x', { mkdir: true });
      assert.strictEqual(fs.readFileSync(file, 'utf8'), 'x');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('replaces prior content atomically (rename, not truncate)', () => {
    const dir = tmpDir();
    try {
      const file = path.join(dir, 'state.json');
      writeFileSyncAtomic(file, 'first');
      writeFileSyncAtomic(file, 'second');
      assert.strictEqual(fs.readFileSync(file, 'utf8'), 'second');
      assert.deepStrictEqual(fs.readdirSync(dir), ['state.json']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('produces owner-only files (mode 0600)', () => {
    const dir = tmpDir();
    try {
      const file = path.join(dir, 'state.json');
      writeFileSyncAtomic(file, 'x');
      assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('distinct concurrent writers cannot collide on the temporary name', () => {
    const dir = tmpDir();
    const originalNow = Date.now;
    try {
      const file = path.join(dir, 'state.json');
      // Freeze the clock: with pid+time-only temporaries, two writes in the
      // same frozen millisecond collide on the temporary name (EEXIST). The
      // temporary name must carry uniqueness beyond pid and time.
      Date.now = () => 1234567890;
      let collisions = 0;
      for (let i = 0; i < 8; i++) {
        try {
          writeFileSyncAtomic(file, `{"n":${i}}`);
        } catch (error) {
          if (error.code === 'EEXIST') collisions++;
          else throw error;
        }
      }
      assert.strictEqual(collisions, 0, 'temporary names collided under a frozen clock');
      assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).n, 7);
      assert.deepStrictEqual(readdirWithoutTemporaries(dir), ['state.json']);
    } finally {
      Date.now = originalNow;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('writeFileSyncAtomic multi-process concurrency', () => {
  const { spawn } = require('child_process');
  const WORKERS = path.join(__dirname, 'helpers', 'atomic-io-workers.js');

  function sleepMs(milliseconds) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  }

  function spawnWorker(name, args, env) {
    const ready = path.join(env.WORKER_DIR, `${name}.ready`);
    const release = path.join(env.WORKER_DIR, `${name}.release`);
    const result = path.join(env.WORKER_DIR, `${name}.result`);
    const child = spawn(process.execPath, [WORKERS, ...args], {
      env: {
        ...process.env,
        ...env,
        WORKER_READY: ready,
        WORKER_RELEASE: release,
        WORKER_RESULT: result,
      },
      stdio: 'ignore',
    });
    return { child, ready, release, result };
  }

  function awaitResult(worker, description, timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    while (!fs.existsSync(worker.result)) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${description}`);
      sleepMs(10);
    }
    return JSON.parse(fs.readFileSync(worker.result, 'utf8'));
  }

  test('independent writers under a release barrier never tear or leak temporaries', () => {
    const dir = tmpDir();
    const workerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-atomic-barrier-'));
    const target = path.join(dir, 'shared-state.json');
    writeJsonSyncAtomic(target, { worker: 'seed', seq: 0 });
    const stop = path.join(workerDir, 'stop');
    const spawned = [];
    try {
      const common = { WORKER_DIR: workerDir, WORKER_TARGET: target, WORKER_WRITES: '40' };
      const writers = [1, 2, 3, 4].map((n) => {
        const worker = spawnWorker(`w${n}`, ['writer'], common);
        spawned.push(worker);
        return worker;
      });
      const reader = spawnWorker('reader', ['reader'], { ...common, WORKER_STOP: stop });
      spawned.push(reader);

      for (const worker of [...writers, reader]) {
        const deadline = Date.now() + 30000;
        while (!fs.existsSync(worker.ready)) {
          if (Date.now() > deadline) throw new Error('worker never became ready');
          sleepMs(10);
        }
      }

      // Release every writer in the same tick; the reader is already looping.
      // Release/stop are published atomically too, so a worker polling for the
      // file's existence never sees a half-written signal.
      for (const writer of writers) writeFileSyncAtomic(writer.release, 'go\n');
      for (const writer of writers) {
        const outcome = awaitResult(writer, 'writer');
        assert.ok(outcome.ok, `a writer failed: ${outcome.error}`);
      }

      writeFileSyncAtomic(stop, 'stop\n');
      const read = awaitResult(reader, 'reader');
      assert.ok(read.reads > 0, 'the reader never observed the document');
      assert.strictEqual(read.failures, 0, `torn reads observed: ${JSON.stringify(read.failureSamples)}`);

      assert.deepStrictEqual(readdirWithoutTemporaries(dir), ['shared-state.json']);
      assert.ok(
        fs.readdirSync(dir).every((name) => !name.includes('.tmp')),
        'a temporary file leaked in the destination directory'
      );
    } finally {
      // Failure-safe ordered cleanup. Whatever failed above, no worker may be
      // left running (an orphaned reader keeps node's event loop alive via its
      // ChildProcess handle and the suite never terminates), and no rmSync may
      // race a still-writing worker (ENOTEMPTY).
      // (1) Idempotently signal every worker to finish: writeJsonSyncAtomic
      //     renames over any existing signal, so this is safe on every path.
      for (const worker of spawned) {
        try {
          writeFileSyncAtomic(worker.release, 'go\n');
        } catch {
          // Worker directory already gone — nothing left to signal.
        }
      }
      try {
        writeFileSyncAtomic(stop, 'stop\n');
      } catch {
        // Same.
      }
      // (2) Bounded wait for the workers to finish. A worker's result file is
      //     its last action before exiting, so its existence is the exit
      //     proxy: child.exitCode cannot update while this synchronous loop
      //     blocks the event loop, and an exited-but-unreaped child still
      //     answers kill(pid, 0) like a live one.
      const exitDeadline = Date.now() + 5000;
      while (Date.now() < exitDeadline && spawned.some((worker) => !fs.existsSync(worker.result))) {
        sleepMs(20);
      }
      // (3) SIGKILL anything not observed finishing, so no child can hold the
      //     event loop open past this test.
      for (const worker of spawned) {
        if (
          !fs.existsSync(worker.result) &&
          worker.child.exitCode === null &&
          worker.child.signalCode === null
        ) {
          try {
            worker.child.kill('SIGKILL');
          } catch {
            // Already fully gone.
          }
        }
      }
      // (4) Tolerant removal: if a killed writer lands one last .tmp between
      //     listing and unlink, retry instead of throwing ENOTEMPTY.
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      fs.rmSync(workerDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});

function readdirWithoutTemporaries(dir) {
  return fs.readdirSync(dir).filter((name) => !name.includes('.tmp'));
}

describe('writeJsonSyncAtomic', () => {
  test('serializes JSON with a trailing newline', () => {
    const dir = tmpDir();
    try {
      const file = path.join(dir, 'state.json');
      writeJsonSyncAtomic(file, { a: 1 });
      assert.strictEqual(fs.readFileSync(file, 'utf8'), '{"a":1}\n');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
