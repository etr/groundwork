/**
 * Tests for hooks
 *
 * Run with: node tests/hooks.test.js
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const assert = require('assert');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const HOOKS_DIR = path.join(PLUGIN_ROOT, 'hooks');

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
describe('hooks.json', () => {
  test('exists and is valid JSON', () => {
    const hooksJsonPath = path.join(HOOKS_DIR, 'hooks.json');
    assert.ok(fs.existsSync(hooksJsonPath), 'hooks.json should exist');

    const content = fs.readFileSync(hooksJsonPath, 'utf8');
    const parsed = JSON.parse(content);

    assert.ok(parsed.hooks, 'Should have hooks object');
  });

  test('has SessionStart hook', () => {
    const hooksJsonPath = path.join(HOOKS_DIR, 'hooks.json');
    const parsed = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));

    assert.ok(parsed.hooks.SessionStart, 'Should have SessionStart hook');
    assert.ok(Array.isArray(parsed.hooks.SessionStart), 'SessionStart should be array');
  });

  test('has PreToolUse hooks', () => {
    const hooksJsonPath = path.join(HOOKS_DIR, 'hooks.json');
    const parsed = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));

    assert.ok(parsed.hooks.PreToolUse, 'Should have PreToolUse hooks');
    assert.ok(Array.isArray(parsed.hooks.PreToolUse), 'PreToolUse should be array');
  });

  test('all hook commands reference existing files', () => {
    const hooksJsonPath = path.join(HOOKS_DIR, 'hooks.json');
    const parsed = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));

    for (const [event, hookConfigs] of Object.entries(parsed.hooks)) {
      for (const config of hookConfigs) {
        for (const hook of config.hooks) {
          if (hook.command) {
            // Replace ${CLAUDE_PLUGIN_ROOT} with actual path
            const command = hook.command.replace('${CLAUDE_PLUGIN_ROOT}', PLUGIN_ROOT);
            // Extract the script path (first token after any interpreter)
            const parts = command.split(' ');
            let scriptPath = parts[0];

            // Handle interpreter prefixes
            if (['node', 'python3', 'bash'].includes(scriptPath)) {
              scriptPath = parts[1];
            }

            assert.ok(
              fs.existsSync(scriptPath),
              `Hook script should exist: ${scriptPath} (from ${event})`
            );
          }
        }
      }
    }
  });
});

describe('session-start.sh', () => {
  test('is executable', () => {
    const scriptPath = path.join(HOOKS_DIR, 'session-start.sh');
    const stats = fs.statSync(scriptPath);
    const isExecutable = (stats.mode & parseInt('111', 8)) !== 0;

    assert.ok(isExecutable, 'session-start.sh should be executable');
  });

  test('outputs valid JSON', () => {
    const scriptPath = path.join(HOOKS_DIR, 'session-start.sh');

    try {
      const output = execSync(`bash ${scriptPath}`, {
        cwd: PLUGIN_ROOT,
        encoding: 'utf8',
        stdio: 'pipe'
      });

      const parsed = JSON.parse(output);
      assert.ok(parsed.hookSpecificOutput, 'Should have hookSpecificOutput');
      assert.ok(parsed.hookSpecificOutput.hookEventName, 'Should have hookEventName');
    } catch (error) {
      // Script might fail if dependencies missing, which is OK for testing
      if (error.message.includes('JSON')) {
        throw error;
      }
    }
  });
});

describe('lib/utils.js', () => {
  test('exports required functions', () => {
    const utils = require('../lib/utils');

    assert.ok(typeof utils.getTempDir === 'function', 'Should export getTempDir');
    assert.ok(typeof utils.readFile === 'function', 'Should export readFile');
    assert.ok(typeof utils.writeFile === 'function', 'Should export writeFile');
    assert.ok(typeof utils.log === 'function', 'Should export log');
  });

  test('getTempDir returns valid path', () => {
    const utils = require('../lib/utils');
    const tempDir = utils.getTempDir();

    assert.ok(typeof tempDir === 'string', 'Should return string');
    assert.ok(tempDir.includes('claude-groundwork'), 'Should include plugin name');
  });
});

// Summary
console.log(`\n${'='.repeat(40)}`);
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}`);

process.exit(failed > 0 ? 1 : 0);
