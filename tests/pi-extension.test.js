/**
 * Pi extension runtime tests.
 *
 * The Pi extension's project context and template bindings must match the
 * canonical core semantics: the mapping-style .groundwork.yml schema
 * (version/projects/<name>/path — not the list-style "- name:" schema),
 * absolute bindings invariant to the caller's directory, containment-checked
 * project paths, and the lowercase Groundwork template variables that skills
 * actually use. The helpers are dependency-free JavaScript so this suite runs
 * through the plain test runner without any TypeScript compiler.
 *
 * Run with: node tests/pi-extension.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const CORE = path.join(PLUGIN_ROOT, 'pi-extension', 'lib', 'project-context-core.js');
const TEMPLATE_VARS = path.join(PLUGIN_ROOT, 'pi-extension', 'lib', 'template-vars.js');
const INSTALLER = path.join(PLUGIN_ROOT, 'install-skills.sh');

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

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// Canonical mapping-schema monorepo (the only schema Pi accepts).
function makeMonorepo() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gw-pi-')));
  write(path.join(root, 'apps', 'web', 'specs', 'tasks.md'), '# tasks\n');
  write(path.join(root, 'services', 'api', 'specs', 'tasks.md'), '# tasks\n');
  write(path.join(root, '.groundwork.yml'), [
    'version: 1',
    'projects:',
    '  web:',
    '    path: apps/web',
    '  api:',
    '    path: services/api',
    '',
  ].join('\n'));
  return root;
}

function makeSingleProjectRepo() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gw-pi-single-')));
  write(path.join(root, 'specs', 'tasks.md'), '# tasks\n');
  return root;
}

describe('Pi project context core (canonical mapping schema)', () => {
  test('parses the canonical mapping schema, not the list-style schema', () => {
    const core = require(CORE);
    const root = makeMonorepo();
    try {
      const parsed = core.parseGroundworkYml(fs.readFileSync(path.join(root, '.groundwork.yml'), 'utf8'));
      assert.deepStrictEqual(Object.keys(parsed.projects), ['web', 'api']);
      assert.strictEqual(parsed.projects.web.path, 'apps/web');

      // The list-style "- name:" schema is not the canonical mapping.
      const listed = core.parseGroundworkYml([
        'version: 1',
        'projects:',
        '  - name: web',
        '    path: apps/web',
        '',
      ].join('\n'));
      assert.strictEqual(listed, null, 'list-style schema must not be accepted');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('resolves root, selected-project, and descendant invocations identically', () => {
    const core = require(CORE);
    const root = makeMonorepo();
    try {
      const fromRoot = core.resolveProjectContext(root, 'web');
      const fromProject = core.resolveProjectContext(path.join(root, 'apps', 'web'), 'web');
      const fromDescendant = core.resolveProjectContext(path.join(root, 'apps', 'web', 'specs'), 'web');
      for (const resolved of [fromRoot, fromProject, fromDescendant]) {
        assert.ok(resolved.ok, resolved.reason);
        assert.strictEqual(resolved.project_root, path.join(root, 'apps', 'web'));
        assert.strictEqual(resolved.specs_dir, path.join(root, 'apps', 'web', 'specs'));
        assert.strictEqual(resolved.plans_dir, path.join(root, 'apps', 'web', '.groundwork-plans'));
        assert.strictEqual(resolved.debug_dir, path.join(root, 'apps', 'web', '.debug'));
        assert.strictEqual(resolved.research_dir, path.join(root, 'apps', 'web', '.architecture'));
        assert.ok(path.isAbsolute(resolved.project_root));
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects invalid, missing, and escaping project paths', () => {
    const core = require(CORE);
    const root = makeMonorepo();
    try {
      const unknown = core.resolveProjectContext(root, 'nope');
      assert.ok(!unknown.ok);
      assert.match(unknown.reason, /not found|nope/);

      write(path.join(root, '.groundwork.yml'), [
        'version: 1', 'projects:', '  gone:', '    path: apps/gone', '',
      ].join('\n'));
      const missing = core.resolveProjectContext(root, 'gone');
      assert.ok(!missing.ok, 'a missing project path must be rejected');

      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-pi-outside-'));
      write(path.join(root, '.groundwork.yml'), [
        'version: 1', 'projects:', '  escaped:', `    path: ${path.relative(root, outside)}`, '',
      ].join('\n'));
      const escaped = core.resolveProjectContext(root, 'escaped');
      assert.ok(!escaped.ok, 'a project path outside the repository must be rejected');

      // A descendant invocation resolves the repository root before selection.
      write(path.join(root, '.groundwork.yml'), [
        'version: 1', 'projects:', '  web:', '    path: apps/web',
        '  api:', '    path: services/api', '',
      ].join('\n'));
      const descendant = core.resolveProjectContext(path.join(root, 'apps', 'web', 'specs'), 'api');
      assert.ok(descendant.ok);
      assert.strictEqual(descendant.project_root, path.join(root, 'services', 'api'));
      fs.rmSync(outside, { recursive: true, force: true });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a configured monorepo without a selection reports selection_required', () => {
    const core = require(CORE);
    const root = makeMonorepo();
    try {
      const resolved = core.resolveProjectContext(root, undefined);
      assert.ok(resolved.ok);
      assert.strictEqual(resolved.selection_required, true);
      assert.strictEqual(resolved.project_name, '');
      assert.strictEqual(resolved.project_root, root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a no-config single-project repository resolves absolute repo bindings', () => {
    const core = require(CORE);
    const root = makeSingleProjectRepo();
    try {
      const resolved = core.resolveProjectContext(root, undefined);
      assert.ok(resolved.ok);
      assert.strictEqual(resolved.selection_required, false);
      assert.strictEqual(resolved.project_root, root);
      assert.strictEqual(resolved.specs_dir, path.join(root, 'specs'));
      assert.strictEqual(resolved.plans_dir, path.join(root, '.groundwork-plans'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('the selector lists canonical mapping keys', () => {
    const core = require(CORE);
    const root = makeMonorepo();
    try {
      const projects = core.listProjects(root);
      assert.deepStrictEqual(projects.map((p) => p.name), ['web', 'api']);
      assert.strictEqual(projects[0].path, 'apps/web');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('Pi template variable bindings', () => {
  test('all lowercase Groundwork variables are substituted absolutely', () => {
    const { applyTemplateVars } = require(TEMPLATE_VARS);
    const bindings = {
      project_root: '/repo/apps/web',
      project_name: 'web',
      specs_dir: '/repo/apps/web/specs',
      plans_dir: '/repo/apps/web/.groundwork-plans',
      debug_dir: '/repo/apps/web/.debug',
      research_dir: '/repo/apps/web/.architecture',
    };
    const input = [
      'specs: {{specs_dir}}/tasks.md',
      'plans: {{plans_dir}}/TASK-004-plan.md',
      'debug: {{debug_dir}}/journal.md',
      'research: {{research_dir}}/notes.md',
      'root: {{project_root}} name: {{project_name}}',
    ].join('\n');
    const output = applyTemplateVars(input, bindings);
    assert.ok(output.includes('specs: /repo/apps/web/specs/tasks.md'));
    assert.ok(output.includes('plans: /repo/apps/web/.groundwork-plans/TASK-004-plan.md'));
    assert.ok(output.includes('debug: /repo/apps/web/.debug/journal.md'));
    assert.ok(output.includes('research: /repo/apps/web/.architecture/notes.md'));
    assert.ok(output.includes('root: /repo/apps/web name: web'));
  });

  test('uppercase-only substitutions are not claimed as supported behavior', () => {
    const { applyTemplateVars } = require(TEMPLATE_VARS);
    const output = applyTemplateVars('{{PROJECT_ROOT}} {{SPECS_DIR}}', {
      project_root: '/repo', project_name: 'x',
      specs_dir: '/repo/specs', plans_dir: '/repo/.groundwork-plans',
      debug_dir: '/repo/.debug', research_dir: '/repo/.architecture',
    });
    assert.strictEqual(output, '{{PROJECT_ROOT}} {{SPECS_DIR}}',
      'uppercase placeholders must remain untouched — lowercase is the contract');
  });
});

describe('Pi runtime shipping', () => {
  test('the installer copies the Pi .js runtime helpers alongside the TypeScript extension', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-pi-install-'));
    try {
      execFileSync('bash', [INSTALLER, '--pi', '--project', '--force', '--source', PLUGIN_ROOT], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      // Project scope installs under .pi/extensions (global uses ~/.pi/agent/extensions).
      const extLib = path.join(root, '.pi', 'extensions', 'groundwork', 'lib');
      for (const helper of ['project-context-core.js', 'template-vars.js']) {
        assert.ok(
          fs.existsSync(path.join(extLib, helper)),
          `--pi export is missing runtime helper ${helper}`
        );
      }
      assert.ok(fs.existsSync(path.join(path.dirname(extLib), 'index.ts')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('the TypeScript extension delegates to the JS core and lowercase variables', () => {
    const projectContext = fs.readFileSync(
      path.join(PLUGIN_ROOT, 'pi-extension', 'lib', 'project-context.ts'), 'utf8');
    assert.ok(
      projectContext.includes('project-context-core'),
      'project-context.ts must delegate to the shared JS core'
    );
    assert.ok(!/name:\s*\\?/.test('') && !projectContext.includes('- name:'),
      'project-context.ts must not parse the list-style schema itself');
    const index = fs.readFileSync(path.join(PLUGIN_ROOT, 'pi-extension', 'index.ts'), 'utf8');
    assert.ok(index.includes('template-vars'), 'index.ts must use the shared template-vars helper');
    assert.ok(
      !/\{\{PROJECT_ROOT\}\}/.test(index),
      'index.ts must not claim uppercase template substitutions'
    );
  });
});

describe('Pi project context fails closed on invalid config', () => {
  // A present-but-invalid .groundwork.yml must never resolve as a no-config
  // single-project repository: the Pi core reports a structured failure.
  const { resolveProjectContext } = require(CORE);

  function invalidRepo(content) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gw-pi-invalid-')));
    fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
    write(path.join(root, '.groundwork.yml'), content);
    return root;
  }

  for (const [label, content] of [
    ['malformed-yaml', 'version: 1\nprojects:\n  - web\n'],
    ['empty', ''],
    ['unsupported-version', 'version: 2\nprojects:\n  web:\n    path: apps/web\n'],
    ['missing-project-path', 'version: 1\nprojects:\n  web:\n    note: nothing\n'],
    ['escaping-project-path', 'version: 1\nprojects:\n  web:\n    path: ../outside\n'],
    ['trailing-garbage', 'version: 1\nprojects:\n  web:\n    path: apps/web\n::: garbage\n'],
    ['unknown-top-level-key', 'version: 1\nname: x\nprojects:\n  web:\n    path: apps/web\n'],
    ['unknown-project-property', 'version: 1\nprojects:\n  web:\n    path: apps/web\n    description: hi\n'],
  ]) {
    test(`${label} config resolves to a structured failure, never single-project`, () => {
      const root = invalidRepo(content);
      try {
        const result = resolveProjectContext(root);
        assert.strictEqual(result.ok, false, `resolved as: ${JSON.stringify(result)}`);
        assert.strictEqual(typeof result.code, 'string');
        assert.ok(result.code.length > 0);
        assert.strictEqual(typeof result.message, 'string');
        assert.ok(result.message.length > 0);
        assert.ok(!('specs_dir' in result), 'failure output must not carry operational bindings');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
