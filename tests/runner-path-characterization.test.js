/**
 * Runner path-identity characterization tests (R1).
 *
 * Pin the current behavior of the runner's task-workspace identity, plan-file
 * candidate resolution, and plan-ignore maintenance BEFORE any extraction or
 * re-scoping. These tests must keep passing, unchanged, when the
 * implementations move to shared lib modules and the runner delegates — they
 * are the proof that the refactor is behavior-preserving.
 *
 * Run with: node tests/runner-path-characterization.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const RUNNER = path.join(PLUGIN_ROOT, 'bin', 'groundwork-run.js');

process.env.GROUNDWORK_SKIP_INSTALL_CHECK = '1';

const {
  taskWorkspaceIdentity,
  legacyWorkspaceOwner,
  assertRunnerPlanFile,
  ensureLocalPlanIgnore,
} = require(RUNNER);

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

// realpath: on macOS the tmpdir (/var/folders/...) is a symlink to
// /private/var/..., and git reports the resolved toplevel — keep both equal.
function makeRepo(withMonorepo = false) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-char-'));
  const root = fs.realpathSync(tmp);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test User');
  write(path.join(root, 'specs', 'tasks.md'), '### TASK-004: Four\n');
  if (withMonorepo) {
    write(path.join(root, 'apps', 'web', 'specs', 'tasks.md'), '### TASK-004: Web\n');
    write(path.join(root, '.groundwork.yml'), [
      'version: 1',
      'projects:',
      '  web:',
      '    path: apps/web',
      '',
    ].join('\n'));
  }
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  return root;
}

function commonDirOf(root) {
  return path.resolve(root, git(root, 'rev-parse', '--git-common-dir'));
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

describe('taskWorkspaceIdentity (pinned shapes)', () => {
  test('single-project repos use the unqualified legacy identity', () => {
    const root = makeRepo(false);
    try {
      const identity = taskWorkspaceIdentity(root, commonDirOf(root), root, null, 'TASK-004', {});
      assert.deepStrictEqual(identity, {
        branch: 'task/TASK-004',
        worktreePath: path.join(root, '.worktrees', 'TASK-004'),
      });
    } finally {
      cleanup(root);
    }
  });

  test('monorepo projects use the project-qualified scoped identity by default', () => {
    const root = makeRepo(true);
    try {
      const projectRoot = path.join(root, 'apps', 'web');
      const identity = taskWorkspaceIdentity(root, commonDirOf(root), projectRoot, 'web', 'TASK-004', {});
      assert.deepStrictEqual(identity, {
        branch: 'task/web/TASK-004',
        worktreePath: path.join(root, '.worktrees', 'web-TASK-004'),
      });
    } finally {
      cleanup(root);
    }
  });

  test('a checkpoint workspace record pins whichever identity it recorded', () => {
    const root = makeRepo(true);
    try {
      const commonDir = commonDirOf(root);
      const projectRoot = path.join(root, 'apps', 'web');
      const legacy = {
        branch: 'task/TASK-004',
        worktreePath: path.join(root, '.worktrees', 'TASK-004'),
      };
      const scoped = {
        branch: 'task/web/TASK-004',
        worktreePath: path.join(root, '.worktrees', 'web-TASK-004'),
      };
      assert.deepStrictEqual(
        taskWorkspaceIdentity(root, commonDir, projectRoot, 'web', 'TASK-004', { workspace: legacy }),
        legacy
      );
      assert.deepStrictEqual(
        taskWorkspaceIdentity(root, commonDir, projectRoot, 'web', 'TASK-004', { workspace: scoped }),
        scoped
      );
    } finally {
      cleanup(root);
    }
  });

  test('a checkpoint workspace record matching neither shape is rejected', () => {
    const root = makeRepo(true);
    try {
      assert.throws(
        () => taskWorkspaceIdentity(root, commonDirOf(root), path.join(root, 'apps', 'web'), 'web', 'TASK-004', {
          workspace: { branch: 'task/other/TASK-004', worktreePath: path.join(root, '.worktrees', 'x') },
        }),
        /invalid workspace identity/
      );
    } finally {
      cleanup(root);
    }
  });

  test('a legacy implementation record without workspace keeps the legacy identity', () => {
    const root = makeRepo(true);
    try {
      const identity = taskWorkspaceIdentity(root, commonDirOf(root), path.join(root, 'apps', 'web'), 'web', 'TASK-004', {
        implementation: { branch: 'task/TASK-004', worktreePath: path.join(root, '.worktrees', 'TASK-004') },
      });
      assert.strictEqual(identity.branch, 'task/TASK-004');
    } finally {
      cleanup(root);
    }
  });

  test('an orphaned legacy worktree is adopted only when one runner checkpoint owns it for this project', () => {
    const root = makeRepo(true);
    try {
      const commonDir = commonDirOf(root);
      const legacyBranch = 'task/TASK-004';
      const legacyWorktree = path.join(root, '.worktrees', 'TASK-004');
      git(root, 'branch', legacyBranch);
      fs.mkdirSync(legacyWorktree, { recursive: true });
      // No checkpoint: owner unknown → scoped identity.
      assert.strictEqual(
        taskWorkspaceIdentity(root, commonDir, path.join(root, 'apps', 'web'), 'web', 'TASK-004', {}).branch,
        'task/web/TASK-004'
      );
      // One checkpoint naming this project as the legacy owner → adopted.
      const namespace = 'a'.repeat(16);
      write(
        path.join(commonDir, 'groundwork', 'runner', namespace, 'TASK-004.json'),
        JSON.stringify({ taskId: 'TASK-004', project: 'apps/web' })
      );
      assert.strictEqual(
        legacyWorkspaceOwner(commonDir, 'TASK-004', legacyBranch, legacyWorktree),
        'apps/web'
      );
      assert.strictEqual(
        taskWorkspaceIdentity(root, commonDir, path.join(root, 'apps', 'web'), 'web', 'TASK-004', {}).branch,
        'task/TASK-004'
      );
      // A second checkpoint from a different project makes ownership ambiguous → scoped.
      const otherNamespace = 'b'.repeat(16);
      write(
        path.join(commonDir, 'groundwork', 'runner', otherNamespace, 'TASK-004.json'),
        JSON.stringify({ taskId: 'TASK-004', project: 'apps/api' })
      );
      assert.strictEqual(legacyWorkspaceOwner(commonDir, 'TASK-004', legacyBranch, legacyWorktree), null);
      assert.strictEqual(
        taskWorkspaceIdentity(root, commonDir, path.join(root, 'apps', 'web'), 'web', 'TASK-004', {}).branch,
        'task/web/TASK-004'
      );
    } finally {
      cleanup(root);
    }
  });

  test('monorepo identity requires a safe project name', () => {
    const root = makeRepo(true);
    try {
      assert.throws(
        () => taskWorkspaceIdentity(root, commonDirOf(root), path.join(root, 'apps', 'web'), 'we b', 'TASK-004', {}),
        /safe project name/
      );
    } finally {
      cleanup(root);
    }
  });
});

describe('assertRunnerPlanFile (pinned candidate order)', () => {
  test('prefers the task project root plan over the repo-root legacy location', () => {
    const root = makeRepo(true);
    try {
      const taskRoot = path.join(root, 'apps', 'web');
      const baseRoot = root;
      write(path.join(taskRoot, '.groundwork-plans', 'TASK-004-plan.md'), '# task-root plan\n');
      write(path.join(baseRoot, '.groundwork-plans', 'TASK-004-plan.md'), '# base-root plan\n');
      const resolved = assertRunnerPlanFile(taskRoot, baseRoot, '.groundwork-plans/TASK-004-plan.md');
      assert.strictEqual(fs.readFileSync(resolved, 'utf8'), '# task-root plan\n');
    } finally {
      cleanup(root);
    }
  });

  test('falls back to the repo-root legacy location when the project-scoped plan is absent', () => {
    const root = makeRepo(true);
    try {
      const taskRoot = path.join(root, 'apps', 'web');
      write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# base-root plan\n');
      const resolved = assertRunnerPlanFile(taskRoot, root, '.groundwork-plans/TASK-004-plan.md');
      assert.strictEqual(fs.readFileSync(resolved, 'utf8'), '# base-root plan\n');
    } finally {
      cleanup(root);
    }
  });

  test('rejects a legacy repo-root plan that records a foreign project', () => {
    const root = makeRepo(true);
    try {
      const taskRoot = path.join(root, 'apps', 'web');
      write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), [
        '# base-root plan\n\n## Context\n',
        '- Identifier: TASK-004\n',
        '- Specs dir: apps/api/specs\n',
        '- Tasks path: apps/api/specs/tasks.md\n',
      ].join(''));
      assert.throws(
        () => assertRunnerPlanFile(taskRoot, root, '.groundwork-plans/TASK-004-plan.md'),
        (error) => {
          assert.ok(/belongs to a different project/.test(error.message), error.message);
          // Actionable: the reason names the recorded foreign context.
          assert.ok(error.message.includes('apps/api/specs'), error.message);
          return true;
        }
      );
    } finally {
      cleanup(root);
    }
  });

  test('adopts a legacy repo-root plan recording this project', () => {
    const root = makeRepo(true);
    try {
      const taskRoot = path.join(root, 'apps', 'web');
      write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), [
        '# base-root plan\n\n## Context\n',
        '- Identifier: TASK-004\n',
        '- Specs dir: apps/web/specs\n',
      ].join(''));
      const resolved = assertRunnerPlanFile(taskRoot, root, '.groundwork-plans/TASK-004-plan.md');
      assert.strictEqual(
        fs.readFileSync(resolved, 'utf8'),
        '# base-root plan\n\n## Context\n- Identifier: TASK-004\n- Specs dir: apps/web/specs\n'
      );
    } finally {
      cleanup(root);
    }
  });

  test('fails when neither candidate exists', () => {
    const root = makeRepo(true);
    try {
      assert.throws(
        () => assertRunnerPlanFile(path.join(root, 'apps', 'web'), root, '.groundwork-plans/TASK-004-plan.md'),
        /ENOENT|Plan file/
      );
    } finally {
      cleanup(root);
    }
  });

  test('rejects plan paths outside .groundwork-plans', () => {
    const root = makeRepo(false);
    try {
      write(path.join(root, 'elsewhere.md'), '# escape\n');
      assert.throws(
        () => assertRunnerPlanFile(root, root, '../elsewhere.md'),
        /outside \.groundwork-plans/
      );
    } finally {
      cleanup(root);
    }
  });
});

describe('ensureLocalPlanIgnore (pinned exclude maintenance)', () => {
  test('single-project repos append the root plans pattern once', () => {
    const root = makeRepo(false);
    try {
      ensureLocalPlanIgnore(root, root);
      const exclude = fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8');
      assert.ok(exclude.includes('/.groundwork-plans/'));
      ensureLocalPlanIgnore(root, root);
      const again = fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8');
      assert.strictEqual(again.match(/\/\.groundwork-plans\//g).length, 1);
    } finally {
      cleanup(root);
    }
  });

  test('monorepos append a pattern per configured project plus the active one', () => {
    const root = makeRepo(true);
    try {
      fs.writeFileSync(path.join(root, '.groundwork.yml'), [
        'version: 1',
        'projects:',
        '  web:',
        '    path: apps/web',
        '  api:',
        '    path: apps/api',
        '',
      ].join('\n'));
      const projectRoot = path.join(root, 'apps', 'web');
      ensureLocalPlanIgnore(root, projectRoot);
      const exclude = fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8');
      assert.ok(exclude.includes('/apps/web/.groundwork-plans/'));
      assert.ok(exclude.includes('/apps/api/.groundwork-plans/'));
    } finally {
      cleanup(root);
    }
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
