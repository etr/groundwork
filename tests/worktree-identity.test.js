/**
 * Tests for the shared worktree-identity CLI (lib/worktree-identity.js).
 *
 * Covers the interactive-skill contract: monorepo project qualification,
 * single-project short forms, and the R5 interop requirement that an
 * interactive session can detect a runner-owned legacy worktree instead of
 * silently adopting or clobbering it.
 *
 * Run with: node tests/worktree-identity.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(PLUGIN_ROOT, 'lib', 'worktree-identity.js');

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

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// realpath: keep the fixture equal to git's resolved toplevel on macOS.
function makeMonorepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-wtid-'));
  const root = fs.realpathSync(tmp);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test User');
  write(path.join(root, 'apps', 'web', 'specs', 'tasks.md'), '### TASK-004: Web\n');
  write(path.join(root, '.groundwork.yml'), [
    'version: 1',
    'projects:',
    '  web:',
    '    path: apps/web',
    '',
  ].join('\n'));
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  return root;
}

function makeSingleRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-wtid-single-'));
  const root = fs.realpathSync(tmp);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test User');
  write(path.join(root, 'specs', 'tasks.md'), '### TASK-004: Four\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  return root;
}

function cleanEnv(home) {
  const env = { ...process.env, HOME: home, PATH: process.env.PATH };
  for (const name of [
    'TMUX', 'TMUX_PANE', 'GROUNDWORK_PROJECT', 'GROUNDWORK_PROJECT_ROOT',
    'GROUNDWORK_HARNESS', 'CLAUDE_CONFIG_DIR', 'ZCODE_HOME', 'CODEX_HOME',
    'XDG_CONFIG_HOME', 'GROUNDWORK_SESSION_ID',
  ]) delete env[name];
  return env;
}

function resolveIdentity(cwd, env, ...args) {
  const result = spawnSync('node', [CLI, ...args], {
    cwd, env, encoding: 'utf8',
  });
  assert.strictEqual(result.status, 0, `CLI failed: ${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

describe('worktree-identity CLI', () => {
  test('monorepo scope returns the project-qualified identity', () => {
    const root = makeMonorepo();
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    try {
      const env = cleanEnv(home);
      env.GROUNDWORK_PROJECT_ROOT = path.join(root, 'apps', 'web');
      const identity = resolveIdentity(root, env, 'TASK-004');
      assert.strictEqual(identity.scope, 'project');
      assert.strictEqual(identity.branch, 'task/web/TASK-004');
      assert.strictEqual(identity.path, path.join(root, '.worktrees', 'web-TASK-004'));
      assert.strictEqual(identity.legacy.branch, 'task/TASK-004');
      assert.strictEqual(identity.legacy.exists, false);
      assert.strictEqual(identity.legacy.runner_owner, null);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('single-project scope returns the short unqualified identity', () => {
    const root = makeSingleRepo();
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    try {
      const env = cleanEnv(home);
      const identity = resolveIdentity(root, env, 'TASK-004');
      assert.strictEqual(identity.scope, 'repo');
      assert.strictEqual(identity.branch, 'task/TASK-004');
      assert.strictEqual(identity.path, path.join(root, '.worktrees', 'TASK-004'));
      assert.strictEqual(identity.legacy, null);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('--project selects the project without ambient env', () => {
    const root = makeMonorepo();
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    try {
      const identity = resolveIdentity(root, cleanEnv(home), 'TASK-004', '--project', 'web');
      assert.strictEqual(identity.branch, 'task/web/TASK-004');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects unsafe task identifiers', () => {
    const root = makeSingleRepo();
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    try {
      const result = spawnSync('node', [CLI, 'evil/../id'], {
        cwd: root, env: cleanEnv(home), encoding: 'utf8',
      });
      assert.notStrictEqual(result.status, 0);
      assert.ok(/task-id/.test(result.stderr));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('R5 interop: interactive sessions see runner-owned worktrees', () => {
  test('a runner checkpoint owning the legacy worktree is surfaced as runner_owner', () => {
    const root = makeMonorepo();
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    try {
      // Simulate the pre-scoping world: an unqualified branch + worktree,
      // owned by exactly one runner checkpoint for this project.
      git(root, 'branch', 'task/TASK-004');
      fs.mkdirSync(path.join(root, '.worktrees', 'TASK-004'), { recursive: true });
      const commonDir = path.resolve(root, git(root, 'rev-parse', '--git-common-dir'));
      write(
        path.join(commonDir, 'groundwork', 'runner', 'a'.repeat(16), 'TASK-004.json'),
        JSON.stringify({ taskId: 'TASK-004', project: 'apps/web' })
      );

      const env = cleanEnv(home);
      env.GROUNDWORK_PROJECT_ROOT = path.join(root, 'apps', 'web');
      const identity = resolveIdentity(root, env, 'TASK-004');

      // The checkpoint-backed legacy identity is adopted, and the legacy
      // report tells the caller who owns it.
      assert.strictEqual(identity.branch, 'task/TASK-004');
      assert.strictEqual(identity.legacy.exists, true);
      assert.strictEqual(identity.legacy.runner_owner, 'apps/web');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('an unowned legacy worktree is reported but not adopted', () => {
    const root = makeMonorepo();
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    try {
      git(root, 'branch', 'task/TASK-004');
      fs.mkdirSync(path.join(root, '.worktrees', 'TASK-004'), { recursive: true });

      const env = cleanEnv(home);
      env.GROUNDWORK_PROJECT_ROOT = path.join(root, 'apps', 'web');
      const identity = resolveIdentity(root, env, 'TASK-004');

      // No checkpoint proves ownership, so the scoped identity is chosen;
      // the legacy report still surfaces the existing directory so the
      // caller can warn instead of clobbering.
      assert.strictEqual(identity.branch, 'task/web/TASK-004');
      assert.strictEqual(identity.legacy.exists, true);
      assert.strictEqual(identity.legacy.runner_owner, null);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
