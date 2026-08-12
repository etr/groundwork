/**
 * Tests for the terminal-first, fresh-process Groundwork task runner.
 *
 * Run with: node tests/groundwork-run.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const RUNNER = path.join(PLUGIN_ROOT, 'bin', 'groundwork-run.js');

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

function initRepo(root, taskId = 'TASK-004') {
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test User');
  write(
    path.join(root, 'specs', 'tasks.md'),
    `### ${taskId}: Four\n**Status:** Not Started\n**Blocked by:** None\n`
  );
  write(path.join(root, '.gitignore'), '.worktrees/\n.groundwork-plans/\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
}

function completeTaskFile(projectRoot, taskId) {
  const taskFile = path.join(projectRoot, 'specs', 'tasks.md');
  const current = fs.readFileSync(taskFile, 'utf8');
  fs.writeFileSync(taskFile, current.replace('**Status:** In Progress', '**Status:** Complete'));
}

function finalizeMock(root, worktree, taskId, branch, baseBranch, taskProjectRoot = worktree) {
  completeTaskFile(taskProjectRoot, taskId);
  git(worktree, 'add', '.');
  git(worktree, 'commit', '-m', `Finalize ${taskId}`);
  const taskHead = git(worktree, 'rev-parse', 'HEAD');
  const baseHead = git(root, 'rev-parse', baseBranch);
  return `RESULT: READY_TO_MERGE | task_id=${taskId} | task_head=${taskHead} | base_head=${baseHead} | merge_message=Merge ${taskId}: complete task`;
}

function validated(worktree, iterations = 1, fixed = 0, unworked = 0) {
  return `RESULT: VALIDATED | iterations=${iterations} | fixed=${fixed} | unworked=${unworked} | validated_head=${git(worktree, 'rev-parse', 'HEAD')}`;
}

describe('module and CLI contract', () => {
  test('exposes a terminal runner deep-module API', () => {
    assert.ok(fs.existsSync(RUNNER), 'bin/groundwork-run.js is missing');
    const runner = require(RUNNER);
    for (const name of [
      'parseArgs',
      'parseTaskCatalog',
      'orderTasks',
      'parsePlanResult',
      'parseImplementationResult',
      'parseValidationResult',
      'parseFinalizeResult',
      'buildInvocation',
      'assertRegisteredWorktree',
      'runTasks',
    ]) {
      assert.strictEqual(typeof runner[name], 'function', `${name} is not exported`);
    }
  });

  test('supports explicit task and all subcommands', () => {
    const { parseArgs } = require(RUNNER);
    assert.deepStrictEqual(
      parseArgs(['task', '4', '--harness', 'claude', '--project', 'api']),
      {
        command: 'task',
        harness: 'claude',
        repo: process.cwd(),
        project: 'api',
        tasks: ['TASK-004'],
        dryRun: false,
      }
    );
    assert.deepStrictEqual(
      parseArgs(['all', '--harness', 'codex', '--dry-run']).command,
      'all'
    );
    assert.throws(() => parseArgs(['--harness', 'codex']), /task or all/);
    assert.throws(() => parseArgs(['all', '--harness', 'pi']), /claude or codex/);
  });

  test('dry-run does not modify repository-local excludes', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-dry-run-'));
    try {
      initRepo(root);
      const exclude = path.join(root, '.git', 'info', 'exclude');
      const before = fs.readFileSync(exclude, 'utf8');
      assert.deepStrictEqual(
        runTasks({
          command: 'all',
          harness: 'codex',
          repo: root,
          project: null,
          tasks: [],
          dryRun: true,
        }, { log: () => {} }),
        ['TASK-004']
      );
      assert.strictEqual(fs.readFileSync(exclude, 'utf8'), before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('requires the primary worktree as the repository root', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-primary-'));
    const linked = path.join(root, '.worktrees', 'existing');
    try {
      initRepo(root);
      git(root, 'worktree', 'add', '-b', 'task/existing', linked);
      assert.throws(
        () => runTasks({
          command: 'all',
          harness: 'codex',
          repo: linked,
          project: null,
          tasks: [],
          dryRun: true,
        }, { log: () => {} }),
        /primary worktree/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('task catalog', () => {
  const markdown = `### TASK-003: Third
**Status:** Not Started
**Blocked by:** TASK-001, TASK-002

### TASK-001: First
**Status:** Complete
**Blocked by:** None

### TASK-002: Second
**Status:** Not Started
**Blocked by:** TASK-001
`;

  test('parses and topologically orders incomplete tasks', () => {
    const { parseTaskCatalog, orderTasks } = require(RUNNER);
    const catalog = parseTaskCatalog(markdown);
    assert.deepStrictEqual(catalog.get('TASK-003').blockedBy, ['TASK-001', 'TASK-002']);
    assert.deepStrictEqual(orderTasks(catalog), ['TASK-002', 'TASK-003']);
    assert.deepStrictEqual(orderTasks(catalog, ['TASK-003', 'TASK-002']), ['TASK-002', 'TASK-003']);
  });

  test('rejects missing dependencies and cycles', () => {
    const { parseTaskCatalog, orderTasks } = require(RUNNER);
    assert.throws(
      () => orderTasks(parseTaskCatalog('### TASK-001: One\n**Status:** Not Started\n**Blocked by:** TASK-999')),
      /TASK-999/
    );
    const cycle = parseTaskCatalog(
      '### TASK-001: One\n**Status:** Not Started\n**Blocked by:** TASK-002\n' +
      '### TASK-002: Two\n**Status:** Not Started\n**Blocked by:** TASK-001\n'
    );
    assert.throws(() => orderTasks(cycle), /cycle/i);
  });
});

describe('fresh harness adapters', () => {
  test('streams Git record output larger than the synchronous child-process buffer', () => {
    const { forEachGitRecord } = require(RUNNER);
    const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-large-git-'));
    const fakeGit = path.join(fakeBin, 'git');
    const originalPath = process.env.PATH;
    try {
      write(fakeGit, `#!/usr/bin/env node
const fs = require('fs');
const record = Buffer.from('ignored.txt\\0');
for (let index = 0; index < 100000; index++) fs.writeSync(1, record);
`);
      fs.chmodSync(fakeGit, 0o755);
      process.env.PATH = `${fakeBin}${path.delimiter}${originalPath}`;

      let records = 0;
      forEachGitRecord(fakeBin, ['ls-files', '-z'], (record) => {
        assert.strictEqual(record, 'ignored.txt');
        records++;
      });

      assert.strictEqual(records, 100000);
    } finally {
      process.env.PATH = originalPath;
      fs.rmSync(fakeBin, { recursive: true, force: true });
    }
  });

  test('never resumes Claude or Codex sessions', () => {
    const { buildInvocation } = require(RUNNER);
    const claude = buildInvocation({
      harness: 'claude',
      cwd: '/repo',
      pluginRoot: '/plugin',
      prompt: 'phase',
      resultFile: '/tmp/result',
    });
    assert.strictEqual(claude.command, 'claude');
    assert.ok(claude.args.includes('--no-session-persistence'));
    assert.ok(claude.args.includes('--plugin-dir'));
    assert.ok(!claude.args.includes('--resume'));

    const codex = buildInvocation({
      harness: 'codex',
      cwd: '/repo',
      pluginRoot: '/plugin',
      prompt: 'phase',
      resultFile: '/tmp/result',
    });
    assert.strictEqual(codex.command, 'codex');
    assert.deepStrictEqual(codex.args.slice(0, 2), ['exec', '--ephemeral']);
    assert.ok(codex.args.includes('--output-last-message'));
    assert.ok(!codex.args.includes('resume'));
  });

  test('parses all four bounded phase results', () => {
    const runner = require(RUNNER);
    assert.strictEqual(
      runner.parsePlanResult('RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task').identifier,
      'TASK-004'
    );
    assert.strictEqual(
      runner.parseImplementationResult('RESULT: IMPLEMENTED | worktree_path=/repo/.worktrees/TASK-004 | branch=task/TASK-004 | base_branch=main').branch,
      'task/TASK-004'
    );
    assert.deepStrictEqual(
      runner.parseValidationResult(`notes\nRESULT: VALIDATED | iterations=2 | fixed=3 | unworked=1 | validated_head=${'a'.repeat(40)}`),
      { iterations: 2, fixed: 3, unworked: 1, validatedHead: 'a'.repeat(40) }
    );
    assert.deepStrictEqual(
      runner.parseFinalizeResult('RESULT: REVALIDATE | task_head=abc123 | base_head=def456 | reason=base advanced'),
      { outcome: 'revalidate', taskHead: 'abc123', baseHead: 'def456', reason: 'base advanced' }
    );
    assert.strictEqual(
      runner.parseFinalizeResult('RESULT: READY_TO_MERGE | task_id=TASK-004 | task_head=def456 | base_head=abc123 | merge_message=Merge TASK-004').outcome,
      'ready'
    );
  });

  test('child environments omit unrelated credentials and process injection variables', () => {
    const { buildChildEnv } = require(RUNNER);
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      NODE_OPTIONS: process.env.NODE_OPTIONS,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };
    try {
      process.env.DATABASE_URL = 'secret-db';
      process.env.NODE_OPTIONS = '--require /tmp/inject.js';
      process.env.OPENAI_API_KEY = 'codex-auth';
      const env = buildChildEnv('codex', { GROUNDWORK_RUNNER_MODE: 'true' });
      assert.strictEqual(env.DATABASE_URL, undefined);
      assert.strictEqual(env.NODE_OPTIONS, undefined);
      assert.strictEqual(env.OPENAI_API_KEY, 'codex-auth');
      assert.strictEqual(env.GROUNDWORK_RUNNER_MODE, 'true');
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test('uses the real subprocess boundary and Codex last-message file', () => {
    const { invokePhase } = require(RUNNER);
    const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-fake-bin-'));
    const previousPath = process.env.PATH;
    try {
      const codex = path.join(fakeBin, 'codex');
      write(codex, '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = "--output-last-message" ]; then shift; result="$1"; fi\n  shift\ndone\nprintf "%s\\n" "RESULT: TEST" > "$result"\n');
      fs.chmodSync(codex, 0o755);
      process.env.PATH = `${fakeBin}:${previousPath}`;
      assert.strictEqual(
        invokePhase({
          harness: 'codex',
          phase: 'plan',
          cwd: process.cwd(),
          pluginRoot: PLUGIN_ROOT,
          prompt: 'test prompt',
          env: {},
        }).trim(),
        'RESULT: TEST'
      );
    } finally {
      process.env.PATH = previousPath;
      fs.rmSync(fakeBin, { recursive: true, force: true });
    }
  });

  test('propagates a real child-process failure', () => {
    const { invokePhase } = require(RUNNER);
    const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-failing-bin-'));
    const previousPath = process.env.PATH;
    try {
      const claude = path.join(fakeBin, 'claude');
      write(claude, '#!/bin/sh\nprintf "%s\\n" "simulated failure" >&2\nexit 7\n');
      fs.chmodSync(claude, 0o755);
      process.env.PATH = `${fakeBin}:${previousPath}`;
      assert.throws(
        () => invokePhase({
          harness: 'claude',
          phase: 'validate',
          cwd: process.cwd(),
          pluginRoot: PLUGIN_ROOT,
          prompt: 'test prompt',
          env: {},
        }),
        /exited 7: simulated failure/
      );
    } finally {
      process.env.PATH = previousPath;
      fs.rmSync(fakeBin, { recursive: true, force: true });
    }
  });
});

describe('filesystem safety', () => {
  test('rejects a symlinked tasks file before invoking a phase', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-task-link-'));
    const external = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-external-task-')), 'tasks.md');
    try {
      git(root, 'init', '-b', 'main');
      git(root, 'config', 'user.email', 'test@example.com');
      git(root, 'config', 'user.name', 'Test User');
      write(external, '### TASK-004: Four\n**Status:** Not Started\n**Blocked by:** None\n');
      fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
      fs.symlinkSync(external, path.join(root, 'specs', 'tasks.md'));
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'base');
      assert.throws(
        () => runTasks(
          { command: 'all', harness: 'codex', repo: root, project: null, tasks: [], dryRun: true },
          { log: () => {}, invokePhase: () => { throw new Error('phase should not run'); } }
        ),
        /symlink/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(path.dirname(external), { recursive: true, force: true });
    }
  });

  test('rejects an oversized task spec before invoking a phase', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-large-task-'));
    try {
      initRepo(root);
      fs.truncateSync(path.join(root, 'specs', 'tasks.md'), 10 * 1024 * 1024 + 1);
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'oversized tasks');
      assert.throws(
        () => runTasks(
          { command: 'all', harness: 'codex', repo: root, project: null, tasks: [], dryRun: true },
          { log: () => {}, invokePhase: () => { throw new Error('phase should not run'); } }
        ),
        /10 MiB/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects command-bearing repository Git configuration', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-git-command-'));
    try {
      initRepo(root);
      git(root, 'config', 'filter.unsafe.smudge', '/tmp/groundwork-unsafe-filter');
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          { log: () => {}, invokePhase: () => { throw new Error('phase should not run'); } }
        ),
        /command-bearing/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects tracked base edits hidden with assume-unchanged', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-assume-unchanged-'));
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            log: () => {},
            invokePhase() {
              write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              git(root, 'update-index', '--assume-unchanged', '.gitignore');
              fs.appendFileSync(path.join(root, '.gitignore'), 'hidden-change\n');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            },
          }
        ),
        /tracked content|assume-unchanged/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects unrelated ref changes made by a phase', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-unrelated-ref-'));
    try {
      initRepo(root);
      git(root, 'tag', 'keep-me');
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            log: () => {},
            invokePhase() {
              write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              git(root, 'tag', '-d', 'keep-me');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            },
          }
        ),
        /refs outside/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects base submodule changes even when configured to ignore them', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-submodule-'));
    const submodule = path.join(root, 'vendor', 'sub');
    try {
      initRepo(root);
      fs.mkdirSync(submodule, { recursive: true });
      git(submodule, 'init', '-b', 'main');
      git(submodule, 'config', 'user.email', 'test@example.com');
      git(submodule, 'config', 'user.name', 'Test User');
      write(path.join(submodule, 'tracked.txt'), 'before\n');
      git(submodule, 'add', '.');
      git(submodule, 'commit', '-m', 'submodule base');
      git(root, 'add', 'vendor/sub');
      git(root, 'commit', '-m', 'add embedded submodule');
      git(root, 'config', 'submodule.vendor/sub.ignore', 'all');
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            log: () => {},
            invokePhase() {
              write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              write(path.join(submodule, 'tracked.txt'), 'after\n');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            },
          }
        ),
        /tracked content|submodule|not clean/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('allows an ignored virtualenv interpreter symlink to an external file', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-ignored-link-'));
    const external = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-link-target-')), 'target');
    try {
      initRepo(root);
      fs.appendFileSync(path.join(root, '.gitignore'), 'scratch-link\n');
      git(root, 'add', '.gitignore');
      git(root, 'commit', '-m', 'ignore scratch link');
      write(external, 'outside\n');
      fs.symlinkSync(external, path.join(root, 'scratch-link'));
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          { log: () => {}, invokePhase: () => { throw new Error('phase reached'); } }
        ),
        /phase reached/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(path.dirname(external), { recursive: true, force: true });
    }
  });

  test('does not read contents of ignored cache files during preflight', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-ignored-cache-'));
    const cache = path.join(root, '.cache', 'opaque.bin');
    try {
      initRepo(root);
      fs.appendFileSync(path.join(root, '.gitignore'), '.cache/\n');
      git(root, 'add', '.gitignore');
      git(root, 'commit', '-m', 'ignore cache');
      write(cache, 'opaque\n');
      fs.chmodSync(cache, 0o000);

      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          { log: () => {}, invokePhase: () => { throw new Error('phase reached'); } }
        ),
        /phase reached/
      );
    } finally {
      if (fs.existsSync(cache)) fs.chmodSync(cache, 0o600);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('four-phase orchestration', () => {
  test('rejects a plan reached through a symlinked plan directory', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-plan-link-'));
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-external-plan-'));
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            pluginRoot: PLUGIN_ROOT,
            log: () => {},
            invokePhase() {
              fs.rmdirSync(path.join(root, '.groundwork-plans'));
              fs.symlinkSync(external, path.join(root, '.groundwork-plans'), 'dir');
              write(path.join(external, 'TASK-004-plan.md'), '# External plan\n');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            },
          }
        ),
        /contains a symlink/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(external, { recursive: true, force: true });
    }
  });

  test('rejects a task worktree root replaced by a symlink during validation', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-worktree-link-'));
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-external-worktree-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    const moved = path.join(external, 'TASK-004');
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            pluginRoot: PLUGIN_ROOT,
            log: () => {},
            invokePhase(input) {
              if (input.phase === 'plan') {
                write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
                return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
              }
              if (input.phase === 'implement') {
                git(root, 'worktree', 'add', '-b', 'task/TASK-004', worktree);
                const taskFile = path.join(worktree, 'specs', 'tasks.md');
                fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
                git(worktree, 'add', '.');
                git(worktree, 'commit', '-m', 'Implement TASK-004');
                return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
              }
              git(root, 'worktree', 'move', worktree, moved);
              fs.symlinkSync(moved, worktree, 'dir');
              return validated(moved);
            },
          }
        ),
        /Registered worktrees changed|not a real directory|symlink/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(external, { recursive: true, force: true });
    }
  });

  test('runs plan, implement, validate, and finalize in separate calls with explicit project context', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-four-phases-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    const calls = [];
    try {
      initRepo(root);
      const completed = runTasks(
        {
          command: 'task',
          harness: 'codex',
          repo: root,
          project: 'api',
          tasks: ['TASK-004'],
          dryRun: false,
        },
        {
          pluginRoot: PLUGIN_ROOT,
          log: () => {},
          resolveProject() {
            return { projectName: 'api', projectRoot: root, specsDir: path.join(root, 'specs') };
          },
          invokePhase(input) {
            calls.push(input);
            assert.strictEqual(input.env.GROUNDWORK_PROJECT, 'api');
            assert.strictEqual(input.env.GROUNDWORK_PROJECT_ROOT, input.projectRoot);
            if (input.phase === 'plan') {
              write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            }
            if (input.phase === 'implement') {
              git(root, 'worktree', 'add', '-b', 'task/TASK-004', worktree);
              const taskFile = path.join(worktree, 'specs', 'tasks.md');
              fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
              write(path.join(worktree, 'feature.txt'), 'implemented\n');
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', 'Implement TASK-004');
              return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
            }
            if (input.phase === 'validate') {
              return validated(worktree);
            }
            return finalizeMock(root, worktree, 'TASK-004', 'task/TASK-004', 'main');
          },
        }
      );

      assert.deepStrictEqual(calls.map((call) => call.phase), ['plan', 'implement', 'validate', 'finalize']);
      const realRoot = fs.realpathSync(root);
      const realWorktree = path.join(realRoot, '.worktrees', 'TASK-004');
      assert.deepStrictEqual(calls.map((call) => call.cwd), [realRoot, realRoot, realWorktree, realWorktree]);
      assert.ok(calls[0].prompt.includes('groundwork-plan-task'));
      assert.ok(calls[1].prompt.includes('groundwork-implement-task'));
      assert.ok(calls[1].prompt.includes(path.join(realRoot, '.worktrees', 'TASK-004')));
      assert.ok(calls[2].prompt.includes('groundwork-validate'));
      assert.ok(calls[3].prompt.includes('groundwork-finalize-task'));
      assert.ok(calls.every((call) => call.prompt.includes('--project api')));
      assert.deepStrictEqual(completed, [{
        taskId: 'TASK-004',
        validation: { iterations: 1, fixed: 0, unworked: 0 },
      }]);
      assert.ok(fs.existsSync(path.join(root, 'feature.txt')));
      assert.ok(fs.readFileSync(path.join(root, 'specs', 'tasks.md'), 'utf8').includes('**Status:** Complete'));
      assert.strictEqual(git(root, 'status', '--porcelain'), '');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('revalidates in another fresh process when finalization integrates a moved base', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-revalidate-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    const phases = [];
    const validationBases = [];
    let finalizeCalls = 0;
    let movedBase;
    try {
      initRepo(root);
      runTasks(
        {
          command: 'task',
          harness: 'claude',
          repo: root,
          project: null,
          tasks: ['TASK-004'],
          dryRun: false,
        },
        {
          pluginRoot: PLUGIN_ROOT,
          log: () => {},
          beforePhase(input) {
            if (input.phase === 'finalize' && !movedBase) {
              write(path.join(root, 'base-update.txt'), 'new base\n');
              git(root, 'add', '.');
              git(root, 'commit', '-m', 'Advance base');
              movedBase = git(root, 'rev-parse', 'HEAD');
            }
          },
          invokePhase(input) {
            phases.push(input.phase);
            if (input.phase === 'plan') {
              write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            }
            if (input.phase === 'implement') {
              git(root, 'worktree', 'add', '-b', 'task/TASK-004', worktree);
              const taskFile = path.join(worktree, 'specs', 'tasks.md');
              fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
              write(path.join(worktree, 'feature.txt'), 'implemented\n');
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', 'Implement TASK-004');
              return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
            }
            if (input.phase === 'validate') {
              validationBases.push(input.baseSha);
              return validated(worktree);
            }
            finalizeCalls++;
            if (finalizeCalls === 1) {
              git(worktree, 'merge', 'main', '-m', 'Integrate updated base');
              return `RESULT: REVALIDATE | task_head=${git(worktree, 'rev-parse', 'HEAD')} | base_head=${git(root, 'rev-parse', 'main')} | reason=base advanced`;
            }
            return finalizeMock(root, worktree, 'TASK-004', 'task/TASK-004', 'main');
          },
        }
      );
      assert.deepStrictEqual(phases, ['plan', 'implement', 'validate', 'finalize', 'validate', 'finalize']);
      assert.strictEqual(validationBases[1], movedBase);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('uses the selected project inside the task worktree for monorepo validation and finalization', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-monorepo-context-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    const taskProject = path.join(worktree, 'apps', 'api');
    const calls = [];
    try {
      git(root, 'init', '-b', 'main');
      git(root, 'config', 'user.email', 'test@example.com');
      git(root, 'config', 'user.name', 'Test User');
      write(path.join(root, '.groundwork.yml'), 'version: 1\nprojects:\n  api:\n    path: apps/api\n');
      write(path.join(root, 'apps', 'api', 'specs', 'tasks.md'), '### TASK-004: Four\n**Status:** Not Started\n**Blocked by:** None\n');
      write(path.join(root, '.gitignore'), '.worktrees/\n.groundwork-plans/\n');
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'base');

      runTasks(
        {
          command: 'task',
          harness: 'codex',
          repo: root,
          project: 'api',
          tasks: ['TASK-004'],
          dryRun: false,
        },
        {
          pluginRoot: PLUGIN_ROOT,
          log: () => {},
          invokePhase(input) {
            calls.push(input);
            if (input.phase === 'plan') {
              write(path.join(root, 'apps', 'api', '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
              return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
            }
            if (input.phase === 'implement') {
              git(root, 'worktree', 'add', '-b', 'task/TASK-004', worktree);
              const taskFile = path.join(taskProject, 'specs', 'tasks.md');
              fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
              write(path.join(taskProject, 'feature.txt'), 'implemented\n');
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', 'Implement TASK-004');
              return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
            }
            if (input.phase === 'validate') return validated(worktree);
            return finalizeMock(root, worktree, 'TASK-004', 'task/TASK-004', 'main', taskProject);
          },
        }
      );

      const validateCall = calls.find((call) => call.phase === 'validate');
      const finalizeCall = calls.find((call) => call.phase === 'finalize');
      const expectedTaskProject = path.join(fs.realpathSync(root), '.worktrees', 'TASK-004', 'apps', 'api');
      assert.strictEqual(validateCall.cwd, expectedTaskProject);
      assert.strictEqual(finalizeCall.cwd, expectedTaskProject);
      assert.strictEqual(validateCall.env.GROUNDWORK_PROJECT_ROOT, validateCall.cwd);
      assert.strictEqual(finalizeCall.env.GROUNDWORK_PROJECT_ROOT, finalizeCall.cwd);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('preserves the worktree when finalization fails', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-preserve-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          {
            command: 'task',
            harness: 'codex',
            repo: root,
            project: null,
            tasks: ['TASK-004'],
            dryRun: false,
          },
          {
            pluginRoot: PLUGIN_ROOT,
            log: () => {},
            invokePhase(input) {
              if (input.phase === 'plan') {
                write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
                return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
              }
              if (input.phase === 'implement') {
                git(root, 'worktree', 'add', '-b', 'task/TASK-004', worktree);
                write(path.join(worktree, 'feature.txt'), 'implemented\n');
                git(worktree, 'add', '.');
                git(worktree, 'commit', '-m', 'Implement TASK-004');
                return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
              }
              if (input.phase === 'validate') return validated(worktree);
              return 'RESULT: FAILURE | merge conflict needs judgment';
            },
          }
        ),
        /merge conflict needs judgment[\s\S]*Worktree preserved/
      );
      assert.ok(fs.existsSync(worktree));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects a false READY receipt when task bookkeeping did not occur', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-false-finalized-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          {
            command: 'task',
            harness: 'codex',
            repo: root,
            project: null,
            tasks: ['TASK-004'],
            dryRun: false,
          },
          {
            pluginRoot: PLUGIN_ROOT,
            log: () => {},
            invokePhase(input) {
              if (input.phase === 'plan') {
                write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
                return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
              }
              if (input.phase === 'implement') {
                git(root, 'worktree', 'add', '-b', 'task/TASK-004', worktree);
                write(path.join(worktree, 'feature.txt'), 'implemented\n');
                git(worktree, 'add', '.');
                git(worktree, 'commit', '-m', 'Implement TASK-004');
                return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
              }
              if (input.phase === 'validate') return validated(worktree);
              return `RESULT: READY_TO_MERGE | task_id=TASK-004 | task_head=${git(worktree, 'rev-parse', 'HEAD')} | base_head=${git(root, 'rev-parse', 'HEAD')} | merge_message=Merge TASK-004`;
            },
          }
        ),
        /did not make only the required/
      );
      assert.ok(fs.existsSync(worktree));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects post-validation code before merging or cleaning up', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-unvalidated-finalize-'));
    const worktree = path.join(root, '.worktrees', 'TASK-004');
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          { command: 'task', harness: 'codex', repo: root, project: null, tasks: ['TASK-004'], dryRun: false },
          {
            pluginRoot: PLUGIN_ROOT,
            log: () => {},
            invokePhase(input) {
              if (input.phase === 'plan') {
                write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
                return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
              }
              if (input.phase === 'implement') {
                git(root, 'worktree', 'add', '-b', 'task/TASK-004', worktree);
                const taskFile = path.join(worktree, 'specs', 'tasks.md');
                fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
                write(path.join(worktree, 'feature.txt'), 'implemented\n');
                git(worktree, 'add', '.');
                git(worktree, 'commit', '-m', 'Implement TASK-004');
                return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/TASK-004 | base_branch=main`;
              }
              if (input.phase === 'validate') return validated(worktree);
              completeTaskFile(worktree, 'TASK-004');
              write(path.join(worktree, 'unvalidated-code.js'), 'malicious();\n');
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', 'Unvalidated final changes');
              const taskHead = git(worktree, 'rev-parse', 'HEAD');
              return `RESULT: READY_TO_MERGE | task_id=TASK-004 | task_head=${taskHead} | base_head=${git(root, 'rev-parse', 'HEAD')} | merge_message=Merge TASK-004`;
            },
          }
        ),
        /changed non-bookkeeping paths/
      );
      assert.ok(fs.existsSync(worktree));
      assert.ok(!fs.existsSync(path.join(root, 'unvalidated-code.js')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('all runs dependent tasks sequentially from each newly merged base', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-all-'));
    const phases = [];
    const implementationBases = [];
    try {
      git(root, 'init', '-b', 'main');
      git(root, 'config', 'user.email', 'test@example.com');
      git(root, 'config', 'user.name', 'Test User');
      write(path.join(root, 'specs', 'tasks.md'),
        '### TASK-001: One\n**Status:** Not Started\n**Blocked by:** None\n\n' +
        '### TASK-002: Two\n**Status:** Not Started\n**Blocked by:** TASK-001\n');
      write(path.join(root, '.gitignore'), '.worktrees/\n.groundwork-plans/\n');
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'base');

      runTasks(
        {
          command: 'all',
          harness: 'codex',
          repo: root,
          project: null,
          tasks: [],
          dryRun: false,
        },
        {
          pluginRoot: PLUGIN_ROOT,
          log: () => {},
          invokePhase(input) {
            phases.push(`${input.taskId}:${input.phase}`);
            const worktree = path.join(root, '.worktrees', input.taskId);
            const branch = `task/${input.taskId}`;
            if (input.phase === 'plan') {
              write(path.join(root, '.groundwork-plans', `${input.taskId}-plan.md`), '# Plan\n');
              return `RESULT: PLANNED | plan_file_path=.groundwork-plans/${input.taskId}-plan.md | identifier=${input.taskId} | branch_prefix=task`;
            }
            if (input.phase === 'implement') {
              implementationBases.push(git(root, 'rev-parse', 'HEAD'));
              git(root, 'worktree', 'add', '-b', branch, worktree);
              const taskFile = path.join(worktree, 'specs', 'tasks.md');
              fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('**Status:** Not Started', '**Status:** In Progress'));
              write(path.join(worktree, `${input.taskId}.txt`), 'implemented\n');
              git(worktree, 'add', '.');
              git(worktree, 'commit', '-m', `Implement ${input.taskId}`);
              return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=${branch} | base_branch=main`;
            }
            if (input.phase === 'validate') return validated(worktree);
            return finalizeMock(root, worktree, input.taskId, branch, 'main');
          },
        }
      );

      assert.deepStrictEqual(phases, [
        'TASK-001:plan', 'TASK-001:implement', 'TASK-001:validate', 'TASK-001:finalize',
        'TASK-002:plan', 'TASK-002:implement', 'TASK-002:validate', 'TASK-002:finalize',
      ]);
      assert.notStrictEqual(implementationBases[0], implementationBases[1]);
      const catalog = require(RUNNER).parseTaskCatalog(fs.readFileSync(path.join(root, 'specs', 'tasks.md'), 'utf8'));
      assert.strictEqual(catalog.get('TASK-001').status, 'Complete');
      assert.strictEqual(catalog.get('TASK-002').status, 'Complete');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('all stops before starting a later task after a failure', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-all-stop-'));
    const tasksSeen = [];
    try {
      git(root, 'init', '-b', 'main');
      git(root, 'config', 'user.email', 'test@example.com');
      git(root, 'config', 'user.name', 'Test User');
      write(path.join(root, 'specs', 'tasks.md'),
        '### TASK-001: One\n**Status:** Not Started\n**Blocked by:** None\n\n' +
        '### TASK-002: Two\n**Status:** Not Started\n**Blocked by:** TASK-001\n');
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'base');
      assert.throws(
        () => runTasks(
          { command: 'all', harness: 'codex', repo: root, project: null, tasks: [], dryRun: false },
          {
            pluginRoot: PLUGIN_ROOT,
            log: () => {},
            invokePhase(input) {
              tasksSeen.push(input.taskId);
              return 'RESULT: FAILURE | planning blocked';
            },
          }
        ),
        /planning blocked/
      );
      assert.deepStrictEqual(tasksSeen, ['TASK-001']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects an implementation receipt for an unexpected branch or worktree', () => {
    const { runTasks } = require(RUNNER);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-wrong-worktree-'));
    const worktree = path.join(root, '.worktrees', 'wrong');
    try {
      initRepo(root);
      assert.throws(
        () => runTasks(
          {
            command: 'task',
            harness: 'codex',
            repo: root,
            project: null,
            tasks: ['TASK-004'],
            dryRun: false,
          },
          {
            pluginRoot: PLUGIN_ROOT,
            log: () => {},
            invokePhase(input) {
              if (input.phase === 'plan') {
                write(path.join(root, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
                return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
              }
              git(root, 'worktree', 'add', '-b', 'task/wrong', worktree);
              return `RESULT: IMPLEMENTED | worktree_path=${worktree} | branch=task/wrong | base_branch=main`;
            },
          }
        ),
        /refs outside refs\/heads\/task\/TASK-004|expected branch task\/TASK-004/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('skill and export integration', () => {
  test('restores just-do-it as the original in-session workflow', () => {
    const skill = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', 'just-do-it', 'SKILL.md'), 'utf8');
    assert.ok(skill.includes('#### Phase A: Plan'));
    assert.ok(skill.includes('#### Phase C: Validate'));
    assert.ok(!skill.includes('groundwork-run.js'));
  });

  test('finalize-task has the same chain/dual visibility as validate', () => {
    const finalize = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', 'finalize-task', 'SKILL.md'), 'utf8');
    const frontmatter = finalize.split('---')[1];
    assert.ok(!frontmatter.includes('disable-model-invocation: true'));
    assert.ok(!frontmatter.includes('user-invocable: false'));
    assert.ok(finalize.includes('RESULT: FINALIZED'));
    assert.ok(finalize.includes('RESULT: REVALIDATE'));
  });

  test('all four phase skills accept an explicit optional project', () => {
    for (const name of ['plan-task', 'implement-task', 'validate', 'finalize-task']) {
      const skill = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', name, 'SKILL.md'), 'utf8');
      assert.ok(skill.includes('--project'), `${name} does not document --project`);
    }
  });

  test('runner mode prevents task-executor memory reuse and fixes the worktree path', () => {
    const implement = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', 'implement-task', 'SKILL.md'), 'utf8');
    const executor = fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', 'task-executor', 'AGENT.md'), 'utf8');
    assert.ok(implement.includes('WORKTREE PATH: [runner-supplied absolute worktree path]'));
    assert.ok(executor.includes('skip reading and writing agent memory'));
    assert.ok(executor.includes('use that exact registered path'));
  });

  test('Codex export installs the standalone runner outside any skill directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-install-'));
    try {
      execFileSync(
        'bash',
        [path.join(PLUGIN_ROOT, 'install-skills.sh'), '--codex', '--project', '--force', '--source', PLUGIN_ROOT],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
      const installedRunner = path.join(root, '.codex', 'groundwork-run.js');
      assert.ok(fs.existsSync(installedRunner), 'standalone Codex runner was not installed');
      assert.ok(!fs.existsSync(path.join(root, '.codex', 'skills', 'groundwork-just-do-it', 'scripts', 'groundwork-run.js')));
      assert.strictEqual(fs.readFileSync(installedRunner, 'utf8'), fs.readFileSync(RUNNER, 'utf8'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Codex export refuses a symlinked standalone runner destination', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-install-link-'));
    const external = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gw-run-install-external-')), 'runner.js');
    try {
      write(external, 'sentinel\n');
      fs.mkdirSync(path.join(root, '.codex'), { recursive: true });
      fs.symlinkSync(external, path.join(root, '.codex', 'groundwork-run.js'));
      assert.throws(
        () => execFileSync(
          'bash',
          [path.join(PLUGIN_ROOT, 'install-skills.sh'), '--codex', '--project', '--force', '--source', PLUGIN_ROOT],
          { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        ),
        /Command failed/
      );
      assert.strictEqual(fs.readFileSync(external, 'utf8'), 'sentinel\n');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(path.dirname(external), { recursive: true, force: true });
    }
  });
});

process.on('exit', () => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
});
