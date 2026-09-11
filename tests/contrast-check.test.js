/**
 * Tests for lib/contrast-check.js
 *
 * Run with: node tests/contrast-check.test.js
 *
 * Reference values are recomputed WCAG ratios (they also appear in the
 * anti-slop reference table this helper was distilled from).
 */

const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');

const { parseColor, luminance, contrastRatio, verdicts } = require('../lib/contrast-check');

const SCRIPT = path.join(__dirname, '..', 'lib', 'contrast-check.js');

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

function assertRatioClose(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 0.005,
    `expected ~${expected}, got ${actual.toFixed(4)}`
  );
}

console.log('\nparseColor');

test('parses 6-digit hex with #', () => {
  assert.deepStrictEqual(parseColor('#FFFFFF'), [255, 255, 255]);
  assert.deepStrictEqual(parseColor('#333333'), [51, 51, 51]);
});

test('parses 6-digit hex without #', () => {
  assert.deepStrictEqual(parseColor('777777'), [119, 119, 119]);
});

test('expands 3-digit hex', () => {
  assert.deepStrictEqual(parseColor('#fff'), [255, 255, 255]);
  assert.deepStrictEqual(parseColor('F00'), [255, 0, 0]);
});

test('accepts named black/white', () => {
  assert.deepStrictEqual(parseColor('black'), [0, 0, 0]);
  assert.deepStrictEqual(parseColor('WHITE'), [255, 255, 255]);
});

test('rejects garbage input', () => {
  assert.throws(() => parseColor('not-a-color'), /expected a hex color/);
  assert.throws(() => parseColor('#12345'), /expected a hex color/);
});

console.log('\nluminance');

test('black is 0, white is 1', () => {
  assert.ok(luminance([0, 0, 0]) === 0);
  assert.ok(Math.abs(luminance([255, 255, 255]) - 1) < 1e-9);
});

console.log('\ncontrastRatio');

test('black on white is 21:1', () => {
  assertRatioClose(contrastRatio([0, 0, 0], [255, 255, 255]), 21);
});

test('order-independent', () => {
  const ab = contrastRatio(parseColor('#FFFFFF'), parseColor('#777777'));
  const ba = contrastRatio(parseColor('#777777'), parseColor('#FFFFFF'));
  assert.ok(Math.abs(ab - ba) < 1e-9);
});

test('reference pairings match WCAG values', () => {
  const pairs = [
    ['#FFFFFF', '#333333', 12.63],
    ['#FFFFFF', '#666666', 5.74],
    ['#777777', '#FFFFFF', 4.48],
    ['#FFFFFF', '#888888', 3.54],
    ['#FFFFFF', '#999999', 2.85],
    ['#555555', '#000000', 2.82],
  ];
  for (const [fg, bg, expected] of pairs) {
    assertRatioClose(contrastRatio(parseColor(fg), parseColor(bg)), expected);
  }
});

console.log('\nverdicts');

test('thresholds at 4.5 and 3.0', () => {
  const passing = verdicts(contrastRatio(parseColor('#777777'), parseColor('#FFFFFF')));
  assert.strictEqual(passing.ratio, 4.48);
  assert.strictEqual(passing.normalText, false, '4.48 must fail normal text');
  assert.strictEqual(passing.largeText, true, '4.48 must pass large text');

  const failing = verdicts(contrastRatio(parseColor('#555555'), parseColor('black')));
  assert.strictEqual(failing.normalText, false);
  assert.strictEqual(failing.largeText, false);

  const clean = verdicts(21);
  assert.strictEqual(clean.normalText, true);
  assert.strictEqual(clean.largeText, true);
});

console.log('\nCLI');

test('prints ratio and verdicts, exits 0 on full pass', () => {
  const out = execFileSync('node', [SCRIPT, '#000000', '#FFFFFF'], { encoding: 'utf8' });
  assert.ok(out.includes('ratio: 21.00:1'));
  assert.ok(out.includes('normal text (4.5:1): PASS'));
  assert.ok(out.includes('large text  (3.0:1): PASS'));
});

test('exits 1 when a threshold fails', () => {
  let err = null;
  try {
    execFileSync('node', [SCRIPT, '#777777', '#FFFFFF'], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'must exit non-zero');
  assert.strictEqual(err.status, 1);
  assert.ok(String(err.stdout).includes('normal text (4.5:1): FAIL'));
});

test('exits 2 on bad input', () => {
  let err = null;
  try {
    execFileSync('node', [SCRIPT, 'nope', '#FFFFFF'], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'must exit non-zero');
  assert.strictEqual(err.status, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
