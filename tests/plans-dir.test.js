/**
 * Project-scoped plan directory tests.
 *
 * Plan files live at <project root>/.groundwork-plans/ so overlapping
 * TASK-NNN identifiers across monorepo projects cannot collide.
 *
 * Run with: node tests/plans-dir.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const LIB = path.join(PLUGIN_ROOT, 'lib', 'project-context.js');
const HOOK = path.join(PLUGIN_ROOT, 'lib', 'resolve-template-vars.js');
const SESSION_START = path.join(PLUGIN_ROOT, 'hooks', 'session-start.sh');

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

function makeMonorepo(projects) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-plans-'));
  // realpath: on macOS the tmpdir (/var/folders/...) is a symlink to
  // /private/var/..., and git reports the resolved toplevel — keep both equal.
  const root = fs.realpathSync(tmp);
  for (const project of projects) {
    fs.mkdirSync(path.join(root, ...project.split('/'), 'specs'), { recursive: true });
  }
  fs.writeFileSync(path.join(root, '.groundwork.yml'), [
    'version: 1',
    'projects:',
    ...projects.map((project) => `  ${path.basename(project)}:\n    path: ${project}`),
    '',
  ].join('\n'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

function makeSingleProjectRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-plans-single-'));
  const root = fs.realpathSync(tmp);
  fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

function cleanEnv(home) {
  const env = { ...process.env, HOME: home };
  for (const name of [
    'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'OPENCODE_CONFIG_DIR',
    'XDG_CONFIG_HOME', 'KIRO_HOME', 'PI_HOME', 'TMUX', 'TMUX_PANE',
    'GROUNDWORK_PROJECT', 'GROUNDWORK_PROJECT_ROOT',
  ]) delete env[name];
  return env;
}

function plansDirFor(cwd, env) {
  return execFileSync(
    'node',
    ['-e', `console.log(require(${JSON.stringify(LIB)}).getPlansDir())`],
    { cwd, env, encoding: 'utf8' }
  ).trim();
}

describe('getPlansDir', () => {
  test('resolves inside the selected project when run from the repo root', () => {
    const repo = makeMonorepo(['apps/web', 'apps/api']);
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);

    try {
      const env = cleanEnv(home);
      env.GROUNDWORK_PROJECT_ROOT = path.join(repo, 'apps', 'web');
      assert.strictEqual(plansDirFor(repo, env), 'apps/web/.groundwork-plans');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('distinct projects get distinct plan directories', () => {
    const repo = makeMonorepo(['apps/web', 'apps/api']);
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);

    try {
      const web = cleanEnv(home);
      web.GROUNDWORK_PROJECT_ROOT = path.join(repo, 'apps', 'web');
      const api = cleanEnv(home);
      api.GROUNDWORK_PROJECT_ROOT = path.join(repo, 'apps', 'api');
      const webPlans = plansDirFor(repo, web);
      const apiPlans = plansDirFor(repo, api);
      assert.strictEqual(webPlans, 'apps/web/.groundwork-plans');
      assert.strictEqual(apiPlans, 'apps/api/.groundwork-plans');
      assert.notStrictEqual(webPlans, apiPlans);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('collapses to .groundwork-plans when CWD is the project root (runner mode)', () => {
    const repo = makeMonorepo(['apps/web']);
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);

    try {
      const env = cleanEnv(home);
      env.GROUNDWORK_PROJECT_ROOT = path.join(repo, 'apps', 'web');
      assert.strictEqual(plansDirFor(path.join(repo, 'apps', 'web'), env), '.groundwork-plans');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('single-project repos keep the repo-root .groundwork-plans', () => {
    const repo = makeSingleProjectRepo();
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);

    try {
      assert.strictEqual(plansDirFor(repo, cleanEnv(home)), '.groundwork-plans');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('template variable wiring', () => {
  test('PostToolUse hook injects the {{plans_dir}} binding', () => {
    const repo = makeMonorepo(['apps/web']);
    const home = path.join(repo, 'home');
    fs.mkdirSync(home);

    try {
      const env = cleanEnv(home);
      env.GROUNDWORK_PROJECT_ROOT = path.join(repo, 'apps', 'web');
      const result = spawnSync('node', [HOOK], {
        cwd: repo,
        env,
        input: JSON.stringify({ tool_input: {} }),
        encoding: 'utf8',
      });
      assert.strictEqual(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.ok(
        payload.hookSpecificOutput.additionalContext.includes('- {{plans_dir}} = apps/web/.groundwork-plans'),
        payload.hookSpecificOutput.additionalContext
      );
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('session-start template block resolves {{plans_dir}}', () => {
    const script = fs.readFileSync(SESSION_START, 'utf8');
    assert.ok(script.includes("'- {{plans_dir}} = ' + getPlansDir()"));
  });
});

describe('skill plan-path contract', () => {
  const skillsDir = path.join(PLUGIN_ROOT, 'skills');

  function readSkill(name) {
    return fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
  }

  test('plan-task writes plans via {{plans_dir}}', () => {
    const skill = readSkill('plan-task');
    assert.ok(skill.includes('mkdir -p {{plans_dir}}'));
    assert.ok(skill.includes('plan_file_path={{plans_dir}}/{identifier}-plan.md'));
  });

  test('just-do-it writes plans via {{plans_dir}}', () => {
    const skill = readSkill('just-do-it');
    assert.ok(skill.includes('mkdir -p {{plans_dir}}'));
    assert.ok(skill.includes('plan_file_path={{plans_dir}}/TASK-NNN-plan.md'));
  });

  test('implement-task derives conventional plan paths via {{plans_dir}}', () => {
    const skill = readSkill('implement-task');
    assert.ok(skill.includes('`{{plans_dir}}/TASK-NNN-plan.md`'));
  });

  test('no skill constructs an unscoped repo-root plan path', () => {
    const offenders = [];
    for (const entry of fs.readdirSync(skillsDir)) {
      const skillPath = path.join(skillsDir, entry, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      const body = fs.readFileSync(skillPath, 'utf8');
      if (/plan_file_path\s*=\s*`?\.groundwork-plans\//.test(body)) offenders.push(entry);
    }
    assert.deepStrictEqual(offenders, []);
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
