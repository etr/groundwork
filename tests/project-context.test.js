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
const LIB = path.join(PLUGIN_ROOT, 'lib', 'project-context.js');
const DETECT = path.join(PLUGIN_ROOT, 'lib', 'detect-project-state.js');
const PIN_HOOK = path.join(PLUGIN_ROOT, 'hooks', 'pin-session-selection.sh');

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

// Monorepo with several named projects (entries: [name, relative path]).
function makeMultiMonorepo(...entries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-context-'));
  const lines = ['version: 1', 'projects:'];
  const paths = {};
  for (const [name, rel] of entries) {
    fs.mkdirSync(path.join(root, rel, 'specs'), { recursive: true });
    lines.push(`  ${name}:`, `    path: ${rel}`);
    paths[name] = path.join(root, rel);
  }
  lines.push('');
  fs.writeFileSync(path.join(root, '.groundwork.yml'), lines.join('\n'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  return { root, paths };
}

// Shim `ps` so getPaneKey()'s TTY walk is deterministic: the shim answers
// every query with the given TTY string ('??' = macOS no-terminal marker).
function psShim(dir, ttyOutput) {
  const bin = path.join(dir, 'shim-bin');
  fs.mkdirSync(bin, { recursive: true });
  const shim = path.join(bin, 'ps');
  fs.writeFileSync(shim, `#!/bin/sh\necho '${ttyOutput}'\n`);
  fs.chmodSync(shim, 0o755);
  return bin;
}

// Run a node -e snippet against the lib and parse its JSON output.
function nodeJson(cwd, env, code, args = []) {
  return JSON.parse(execFileSync('node', ['-e', code, ...args], {
    cwd, env, encoding: 'utf8',
  }));
}

function cleanEnv(home) {
  const env = { ...process.env, HOME: home };
  for (const name of [
    'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'OPENCODE_CONFIG_DIR',
    'XDG_CONFIG_HOME', 'KIRO_HOME', 'PI_HOME', 'TMUX', 'TMUX_PANE',
    'TERM_SESSION_ID', 'CODEX_THREAD_ID', 'GROUNDWORK_SESSION_ID',
    'CLAUDE_SESSION_ID', 'GROUNDWORK_HARNESS'
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
        assert.strictEqual(selected.plans_dir, 'apps/web/.groundwork-plans');
        assert.ok(selected.state_file.startsWith(path.join(override, 'groundwork-state')));
        assert.ok(fs.existsSync(selected.state_file));

        const resolved = runCli(repo, env, 'resolve', '--harness', harness);
        assert.strictEqual(resolved.selection_required, false);
        assert.strictEqual(resolved.project_name, 'web');
        assert.strictEqual(resolved.project_root, 'apps/web');
        assert.strictEqual(resolved.specs_dir, 'apps/web/specs');
        assert.strictEqual(resolved.plans_dir, 'apps/web/.groundwork-plans');
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

  test('Codex selection survives cwd changes within the same tmux pane', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const env = cleanEnv(home);
    env.TMUX = '/tmp/tmux-test/default,123,0';
    env.TMUX_PANE = '%1';

    try {
      const selected = runCli(repo, env, 'select', 'web', '--harness', 'codex');
      const resolved = runCli(
        path.join(repo, 'apps', 'web'),
        env,
        'resolve',
        '--harness',
        'codex'
      );

      assert.strictEqual(resolved.selection_required, false);
      assert.strictEqual(resolved.project_name, 'web');
      assert.strictEqual(resolved.project_root, 'apps/web');
      assert.strictEqual(resolved.state_file, selected.state_file);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('Codex selections do not cross tmux panes', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const firstPane = cleanEnv(home);
    firstPane.TMUX = '/tmp/tmux-test/default,123,0';
    firstPane.TMUX_PANE = '%1';
    const secondPane = { ...firstPane, TMUX_PANE: '%2' };

    try {
      const selected = runCli(repo, firstPane, 'select', 'web', '--harness', 'codex');
      const resolved = runCli(repo, secondPane, 'resolve', '--harness', 'codex');

      assert.strictEqual(resolved.selection_required, true);
      assert.strictEqual(resolved.project_name, '');
      assert.notStrictEqual(resolved.state_file, selected.state_file);
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
        plans_dir: resolved.plans_dir,
        selection_required: resolved.selection_required,
      }, {
        harness: 'codex',
        project_name: '',
        project_root: '.',
        specs_dir: 'specs',
        plans_dir: '.groundwork-plans',
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

describe('selection scope capability gating (pane-less harnesses)', () => {
  const IDENTITY = `const pc = require(${JSON.stringify(LIB)}); console.log(JSON.stringify({ key: pc.getPaneKey(), pane: pc.hasPaneIdentity() }))`;

  function restoreSnippet(sid) {
    return `const pc = require(${JSON.stringify(LIB)}); console.log(JSON.stringify(pc.restoreSelection(${JSON.stringify(sid)})))`;
  }

  function pinSnippet(sid, name, projectPath) {
    return `const pc = require(${JSON.stringify(LIB)}); pc.persistSessionSelection(${JSON.stringify(sid)}, ${JSON.stringify(name)}, ${JSON.stringify(projectPath)})`;
  }

  test('BSD ?? marker is rejected and degrades to a repo-scoped key without pane identity', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const env = cleanEnv(home);
    env.PATH = `${psShim(repo, '??')}${path.delimiter}${env.PATH}`;

    try {
      const identity = nodeJson(repo, env, IDENTITY);
      assert.strictEqual(identity.pane, false);
      assert.ok(identity.key.startsWith('repo-'), `unexpected key ${identity.key}`);
      assert.ok(!identity.key.startsWith('??'), 'literal ?? must never be a pane key');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('degraded pane key is invariant across cwds inside the repository', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const env = cleanEnv(home);
    env.PATH = `${psShim(repo, '??')}${path.delimiter}${env.PATH}`;

    try {
      // The degraded key must hash the repository root, not process.cwd():
      // a selection made at the repo root and a skill invocation from a
      // project subdirectory have to land on the same workspace-default key.
      const fromRoot = nodeJson(repo, env, IDENTITY);
      const fromProject = nodeJson(path.join(repo, 'apps', 'web'), env, IDENTITY);
      assert.strictEqual(fromRoot.pane, false);
      assert.strictEqual(fromProject.pane, false);
      assert.ok(fromRoot.key.startsWith('repo-'), `unexpected key ${fromRoot.key}`);
      assert.strictEqual(
        fromRoot.key,
        fromProject.key,
        `degraded key must hash the repo root, not the cwd (${fromRoot.key} vs ${fromProject.key})`
      );
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('a real TTY still provides pane identity', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const env = cleanEnv(home);
    env.PATH = `${psShim(repo, 'ttys005')}${path.delimiter}${env.PATH}`;

    try {
      const identity = nodeJson(repo, env, IDENTITY);
      assert.strictEqual(identity.pane, true);
      assert.strictEqual(identity.key, 'ttys005');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('tmux identity provides pane identity', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const env = cleanEnv(home);
    env.TMUX = '/tmp/tmux-test/default,123,0';
    env.TMUX_PANE = '%1';

    try {
      const identity = nodeJson(repo, env, IDENTITY);
      assert.strictEqual(identity.pane, true);
      assert.ok(identity.key.startsWith('tmux-'));
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('degraded restore labels the shared pane state as a workspace default', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const env = cleanEnv(home);
    env.PATH = `${psShim(repo, '??')}${path.delimiter}${env.PATH}`;
    env.GROUNDWORK_HARNESS = 'codex';

    try {
      runCli(repo, env, 'select', 'web', '--harness', 'codex');
      const restored = nodeJson(repo, env, restoreSnippet(null));
      assert.strictEqual(restored.projectName, 'web');
      assert.strictEqual(restored.source, 'workspace-default');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('per-chat snapshot survives newer foreign pane writes (two-chat isolation)', () => {
    const { root: repo, paths } = makeMultiMonorepo(['web', 'apps/web'], ['api', 'services/api']);
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const env = cleanEnv(home);
    env.PATH = `${psShim(repo, '??')}${path.delimiter}${env.PATH}`;
    env.GROUNDWORK_HARNESS = 'codex';

    try {
      // Chat A selects web and its hook pins the per-chat snapshot.
      runCli(repo, env, 'select', 'web', '--harness', 'codex');
      execFileSync('node', ['-e', pinSnippet('chat-a', 'web', paths.web)], { cwd: repo, env });

      // Chat B rewrites the shared pane state to api afterwards.
      runCli(repo, env, 'select', 'api', '--harness', 'codex');

      // Chat A keeps its own selection; chat B falls through to the default.
      const chatA = nodeJson(repo, env, restoreSnippet('chat-a'));
      assert.strictEqual(chatA.projectName, 'web');
      assert.strictEqual(chatA.source, 'session');

      const chatB = nodeJson(repo, env, restoreSnippet('chat-b'));
      assert.strictEqual(chatB.projectName, 'api');
      assert.strictEqual(chatB.source, 'workspace-default');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('PostToolUse hook adopts an in-chat selection into the session snapshot', () => {
    const { root: repo, paths } = makeMultiMonorepo(['web', 'apps/web'], ['api', 'services/api']);
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const env = cleanEnv(home);
    env.PATH = `${psShim(repo, '??')}${path.delimiter}${env.PATH}`;
    env.GROUNDWORK_HARNESS = 'codex';

    try {
      runCli(repo, env, 'select', 'web', '--harness', 'codex');
      execFileSync('node', ['-e', pinSnippet('chat-a', 'web', paths.web)], { cwd: repo, env });

      // The chat switches to api; the PostToolUse hook fires for this
      // session's persist command and must adopt the new selection.
      runCli(repo, env, 'select', 'api', '--harness', 'codex');
      const adopted = spawnSync('bash', [PIN_HOOK], {
        cwd: repo,
        env,
        input: JSON.stringify({
          session_id: 'chat-a',
          tool_input: { command: `node ${CLI} select api --harness codex` },
        }),
        encoding: 'utf8',
      });
      assert.strictEqual(adopted.status, 0, adopted.stderr);

      const restored = nodeJson(repo, env, restoreSnippet('chat-a'));
      assert.strictEqual(restored.projectName, 'api');
      assert.strictEqual(restored.source, 'session');

      // The command gate leaves unrelated Bash commands (and failures) alone:
      // a foreign command must not overwrite the snapshot with stale pane data.
      const untouched = spawnSync('bash', [PIN_HOOK], {
        cwd: repo,
        env,
        input: JSON.stringify({
          session_id: 'chat-a',
          tool_input: { command: 'git status --short' },
        }),
        encoding: 'utf8',
      });
      assert.strictEqual(untouched.status, 0, untouched.stderr);
      const after = nodeJson(repo, env, restoreSnippet('chat-a'));
      assert.strictEqual(after.projectName, 'api');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('PostToolUse hook adopts the selection when the session id arrives via CLAUDE_SESSION_ID', () => {
    const { root: repo, paths } = makeMultiMonorepo(['web', 'apps/web'], ['api', 'services/api']);
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const env = cleanEnv(home);
    env.PATH = `${psShim(repo, '??')}${path.delimiter}${env.PATH}`;
    env.GROUNDWORK_HARNESS = 'codex';

    try {
      // This chat selects web; the pane file records the shared selection.
      runCli(repo, env, 'select', 'web', '--harness', 'codex');

      // ZCode delivers the session id as a hook environment variable instead
      // of stdin JSON: the hook must still scope the adopted snapshot to the
      // right chat through the CLAUDE_SESSION_ID fallback.
      const adopted = spawnSync('bash', [PIN_HOOK], {
        cwd: repo,
        env: { ...env, CLAUDE_SESSION_ID: 'chat-env' },
        input: JSON.stringify({
          tool_input: { command: `node ${CLI} select web --harness codex` },
        }),
        encoding: 'utf8',
      });
      assert.strictEqual(adopted.status, 0, adopted.stderr);

      const restored = nodeJson(repo, env, restoreSnippet('chat-env'));
      assert.strictEqual(restored.projectName, 'web');
      assert.strictEqual(restored.source, 'session');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('real pane identity ignores session snapshots', () => {
    const { root: repo, paths } = makeMultiMonorepo(['web', 'apps/web'], ['api', 'services/api']);
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const env = cleanEnv(home);
    env.TMUX = '/tmp/tmux-test/default,123,0';
    env.TMUX_PANE = '%1';
    env.GROUNDWORK_HARNESS = 'codex';

    try {
      runCli(repo, env, 'select', 'web', '--harness', 'codex');
      execFileSync('node', ['-e', pinSnippet('s1', 'api', paths.api)], { cwd: repo, env });

      const restored = nodeJson(repo, env, restoreSnippet('s1'));
      assert.strictEqual(restored.projectName, 'web');
      assert.strictEqual(restored.source, 'pane');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('legacy ?? pane state migrates under the degraded repo key', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const codexHome = path.join(repo, 'codex-home');
    fs.mkdirSync(codexHome);
    const env = cleanEnv(home);
    env.CODEX_HOME = codexHome;
    env.PATH = `${psShim(repo, '??')}${path.delimiter}${env.PATH}`;

    try {
      // Simulate the pre-fix state: a pane file under the literal ?? key.
      const panesDir = path.join(codexHome, 'groundwork-state', 'panes');
      fs.mkdirSync(panesDir, { recursive: true });
      // git resolves macOS symlinked temp dirs (/tmp → /private/tmp), so the
      // repo slug the lib computes is based on the resolved path.
      const repoSlug = fs.realpathSync(repo).replace(/\//g, '_');
      fs.writeFileSync(
        path.join(panesDir, `??__${repoSlug}.json`),
        JSON.stringify({
          project: 'web',
          root: path.join(repo, 'apps', 'web'),
          repoRoot: repo,
          paneKey: '??',
          timestamp: Math.floor(Date.now() / 1000) - 60,
          sessionId: null,
        })
      );

      const restored = nodeJson(repo, env, restoreSnippet(null));
      assert.strictEqual(restored.projectName, 'web');
      assert.strictEqual(restored.source, 'workspace-default');

      // The migration re-pins the selection under the new degraded key.
      const files = fs.readdirSync(panesDir);
      assert.ok(files.some(f => f.startsWith('repo-')), `expected migrated pane file, got ${files}`);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('.groundwork.local selection migrates under the degraded repo key', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const codexHome = path.join(repo, 'codex-home');
    fs.mkdirSync(codexHome);
    const env = cleanEnv(home);
    env.CODEX_HOME = codexHome;
    env.PATH = `${psShim(repo, '??')}${path.delimiter}${env.PATH}`;

    try {
      // Pre-pane-era state: only the legacy .groundwork.local marker at the
      // repo root records the selection — no pane or snapshot state exists.
      fs.writeFileSync(path.join(repo, '.groundwork.local'), 'web');

      const restored = nodeJson(repo, env, restoreSnippet(null));
      assert.strictEqual(restored.projectName, 'web');
      // git resolves macOS symlinked temp dirs (/tmp → /private/tmp), so the
      // lib resolves the configured project path from the resolved repo root.
      assert.strictEqual(restored.projectPath, path.join(fs.realpathSync(repo), 'apps', 'web'));
      assert.strictEqual(restored.source, 'migration');

      // The migration seeds the pane state file under the degraded repo key.
      const panesDir = path.join(codexHome, 'groundwork-state', 'panes');
      const files = fs.readdirSync(panesDir);
      const seeded = files.find(f => f.startsWith('repo-'));
      assert.ok(seeded, `expected seeded pane file, got ${files}`);
      const data = JSON.parse(fs.readFileSync(path.join(panesDir, seeded), 'utf8'));
      assert.strictEqual(data.project, 'web');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('detect-project-state reports the selection source and pins the snapshot', () => {
    const repo = makeMonorepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const env = cleanEnv(home);
    env.PATH = `${psShim(repo, '??')}${path.delimiter}${env.PATH}`;
    env.GROUNDWORK_HARNESS = 'codex';

    try {
      runCli(repo, env, 'select', 'web', '--harness', 'codex');

      const first = JSON.parse(execFileSync('node', [DETECT], {
        cwd: repo,
        env: { ...env, GROUNDWORK_SESSION_ID: 'chat-a' },
        encoding: 'utf8',
      }));
      assert.strictEqual(first.projectName, 'web');
      assert.strictEqual(first.selectionSource, 'workspace-default');

      // The first observation pinned the per-chat snapshot: a later restore
      // in the same session is per-chat, not a shared assumption.
      const second = JSON.parse(execFileSync('node', [DETECT], {
        cwd: repo,
        env: { ...env, GROUNDWORK_SESSION_ID: 'chat-a' },
        encoding: 'utf8',
      }));
      assert.strictEqual(second.projectName, 'web');
      assert.strictEqual(second.selectionSource, 'session');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('cleanupStalePanes prunes stale chat snapshots alongside pane files', () => {
    const { root: repo, paths } = makeMultiMonorepo(['web', 'apps/web'], ['api', 'services/api']);
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);
    const env = cleanEnv(home);
    env.PATH = `${psShim(repo, '??')}${path.delimiter}${env.PATH}`;
    env.GROUNDWORK_HARNESS = 'codex';

    try {
      execFileSync('node', ['-e', pinSnippet('old-chat', 'web', paths.web)], { cwd: repo, env });
      execFileSync('node', ['-e', pinSnippet('fresh-chat', 'api', paths.api)], { cwd: repo, env });

      const snapshotsDir = path.join(home, '.codex', 'groundwork-state', 'chat-snapshots');
      const oldFile = path.join(snapshotsDir, fs.readdirSync(snapshotsDir).find(f => f.startsWith('old-chat')));
      const stale = JSON.parse(fs.readFileSync(oldFile, 'utf8'));
      stale.timestamp = Math.floor(Date.now() / 1000) - 31 * 86400;
      fs.writeFileSync(oldFile, JSON.stringify(stale));

      nodeJson(repo, env, `const pc = require(${JSON.stringify(LIB)}); pc.cleanupStalePanes(); console.log('{}')`);

      const remaining = fs.readdirSync(snapshotsDir);
      assert.ok(remaining.some(f => f.startsWith('fresh-chat')), 'fresh snapshot must survive');
      assert.ok(!remaining.some(f => f.startsWith('old-chat')), 'stale snapshot must be pruned');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
