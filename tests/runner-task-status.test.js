/**
 * Regression tests for task status selection in the terminal runner.
 * Run with: node tests/runner-task-status.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseTaskCatalog, orderTasks } = require('../bin/groundwork-run.js');

const RUNNER = path.resolve(__dirname, '../bin/groundwork-run.js');
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

console.log('\nrunner task status regressions');

test('skips a task whose completion field follows stale in-progress metadata', () => {
  const catalog = parseTaskCatalog(
    '### TASK-017: Agent Type Registry\n\n**Status:** In Progress\n'
    + '\n**Action Items:**\n- [x] Register agent types\n\n**Status:** Complete\n'
    + '\n### TASK-018: Hook bridge\n**Status:** Not Started\n**Blocked by:** TASK-017\n'
  );

  assert.strictEqual(catalog.get('TASK-017').status, 'Complete');
  assert.deepStrictEqual(orderTasks(catalog), ['TASK-018']);
  assert.deepStrictEqual(orderTasks(catalog, ['TASK-017', 'TASK-018']), ['TASK-018']);
  assert.deepStrictEqual(orderTasks(catalog, ['TASK-018']), ['TASK-018']);
});

test('uses the last status when a completed task is explicitly reopened', () => {
  const catalog = parseTaskCatalog(
    '### TASK-017: Agent Type Registry\n**Status:** Complete\n\n**Status:** In Progress\n'
  );

  assert.strictEqual(catalog.get('TASK-017').status, 'In Progress');
  assert.deepStrictEqual(orderTasks(catalog), ['TASK-017']);
});

test('reads consecutive status fields as separate metadata lines', () => {
  const catalog = parseTaskCatalog(
    '### TASK-017: Registry\n**Status:** In Progress\n**Status:** Complete\n'
  );

  assert.deepStrictEqual(orderTasks(catalog), []);
});

test('uses a final deferred status after multiple stale fields', () => {
  const catalog = parseTaskCatalog(
    '### TASK-017: Parked work\n**Status:** Not Started\n**Status:** In Progress\n'
    + '\n- **Status:** Deferred — port on demand\n'
    + '\n### TASK-018: Dependent\n**Status:** Not Started\n**Blocked by:** TASK-017\n'
  );

  assert.strictEqual(catalog.get('TASK-017').status, 'Deferred');
  assert.deepStrictEqual(orderTasks(catalog, ['TASK-017']), []);
  assert.throws(() => orderTasks(catalog, ['TASK-018']), /blocked by deferred TASK-017/);
});

for (const status of ['Complete', 'Completed', 'Done', 'complete', 'completed', 'done', 'DONE']) {
  test(`skips the completion spelling ${JSON.stringify(status)}`, () => {
    const catalog = parseTaskCatalog(
      `### TASK-017: Finished work\r\n- **Status:** ${status} — verified\r\n`
      + '\r\n### TASK-018: Dependent\r\n**Status:** Not Started\r\n**Blocked by:** TASK-017\r\n'
    );

    assert.strictEqual(catalog.get('TASK-017').status, 'Complete');
    assert.deepStrictEqual(orderTasks(catalog, ['TASK-018']), ['TASK-018']);
    assert.deepStrictEqual(orderTasks(catalog, ['TASK-017']), []);
  });
}

for (const [status, canonical] of [
  ['not started', 'Not Started'],
  ['IN PROGRESS', 'In Progress'],
  ['blocked', 'Blocked'],
  ['DEFERRED', 'Deferred'],
]) {
  test(`normalizes ${JSON.stringify(status)} to its canonical status`, () => {
    const catalog = parseTaskCatalog(`### TASK-017: Work\n**Status:** ${status}\n`);

    assert.strictEqual(catalog.get('TASK-017').status, canonical);
  });
}

for (const layout of ['single-file', 'directory']) {
  test(`CLI dry-run skips completed tasks in a ${layout} catalog`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-status-'));
    try {
      execFileSync('git', ['init', '--quiet', '--initial-branch=main', root]);
      fs.writeFileSync(path.join(root, '.git/info/exclude'), '/specs/\n');
      fs.mkdirSync(path.join(root, 'specs/tasks'), { recursive: true });
      const completed = '### TASK-017: Registry\n**Status:** In Progress\n\n**Status:** Complete\n';
      const done = '### TASK-018: Bridge\n**Status:** Done\n';
      const pending = '### TASK-019: Next\n**Status:** Not Started\n**Blocked by:** TASK-017, TASK-018\n';
      if (layout === 'single-file') {
        fs.writeFileSync(path.join(root, 'specs/tasks.md'), `${completed}\n${done}\n${pending}`);
      } else {
        fs.writeFileSync(path.join(root, 'specs/tasks/TASK-017.md'), completed);
        fs.writeFileSync(path.join(root, 'specs/tasks/TASK-018.md'), done);
        fs.writeFileSync(path.join(root, 'specs/tasks/TASK-019.md'), pending);
      }

      const output = execFileSync(process.execPath, [
        RUNNER, 'all', '--harness', 'codex', '--repo', root, '--dry-run',
      ], { encoding: 'utf8' });

      assert.strictEqual(output, 'TASK-019\nRESULT: SUCCESS | completed=1\n');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
