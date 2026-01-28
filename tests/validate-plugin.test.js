/**
 * Tests for lib/validate-plugin.js
 *
 * Run with: node tests/validate-plugin.test.js
 */

const path = require('path');
const { execSync } = require('child_process');
const assert = require('assert');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const VALIDATOR = path.join(PLUGIN_ROOT, 'lib', 'validate-plugin.js');

// Test utilities
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

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

// Tests
describe('validate-plugin.js', () => {
  test('runs without crashing', () => {
    // Should not throw
    execSync(`node ${VALIDATOR}`, {
      cwd: PLUGIN_ROOT,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  });

  test('produces output', () => {
    const output = execSync(`node ${VALIDATOR}`, {
      cwd: PLUGIN_ROOT,
      encoding: 'utf8',
      stdio: 'pipe'
    });

    assert.ok(output.includes('Validating'), 'Should show validation message');
  });

  test('checks skills directory', () => {
    const output = execSync(`node ${VALIDATOR}`, {
      cwd: PLUGIN_ROOT,
      encoding: 'utf8',
      stdio: 'pipe'
    });

    // If there are errors, they would be in output
    // If not, "All checks passed" should appear
    assert.ok(
      output.includes('passed') || output.includes('error') || output.includes('warning'),
      'Should produce a result'
    );
  });
});

describe('skill validation rules', () => {
  test('all skills have valid frontmatter', () => {
    const output = execSync(`node ${VALIDATOR}`, {
      cwd: PLUGIN_ROOT,
      encoding: 'utf8',
      stdio: 'pipe'
    });

    // Check no "Missing or invalid YAML frontmatter" errors
    assert.ok(
      !output.includes('Missing or invalid YAML frontmatter'),
      'All skills should have valid frontmatter'
    );
  });

  test('all skills have name field', () => {
    const output = execSync(`node ${VALIDATOR}`, {
      cwd: PLUGIN_ROOT,
      encoding: 'utf8',
      stdio: 'pipe'
    });

    assert.ok(
      !output.includes('Missing required field: name'),
      'All skills should have name field'
    );
  });

  test('all skills have description field', () => {
    const output = execSync(`node ${VALIDATOR}`, {
      cwd: PLUGIN_ROOT,
      encoding: 'utf8',
      stdio: 'pipe'
    });

    assert.ok(
      !output.includes('Missing required field: description'),
      'All skills should have description field'
    );
  });
});

// Summary
console.log(`\n${'='.repeat(40)}`);
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}`);

process.exit(failed > 0 ? 1 : 0);
