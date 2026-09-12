/**
 * Tests for the shared state-directory resolution (lib/state-dir.js) and its
 * bash adoption contract.
 *
 * R6: the helper must resolve identically to the historical hardcoded bash
 * path in plain environments, honor the per-harness config redirections (the
 * D1 fix), and stay well-defined under the runner's filtered phase
 * environments.
 *
 * Run with: node tests/state-dir.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const STATE_DIR_CLI = path.join(PLUGIN_ROOT, 'lib', 'state-dir.js');

process.env.GROUNDWORK_SKIP_INSTALL_CHECK = '1';
const { buildChildEnv } = require(path.join(PLUGIN_ROOT, 'bin', 'groundwork-run.js'));

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

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statedir-'));
}

// Run lib/state-dir.js under a controlled environment.
function resolveStateDir(env) {
  const result = spawnSync('node', [STATE_DIR_CLI], {
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  });
  assert.strictEqual(result.status, 0, `state-dir.js failed: ${result.stderr}`);
  return result.stdout.trim();
}

const HARNESS_VARS = [
  'GROUNDWORK_HARNESS', 'CLAUDE_CONFIG_DIR', 'ZCODE_HOME', 'CODEX_HOME',
  'OPENCODE_CONFIG_DIR', 'XDG_CONFIG_HOME', 'KIRO_HOME', 'PI_HOME',
];

describe('state-dir resolution parity with the Node lib', () => {
  test('plain environment keeps the historical ~/.claude location (bash parity)', () => {
    const home = tmpHome();
    try {
      assert.strictEqual(
        resolveStateDir({ HOME: home }),
        path.join(home, '.claude', 'groundwork-state')
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('CLAUDE_CONFIG_DIR redirects the claude state directory', () => {
    const home = tmpHome();
    try {
      assert.strictEqual(
        resolveStateDir({ HOME: home, CLAUDE_CONFIG_DIR: path.join(home, 'cfg') }),
        path.join(home, 'cfg', 'groundwork-state')
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('ZCODE_HOME redirects the zcode state directory', () => {
    const home = tmpHome();
    try {
      assert.strictEqual(
        resolveStateDir({ HOME: home, ZCODE_HOME: path.join(home, 'z') }),
        path.join(home, 'z', 'groundwork-state')
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('state-dir under runner phase environments (R6 pinning)', () => {
  const saved = {};

  function withCleanHarnessEnv(fn) {
    for (const name of HARNESS_VARS) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
    try {
      fn();
    } finally {
      for (const name of HARNESS_VARS) {
        if (saved[name] === undefined) delete process.env[name];
        else process.env[name] = saved[name];
      }
    }
  }

  test('a filtered phase env without harness vars resolves into the phase temp home (legacy parity)', () => {
    withCleanHarnessEnv(() => {
      const tempHome = tmpHome();
      try {
        // Mirror invokePhase's zcode child: HOME redirected to a temp
        // coordinator home, harness-prefixed vars filtered from a parent
        // env that defines none.
        const phaseEnv = buildChildEnv('zcode', { HOME: tempHome });
        assert.strictEqual(
          resolveStateDir(phaseEnv),
          path.join(tempHome, '.claude', 'groundwork-state')
        );
      } finally {
        fs.rmSync(tempHome, { recursive: true, force: true });
      }
    });
  });

  test('a phase env that leaks the harness var resolves the real harness state dir', () => {
    withCleanHarnessEnv(() => {
      const tempHome = tmpHome();
      const realZcodeHome = path.join(tempHome, 'real-zcode');
      fs.mkdirSync(realZcodeHome, { recursive: true });
      try {
        // When the runner's parent shell exports ZCODE_HOME, buildChildEnv
        // passes it through: hook state then resolves to the real harness
        // state directory rather than the throwaway phase temp home. This is
        // the intended D1 behavior (advisory hook state only; the runner's
        // own checkpoints/leases/reporting live under .git and are
        // unaffected) — pinned here so any further change is deliberate.
        process.env.ZCODE_HOME = realZcodeHome;
        const phaseEnv = buildChildEnv('zcode', { HOME: path.join(tempHome, 'phase-home') });
        assert.strictEqual(
          resolveStateDir(phaseEnv),
          path.join(realZcodeHome, 'groundwork-state')
        );
      } finally {
        delete process.env.ZCODE_HOME;
        fs.rmSync(tempHome, { recursive: true, force: true });
      }
    });
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
