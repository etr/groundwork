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

  function awaitResult(worker, description, timeoutMs = 30000) {
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
    try {
      const common = { WORKER_DIR: workerDir, WORKER_TARGET: target, WORKER_WRITES: '40' };
      const writers = [1, 2, 3, 4].map((n) => spawnWorker(`w${n}`, ['writer'], common));
      const stop = path.join(workerDir, 'stop');
      const reader = spawnWorker('reader', ['reader'], { ...common, WORKER_STOP: stop });

      for (const writer of [...writers, reader]) {
        const deadline = Date.now() + 15000;
        while (!fs.existsSync(writer.ready)) {
          if (Date.now() > deadline) throw new Error('worker never became ready');
          sleepMs(10);
        }
      }

      // Release every writer in the same tick; the reader is already looping.
      for (const writer of writers) fs.writeFileSync(writer.release, 'go\n');
      for (const writer of writers) {
        const outcome = awaitResult(writer, 'writer');
        assert.ok(outcome.ok, `a writer failed: ${outcome.error}`);
      }

      fs.writeFileSync(stop, 'stop\n');
      const read = awaitResult(reader, 'reader');
      assert.ok(read.reads > 0, 'the reader never observed the document');
      assert.strictEqual(read.failures, 0, `torn reads observed: ${JSON.stringify(read.failureSamples)}`);

      assert.deepStrictEqual(readdirWithoutTemporaries(dir), ['shared-state.json']);
      assert.ok(
        fs.readdirSync(dir).every((name) => !name.includes('.tmp')),
        'a temporary file leaked in the destination directory'
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(workerDir, { recursive: true, force: true });
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
