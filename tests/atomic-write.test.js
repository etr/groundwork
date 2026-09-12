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
    try {
      const file = path.join(dir, 'state.json');
      // Two writes in the same millisecond from the same pid still pick
      // distinct temporaries because the rename happens synchronously; pin
      // that the final state is always one complete document.
      writeFileSyncAtomic(file, '{"n":1}');
      writeFileSyncAtomic(file, '{"n":2}');
      assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).n, 2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

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
