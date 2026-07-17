/**
 * Cross-harness project context tests.
 *
 * Run with: node tests/project-context.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(PLUGIN_ROOT, 'lib', 'project-context-cli.js');

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

function makeMonorepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-context-'));
  fs.mkdirSync(path.join(root, 'apps', 'web', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(root, '.groundwork.yml'), [
    'version: 1',
    'projects:',
    '  web:',
    '    path: apps/web',
    '',
  ].join('\n'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

function cleanEnv(home) {
  const env = { ...process.env, HOME: home };
  for (const name of [
    'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'OPENCODE_CONFIG_DIR',
    'XDG_CONFIG_HOME', 'KIRO_HOME', 'PI_HOME', 'TMUX_PANE'
  ]) delete env[name];
  return env;
}

function runCli(repo, env, ...args) {
  return JSON.parse(execFileSync('node', [CLI, ...args], {
    cwd: repo,
    env,
    encoding: 'utf8',
  }));
}

describe('project context CLI', () => {
  const harnessCases = [
    ['claude', 'CLAUDE_CONFIG_DIR', 'claude-config'],
    ['codex', 'CODEX_HOME', 'codex-home'],
    ['opencode', 'OPENCODE_CONFIG_DIR', 'opencode-config'],
    ['kiro', 'KIRO_HOME', 'kiro-home'],
    ['pi', 'PI_HOME', 'pi-home'],
  ];

  for (const [harness, variable, directory] of harnessCases) {
    test(`${harness} honors ${variable} and persists at the reported state file`, () => {
      const repo = makeMonorepo();
      const home = path.join(repo, 'home');
      const override = path.join(repo, directory);
      fs.mkdirSync(home);
      fs.mkdirSync(override);
      const env = cleanEnv(home);
      env[variable] = override;

      try {
        const selected = runCli(repo, env, 'select', 'web', '--harness', harness);
        assert.strictEqual(selected.harness, harness);
        assert.strictEqual(selected.project_name, 'web');
        assert.strictEqual(selected.project_root, 'apps/web');
        assert.strictEqual(selected.specs_dir, 'apps/web/specs');
        assert.ok(selected.state_file.startsWith(path.join(override, 'groundwork-state')));
        assert.ok(fs.existsSync(selected.state_file));

        const resolved = runCli(repo, env, 'resolve', '--harness', harness);
        assert.strictEqual(resolved.selection_required, false);
        assert.strictEqual(resolved.project_name, 'web');
        assert.strictEqual(resolved.project_root, 'apps/web');
        assert.strictEqual(resolved.specs_dir, 'apps/web/specs');
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
    });
  }

  const defaultCases = [
    ['claude', home => path.join(home, '.claude')],
    ['codex', home => path.join(home, '.codex')],
    ['opencode', home => path.join(home, '.config', 'opencode')],
    ['kiro', home => path.join(home, '.kiro')],
    ['pi', home => path.join(home, '.pi', 'agent')],
  ];

  for (const [harness, expectedBase] of defaultCases) {
    test(`${harness} uses its HOME fallback`, () => {
      const repo = makeMonorepo();
      const home = path.join(repo, 'home');
      fs.mkdirSync(home);
      const env = cleanEnv(home);

      try {
        const selected = runCli(repo, env, 'select', 'web', '--harness', harness);
        assert.ok(selected.state_file.startsWith(path.join(expectedBase(home), 'groundwork-state')));
        assert.ok(fs.existsSync(selected.state_file));
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
    });
  }

  test('OpenCode uses XDG_CONFIG_HOME when no explicit config directory is set', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    const xdg = path.join(repo, 'xdg');
    fs.mkdirSync(home);
    fs.mkdirSync(xdg);
    const env = cleanEnv(home);
    env.XDG_CONFIG_HOME = xdg;

    try {
      const selected = runCli(repo, env, 'select', 'web', '--harness', 'opencode');
      assert.ok(selected.state_file.startsWith(path.join(xdg, 'opencode', 'groundwork-state')));
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('harnesses keep selections in isolated state files', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const env = cleanEnv(home);

    try {
      const codex = runCli(repo, env, 'select', 'web', '--harness', 'codex');
      const claude = runCli(repo, env, 'select', 'web', '--harness', 'claude');
      assert.notStrictEqual(codex.state_file, claude.state_file);
      assert.ok(fs.existsSync(codex.state_file));
      assert.ok(fs.existsSync(claude.state_file));
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('resolve without a selection emits complete fallback bindings', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);

    try {
      const resolved = runCli(repo, cleanEnv(home), 'resolve', '--harness', 'codex');
      assert.deepStrictEqual({
        harness: resolved.harness,
        project_name: resolved.project_name,
        project_root: resolved.project_root,
        specs_dir: resolved.specs_dir,
        selection_required: resolved.selection_required,
      }, {
        harness: 'codex',
        project_name: '',
        project_root: '.',
        specs_dir: 'specs',
        selection_required: true,
      });
      assert.ok(resolved.state_file.startsWith(path.join(home, '.codex', 'groundwork-state')));
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  const cliErrorCases = [
    ['rejects an unknown project', ['select', 'unknown', '--harness', 'codex'], 'not found'],
    ['rejects a missing project name', ['select', '--harness', 'codex'], 'Project name is required'],
    ['rejects a missing harness', ['resolve'], '--harness is required'],
    ['rejects an unknown command', ['bogus', '--harness', 'codex'], 'Usage:'],
    ['rejects an unsupported harness', ['resolve', '--harness', 'unknown'], 'Unsupported harness'],
  ];

  for (const [name, args, message] of cliErrorCases) {
    test(name, () => {
      const repo = makeMonorepo();
      const home = path.join(repo, 'home');
      fs.mkdirSync(home);

      try {
        const result = spawnSync('node', [CLI, ...args], {
          cwd: repo, env: cleanEnv(home), encoding: 'utf8',
        });
        assert.notStrictEqual(result.status, 0);
        assert.ok(result.stderr.includes(message), result.stderr);
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
    });
  }

  test('select fails when the harness state cannot be persisted', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    const codexHome = path.join(repo, 'codex-home');
    fs.mkdirSync(home);
    fs.writeFileSync(codexHome, 'not a directory');
    const env = cleanEnv(home);
    env.CODEX_HOME = codexHome;

    try {
      const result = spawnSync(
        'node', [CLI, 'select', 'web', '--harness', 'codex'],
        { cwd: repo, env, encoding: 'utf8' }
      );
      assert.notStrictEqual(result.status, 0);
      assert.strictEqual(result.stdout, '');
      assert.ok(result.stderr.includes('project-context error:'), result.stderr);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('select reuses repository metadata within the CLI process', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    const bin = path.join(repo, 'bin');
    const countFile = path.join(repo, 'git-count');
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    fs.mkdirSync(home);
    fs.mkdirSync(bin);
    const gitShim = path.join(bin, 'git');
    fs.writeFileSync(gitShim, [
      '#!/usr/bin/env node',
      "const fs = require('fs');",
      "const { spawnSync } = require('child_process');",
      "fs.appendFileSync(process.env.GROUNDWORK_GIT_COUNT, '1\\n');",
      `const result = spawnSync(${JSON.stringify(realGit)}, process.argv.slice(2), { stdio: 'inherit' });`,
      'process.exit(result.status === null ? 1 : result.status);',
      '',
    ].join('\n'));
    fs.chmodSync(gitShim, 0o755);
    const env = cleanEnv(home);
    env.GROUNDWORK_GIT_COUNT = countFile;
    env.PATH = `${bin}${path.delimiter}${env.PATH}`;

    try {
      runCli(repo, env, 'select', 'web', '--harness', 'codex');
      const gitCalls = fs.readFileSync(countFile, 'utf8').trim().split('\n').length;
      assert.ok(gitCalls <= 2, `expected at most 2 git calls, received ${gitCalls}`);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('rejects a configured project whose path is missing', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const env = cleanEnv(home);

    try {
      fs.writeFileSync(path.join(repo, '.groundwork.yml'), 'version: 1\nprojects:\n  gone:\n    path: apps/gone\n');
      const result = spawnSync('node', [CLI, 'select', 'gone', '--harness', 'codex'], {
        cwd: repo, env, encoding: 'utf8',
      });
      assert.notStrictEqual(result.status, 0);
      assert.ok(result.stderr.includes('does not exist'), result.stderr);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('rejects a repository without .groundwork.yml', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    fs.unlinkSync(path.join(repo, '.groundwork.yml'));

    try {
      const result = spawnSync('node', [CLI, 'resolve', '--harness', 'codex'], {
        cwd: repo, env: cleanEnv(home), encoding: 'utf8',
      });
      assert.notStrictEqual(result.status, 0);
      assert.ok(result.stderr.includes('No .groundwork.yml found'), result.stderr);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('rejects shell metacharacters in configured project names', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    fs.writeFileSync(path.join(repo, '.groundwork.yml'), [
      'version: 1', 'projects:', '  ;injected:', '    path: apps/web', '',
    ].join('\n'));

    try {
      const result = spawnSync('node', [CLI, 'select', ';injected', '--harness', 'codex'], {
        cwd: repo, env: cleanEnv(home), encoding: 'utf8',
      });
      assert.notStrictEqual(result.status, 0);
      assert.ok(result.stderr.includes('No .groundwork.yml found'), result.stderr);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('rejects configured project paths outside the repository', () => {
    const repo = makeMonorepo();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-outside-'));
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    fs.writeFileSync(path.join(repo, '.groundwork.yml'), [
      'version: 1', 'projects:', '  escaped:', `    path: ${path.relative(repo, outside)}`, '',
    ].join('\n'));

    try {
      const result = spawnSync('node', [CLI, 'select', 'escaped', '--harness', 'codex'], {
        cwd: repo, env: cleanEnv(home), encoding: 'utf8',
      });
      assert.notStrictEqual(result.status, 0);
      assert.ok(result.stderr.includes('outside repository'), result.stderr);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test('ignores persisted state that does not match the current project configuration', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const env = cleanEnv(home);

    try {
      const selected = runCli(repo, env, 'select', 'web', '--harness', 'codex');
      const state = JSON.parse(fs.readFileSync(selected.state_file, 'utf8'));
      state.root = repo;
      fs.writeFileSync(selected.state_file, JSON.stringify(state));
      const resolved = runCli(repo, env, 'resolve', '--harness', 'codex');
      assert.strictEqual(resolved.selection_required, true);
      assert.strictEqual(resolved.project_name, '');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('TMUX_PANE is passed as data and cannot execute command substitutions', () => {
    const repo = makeMonorepo();
    const marker = path.join(repo, 'injected');
    const env = cleanEnv(path.join(repo, 'home'));
    env.TMUX_PANE = `$(touch ${marker})`;

    try {
      execFileSync('node', ['-e', `require(${JSON.stringify(path.join(PLUGIN_ROOT, 'lib', 'project-context.js'))}).getPaneKey()`], {
        cwd: repo, env, encoding: 'utf8',
      });
      assert.strictEqual(fs.existsSync(marker), false);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
