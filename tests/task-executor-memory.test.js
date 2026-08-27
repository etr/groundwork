/** Focused fail-open tests for runner-owned task-executor project memory. */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const memory = require('../lib/task-executor-memory.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (error) { console.log(`  ✗ ${name}\n    ${error.stack || error.message}`); failed++; }
}
function describe(name, fn) { console.log(`\n${name}`); fn(); }
function write(file, body) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); }
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-task-memory-'));
  const projectRoot = path.join(root, 'project');
  const commonDir = path.join(root, 'common');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(commonDir, { recursive: true });
  return { root, projectRoot, commonDir, source: path.join(projectRoot, '.claude', 'agent-memory', 'groundwork', 'task-executor', 'memory.md') };
}

describe('frozen implementation memory', () => {
  test('discovers a plugin-scoped task-executor source and freezes a reusable immutable snapshot', () => {
    const item = fixture();
    try {
      write(item.source, 'Run tests with: bash tests/run-tests.sh\n');
      const first = memory.prepareSnapshot(item);
      fs.writeFileSync(item.source, 'live source changed');
      const second = memory.prepareSnapshot(item);
      assert.strictEqual(second.digest, first.digest);
      assert.strictEqual(second.text, 'Run tests with: bash tests/run-tests.sh');
    } finally { fs.rmSync(item.root, { recursive: true, force: true }); }
  });

  test('rejects unsafe sources and returns empty advisory memory without throwing', () => {
    const item = fixture();
    try {
      write(item.source, 'OPENAI_API_KEY=should-never-appear');
      const snapshot = memory.prepareSnapshot(item);
      assert.strictEqual(snapshot.text, '');
    } finally { fs.rmSync(item.root, { recursive: true, force: true }); }
  });

  test('freezes an empty snapshot so a later live source cannot alter a retry', () => {
    const item = fixture();
    try {
      const first = memory.prepareSnapshot({ ...item, taskId: 'TASK-004' });
      write(item.source, 'This arrived after the implementation began');
      const second = memory.prepareSnapshot({ ...item, taskId: 'TASK-004' });
      assert.strictEqual(second.digest, first.digest);
      assert.strictEqual(second.text, '');
    } finally { fs.rmSync(item.root, { recursive: true, force: true }); }
  });

  test('rejects symlinked sources and never leaks a secret in its warning', () => {
    const item = fixture();
    const warnings = [];
    try {
      const outside = path.join(item.root, 'outside.md');
      write(outside, 'OPENAI_API_KEY=never-show-this');
      fs.mkdirSync(path.dirname(item.source), { recursive: true });
      fs.symlinkSync(outside, item.source);
      const snapshot = memory.prepareSnapshot({ ...item, logger: (message) => warnings.push(message) });
      assert.strictEqual(snapshot.text, '');
      assert.ok(warnings.every((message) => !message.includes('never-show-this')));
    } finally { fs.rmSync(item.root, { recursive: true, force: true }); }
  });

  test('accepts only bounded versioned proposal facts and publishes with nonblocking CAS', () => {
    const item = fixture();
    try {
      const snapshot = memory.prepareSnapshot(item);
      const proposalPath = memory.prepareProposalPath({ ...item, taskId: 'TASK-004' });
      assert.ok(fs.existsSync(path.dirname(proposalPath)));
      write(proposalPath, JSON.stringify({ v: 1, facts: [{ category: 'test', text: 'Use node tests/example.test.js' }] }));
      const result = memory.publishProposal({ ...item, snapshot, proposalPath });
      assert.strictEqual(result.status, 'published');
      assert.match(fs.readFileSync(memory.canonicalPath(item), 'utf8'), /tests\/example/);
    } finally { fs.rmSync(item.root, { recursive: true, force: true }); }
  });

  test('ignores malformed proposals and lock contention without affecting the caller', () => {
    const item = fixture();
    try {
      const proposalPath = memory.proposalPath({ ...item, taskId: 'TASK-004' });
      write(proposalPath, '{bad json');
      assert.strictEqual(memory.publishProposal({ ...item, proposalPath }).status, 'ignored');
      fs.writeFileSync(proposalPath, JSON.stringify({ v: 1, facts: [{ category: 'test', text: 'Run focused tests' }] }));
      fs.mkdirSync(path.dirname(memory.lockPath(item)), { recursive: true });
      fs.writeFileSync(memory.lockPath(item), 'held');
      assert.strictEqual(memory.publishProposal({ ...item, proposalPath }).status, 'deferred');
    } finally { fs.rmSync(item.root, { recursive: true, force: true }); }
  });
});

if (failed) process.exitCode = 1;
else console.log(`\n${passed} tests passed`);
