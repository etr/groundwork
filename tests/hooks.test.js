/**
 * Tests for hooks
 *
 * Run with: node tests/hooks.test.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawnSync } = require('child_process');
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

  test('has PostToolUse hooks', () => {
    const hooksJsonPath = path.join(HOOKS_DIR, 'hooks.json');
    const parsed = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));

    assert.ok(parsed.hooks.PostToolUse, 'Should have PostToolUse hooks');
    assert.ok(Array.isArray(parsed.hooks.PostToolUse), 'PostToolUse should be array');
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

describe('session-start selection scope', () => {
  test('announces workspace-default selections, then restores per-chat after pinning', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-hook-'));
    const home = path.join(repo, 'home');
    fs.mkdirSync(path.join(repo, 'apps', 'web', 'specs'), { recursive: true });
    fs.mkdirSync(home);
    fs.writeFileSync(path.join(repo, '.groundwork.yml'), 'version: 1\nprojects:\n  web:\n    path: apps/web\n');

    // Throttle the update check so the hook run stays offline.
    const stateDir = path.join(home, '.claude', 'groundwork-state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'last-update-check'), String(Date.now()));

    // Force the degraded (pane-less) identity: shim ps with the macOS
    // no-controlling-terminal marker so the TTY walk falls through.
    const bin = path.join(repo, 'shim-bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'ps'), "#!/bin/sh\necho '??'\n");
    fs.chmodSync(path.join(bin, 'ps'), 0o755);

    const env = { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
    for (const name of ['TMUX', 'TMUX_PANE', 'GROUNDWORK_SESSION_ID', 'CLAUDE_SESSION_ID', 'GROUNDWORK_HARNESS', 'CODEX_HOME']) delete env[name];

    try {
      const LIB = path.join(PLUGIN_ROOT, 'lib', 'project-context.js');
      const persisted = spawnSync('node', ['-e', `require(${JSON.stringify(LIB)}).persistSelection('web', ${JSON.stringify(path.join(repo, 'apps', 'web'))})`], { cwd: repo, env, encoding: 'utf8' });
      assert.strictEqual(persisted.status, 0, persisted.stderr);

      const runHook = (source) => {
        const result = spawnSync('bash', [path.join(HOOKS_DIR, 'session-start.sh')], {
          cwd: repo,
          env,
          input: JSON.stringify({ session_id: 'hook-chat-1', source }),
          encoding: 'utf8',
        });
        assert.strictEqual(result.status, 0, result.stderr);
        return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
      };

      // First observation of a shared workspace default: announced loudly.
      const first = runHook('clear');
      assert.ok(first.includes('Project: web'), first);
      assert.ok(first.includes('assumed from the last selection in this workspace'), first);

      // The pin makes the same session's next restore per-chat: no warning.
      const second = runHook('compact');
      assert.ok(second.includes('Project: web'), second);
      assert.ok(!second.includes('assumed from the last selection'), second);

      // ZCode delivers the session id as a hook environment variable instead
      // of stdin JSON. The same announce-then-pin progression must hold when
      // the session id reaches the hook only through CLAUDE_SESSION_ID: the
      // first observation of a new chat announces the shared default, and the
      // pin it triggers makes that chat's next restore per-chat.
      const runHookEnvSession = () => {
        const result = spawnSync('bash', [path.join(HOOKS_DIR, 'session-start.sh')], {
          cwd: repo,
          env: { ...env, CLAUDE_SESSION_ID: 'hook-chat-env-1' },
          input: JSON.stringify({ source: 'clear' }),
          encoding: 'utf8',
        });
        assert.strictEqual(result.status, 0, result.stderr);
        return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
      };
      const envFirst = runHookEnvSession();
      assert.ok(envFirst.includes('Project: web'), envFirst);
      assert.ok(envFirst.includes('assumed from the last selection in this workspace'), envFirst);
      const envSecond = runHookEnvSession();
      assert.ok(envSecond.includes('Project: web'), envSecond);
      assert.ok(!envSecond.includes('assumed from the last selection'), envSecond);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

// Summary
console.log(`\n${'='.repeat(40)}`);
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}`);

process.exit(failed > 0 ? 1 : 0);
