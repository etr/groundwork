/** Tests for the structured validation-fixer result contract. */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const VALIDATOR = path.resolve(__dirname, '..', 'lib', 'validate-fixer-result.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
    failed++;
  }
}

function writeResult(result) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-fixer-result-'));
  const file = path.join(dir, 'result.json');
  fs.writeFileSync(file, JSON.stringify(result));
  return { dir, file };
}

function validate(file, findingIds) {
  return spawnSync('node', [VALIDATOR, '--file', file, '--finding-ids', findingIds.join(',')], {
    encoding: 'utf8',
  });
}

function withResult(result, findingIds, assertion) {
  const { dir, file } = writeResult(result);
  try {
    assertion(validate(file, findingIds));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log('\nvalidate-fixer-result');

test('accepts a complete fixed result for the requested findings', () => {
  const ids = ['code-quality-reviewer-iter1-1', 'security-reviewer-iter1-2'];
  withResult({
    status: 'fixed',
    files_touched: ['lib/example.js'],
    findings_fixed: ids,
    findings_skipped: [],
  }, ids, (result) => {
    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(JSON.parse(result.stdout), {
      status: 'fixed',
      files_touched: ['lib/example.js'],
      findings_fixed: ids,
      findings_skipped: [],
    });
  });
});

test('accepts a partial result with a reason for each skipped finding', () => {
  const fixed = 'code-quality-reviewer-iter1-1';
  const skipped = 'security-reviewer-iter1-2';
  withResult({
    status: 'partial',
    files_touched: ['lib/example.js'],
    findings_fixed: [fixed],
    findings_skipped: [{ id: skipped, reason: 'requires a product decision' }],
  }, [fixed, skipped], (result) => {
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(JSON.parse(result.stdout).status, 'partial');
  });
});

test('accepts a failure result with a concise reason', () => {
  withResult({
    status: 'failure',
    reason: 'tests cannot run because the fixture is unavailable',
  }, ['security-reviewer-iter1-2'], (result) => {
    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(JSON.parse(result.stdout), {
      status: 'failure',
      reason: 'tests cannot run because the fixture is unavailable',
    });
  });
});

test('rejects fixed results that omit requested findings', () => {
  withResult({
    status: 'fixed',
    files_touched: ['lib/example.js'],
    findings_fixed: ['code-quality-reviewer-iter1-1'],
    findings_skipped: [],
  }, ['code-quality-reviewer-iter1-1', 'security-reviewer-iter1-2'], (result) => {
    assert.notStrictEqual(result.status, 0);
    assert.ok(result.stderr.includes('must account for every requested finding'));
  });
});

test('rejects partial results with unknown IDs or missing skip reasons', () => {
  withResult({
    status: 'partial',
    files_touched: [],
    findings_fixed: ['not-a-requested-finding'],
    findings_skipped: [{ id: 'security-reviewer-iter1-2', reason: '' }],
  }, ['code-quality-reviewer-iter1-1', 'security-reviewer-iter1-2'], (result) => {
    assert.notStrictEqual(result.status, 0);
    assert.ok(result.stderr.includes('unknown finding ID'));
  });
});

test('rejects malformed failure results', () => {
  withResult({ status: 'failure', reason: '' }, ['security-reviewer-iter1-2'], (result) => {
    assert.notStrictEqual(result.status, 0);
    assert.ok(result.stderr.includes('failure result requires a non-empty reason'));
  });
});

console.log(`\nTests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
