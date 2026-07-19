/**
 * Tests for install-config.txt <-> skills/ parity.
 *
 * Guards the export pipeline (install-skills.sh) against silent drift: the
 * installer is fail-closed (every skill in skills/ is exported as
 * groundwork-<name> unless explicitly dropped), so the failure mode this test
 * catches is a stale config — a drop/rename pointing at a skill that no longer
 * exists, or a regression that re-introduces a hand-maintained allow-list.
 *
 * Run with: node tests/install-config.test.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(PLUGIN_ROOT, 'skills');
const CONFIG = path.join(PLUGIN_ROOT, 'install-config.txt');
const INSTALLER = path.join(PLUGIN_ROOT, 'install-skills.sh');
const RUNTIME_CONTEXT = path.join(PLUGIN_ROOT, 'lib', 'runtime-context-cli.js');
const CODEX_STATUSLINE_BODY = path.join(
  PLUGIN_ROOT,
  'skills',
  'statusline',
  'codex-skill-body.md'
);

// Test utilities (match the convention in the other tests/*.test.js files)
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

// --- Helpers: mirror the parsing/resolution logic in install-skills.sh ---

// Skill directories that actually contain a SKILL.md (the installer skips the rest).
function skillDirs() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(SKILLS_DIR, name, 'SKILL.md')))
    .sort();
}

// Parse exception lines: "<lhs> = <rhs>" (rhs may be "drop" or a rename).
function parseConfig() {
  const overrides = {};
  const raw = fs.readFileSync(CONFIG, 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    assert.notStrictEqual(eq, -1, `config line is not a "key = value" pair: "${trimmed}"`);
    const lhs = trimmed.slice(0, eq).trim();
    const rhs = trimmed.slice(eq + 1).trim().split(/\s+/)[0];
    overrides[lhs] = rhs;
  }
  return overrides;
}

// Resolve the final skill -> installed-name map exactly as load_config does:
// default groundwork-<name>, then apply overrides.
function resolveMap() {
  const map = {};
  for (const name of skillDirs()) map[name] = `groundwork-${name}`;
  const overrides = parseConfig();
  for (const [k, v] of Object.entries(overrides)) map[k] = v;
  return map;
}

// --- Tests ---

describe('install-config.txt parsing', () => {
  test('every non-comment line is a valid "key = value" pair', () => {
    parseConfig(); // asserts internally
  });

  test('config contains only exceptions, not a full allow-list', () => {
    const overrides = parseConfig();
    const dirs = skillDirs();
    // A regression to a hand-maintained allow-list would list ~most skills.
    // The exceptions file must stay far smaller than the skill set.
    assert.ok(
      Object.keys(overrides).length < dirs.length / 2,
      `install-config.txt has ${Object.keys(overrides).length} entries for ${dirs.length} ` +
        `skills — it should list only exceptions (drops/renames), not act as an allow-list`
    );
  });
});

describe('config <-> skills/ parity', () => {
  test('no stale entries: every config key maps to an existing skill dir', () => {
    const overrides = parseConfig();
    const dirs = new Set(skillDirs());
    const stale = Object.keys(overrides).filter((k) => !dirs.has(k));
    assert.deepStrictEqual(
      stale,
      [],
      `install-config.txt references skills that no longer exist: ${stale.join(', ')}`
    );
  });

  test('every skill on disk is accounted for (exported or explicitly dropped)', () => {
    const map = resolveMap();
    const unaccounted = skillDirs().filter((name) => !(name in map));
    // Under fail-closed semantics this can only fail if resolveMap/installer
    // logic regresses; the assertion documents the invariant.
    assert.deepStrictEqual(
      unaccounted,
      [],
      `skills not accounted for by the installer: ${unaccounted.join(', ')}`
    );
  });

  test('exported skills get a valid groundwork-* (or explicit rename) name', () => {
    const map = resolveMap();
    for (const [name, installed] of Object.entries(map)) {
      if (installed === 'drop') continue;
      assert.ok(
        /^[a-z0-9]+(-[a-z0-9]+)*$/.test(installed),
        `skill "${name}" exports under invalid name "${installed}"`
      );
    }
  });

  test('regression: full-lifecycle skills are exported, not silently dropped', () => {
    // These were silently omitted before the fail-closed change because they
    // were never added to the old allow-list. Anchor them so it cannot recur.
    const map = resolveMap();
    const lifecycle = [
      'design-it-twice',
      'domain-modeling',
      'doubt-driven-development',
      'handoff',
      'instrument-observability',
      'ship',
      'staged-rollout',
      'vertical-slice',
    ];
    for (const name of lifecycle) {
      if (!fs.existsSync(path.join(SKILLS_DIR, name, 'SKILL.md'))) continue; // skill renamed/removed — not this test's concern
      assert.strictEqual(
        map[name],
        `groundwork-${name}`,
        `lifecycle skill "${name}" is not exported (resolved to "${map[name]}")`
      );
    }
  });
});

// Run the installer for a target into a temp dir and return the output root.
// Returns null (so the caller can skip) if bash isn't available.
function runInstaller(target) {
  try {
    execFileSync('bash', ['-c', 'exit 0'], { stdio: 'ignore' });
  } catch {
    return null; // no bash on this platform — skip the end-to-end check
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-install-'));
  execFileSync(
    'bash',
    [INSTALLER, `--${target}`, '--project', '--force', '--source', PLUGIN_ROOT],
    { cwd: tmp, stdio: 'pipe' }
  );
  return tmp;
}

function allFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allFiles(full));
    else out.push(full);
  }
  return out;
}

describe('exported output is free of Claude-Code-only leakage', () => {
  // These are the leaks the transform must scrub: plugin-root var, raw Skill()
  // calls, and any unmapped "groundwork:" colon reference (slash hints, etc.).
  const FORBIDDEN = [
    { token: '${CLAUDE_PLUGIN_ROOT}', label: 'plugin-root variable' },
    { token: 'Skill(skill=', label: 'raw Skill() call' },
    { token: 'groundwork:', label: 'unmapped groundwork: reference' },
  ];

  for (const target of ['codex', 'opencode']) {
    test(`${target}: produced files contain no leakage`, () => {
      const root = runInstaller(target);
      if (root === null) {
        console.log(`    (skipped — bash unavailable)`);
        return;
      }
      try {
        const files = allFiles(root);
        assert.ok(files.length > 0, 'installer produced no files');
        const offenders = [];
        for (const f of files) {
          const text = fs.readFileSync(f, 'utf-8');
          for (const { token, label } of FORBIDDEN) {
            if (text.includes(token)) {
              offenders.push(`${path.relative(root, f)} — ${label} (${token})`);
            }
          }
        }
        assert.deepStrictEqual(offenders, [], `leakage in exported files:\n  ${offenders.join('\n  ')}`);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

describe('statusline target routing', () => {
  const targetDirs = {
    codex: '.codex',
    opencode: '.opencode',
    kiro: '.kiro',
    pi: '.pi',
  };

  for (const target of Object.keys(targetDirs)) {
    test(`${target}: ${target === 'codex' ? 'exports' : 'omits'} groundwork-statusline`, () => {
      const root = runInstaller(target);
      if (root === null) return;
      try {
        const skill = path.join(
          root,
          targetDirs[target],
          'skills',
          'groundwork-statusline',
          'SKILL.md'
        );
        assert.strictEqual(fs.existsSync(skill), target === 'codex');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }

  test('Codex export configures and owns only the native tui.status_line field', () => {
    const root = runInstaller('codex');
    if (root === null) return;
    try {
      const skill = fs.readFileSync(
        path.join(root, '.codex', 'skills', 'groundwork-statusline', 'SKILL.md'),
        'utf8'
      );
      const expected = 'status_line = ["model-with-reasoning", "context-used", ' +
        '"used-tokens", "five-hour-limit", "weekly-limit", "current-dir", "git-branch"]';

      assert.ok(skill.includes(expected));
      assert.ok(skill.includes('$CODEX_HOME'));
      assert.ok(skill.includes('preserve every unrelated TOML key and table'));
      assert.ok(skill.includes('ask the user before replacing it'));
      assert.ok(skill.includes('already equals the exact Groundwork-owned value'));
      assert.ok(skill.includes('remove it only when it exactly matches the Groundwork-owned value'));
      assert.ok(!skill.includes('settings.json'));
      assert.ok(!skill.includes('CLAUDE_PLUGIN_ROOT'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Codex export uses the statusline-owned source body', () => {
    assert.ok(fs.existsSync(CODEX_STATUSLINE_BODY));
    const root = runInstaller('codex');
    if (root === null) return;
    try {
      const exported = fs.readFileSync(
        path.join(root, '.codex', 'skills', 'groundwork-statusline', 'SKILL.md'),
        'utf8'
      );
      const body = fs.readFileSync(CODEX_STATUSLINE_BODY, 'utf8').trim();
      assert.ok(exported.endsWith(`${body}\n`));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('Codex model recommendations', () => {
  test('translates Claude model recommendations to Codex equivalents', () => {
    const root = runInstaller('codex');
    if (root === null) return;
    try {
      const debug = fs.readFileSync(
        path.join(root, '.codex', 'skills', 'groundwork-debug', 'SKILL.md'),
        'utf8'
      );
      assert.ok(debug.includes('Sol at high effort'));
      assert.ok(debug.includes('/model sol'));
      assert.ok(!debug.includes('Opus (1M context)'));
      assert.ok(!debug.includes('/model opus[1m]'));

      const workOn = fs.readFileSync(
        path.join(root, '.codex', 'skills', 'groundwork-work-on', 'SKILL.md'),
        'utf8'
      );
      assert.ok(workOn.includes('Terra or Sol at high effort'));
      assert.ok(workOn.includes('/model terra'));
      assert.ok(workOn.includes('if on Luna'));
      assert.ok(!workOn.includes('Sonnet or Opus'));
      assert.ok(!workOn.includes('/model sonnet'));
      assert.ok(!workOn.includes('Haiku'));

      const codexSkills = allFiles(path.join(root, '.codex', 'skills'));
      const claudeModels = /\b(?:Opus|Sonnet|Haiku|Fable)\b|opus\[1m\]/;
      const offenders = codexSkills.filter((file) =>
        claudeModels.test(fs.readFileSync(file, 'utf8'))
      );
      assert.deepStrictEqual(offenders, [], 'Codex export retained Claude model names');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('exports a runtime binding preamble for Codex recommendation skills', () => {
    const root = runInstaller('codex');
    if (root === null) return;
    try {
      const skillDir = path.join(root, '.codex', 'skills', 'groundwork-debug');
      const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
      const runtime = path.join(skillDir, 'scripts', 'runtime-context-cli.js');

      assert.ok(fs.existsSync(runtime), 'Codex recommendation skill has no runtime resolver');
      assert.ok(skill.includes('runtime-context-cli.js --harness codex'));
      assert.ok(skill.includes('exact bindings for `{{effort_level}}` and the current model'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Codex runtime resolver reads the configured model and effort', () => {
    const root = runInstaller('codex');
    if (root === null) return;
    try {
      const runtime = path.join(
        root, '.codex', 'skills', 'groundwork-debug', 'scripts', 'runtime-context-cli.js'
      );

      const codexHome = path.join(root, 'codex-home');
      fs.mkdirSync(codexHome);
      fs.writeFileSync(path.join(codexHome, 'config.toml'), [
        'model = "gpt-5.6-sol"',
        'model_reasoning_effort = "high"',
        '',
        '[tui]',
        'status_line = ["model-with-reasoning"]',
        '',
      ].join('\n'));

      const resolved = JSON.parse(execFileSync(
        'node', [runtime, '--harness', 'codex'],
        {
          cwd: root,
          env: { ...process.env, CODEX_HOME: codexHome },
          encoding: 'utf8',
        }
      ));
      assert.strictEqual(resolved.model, 'gpt-5.6-sol');
      assert.strictEqual(resolved.effort_level, 'high');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('Codex runtime context resolver', () => {
  const configCases = [
    {
      name: 'uses defaults when config is missing',
      config: null,
      model: 'unknown',
      effort: 'default',
    },
    {
      name: 'reads single-quoted top-level strings',
      config: "model = 'gpt-5.6-sol'\nmodel_reasoning_effort = 'high'\n",
      model: 'gpt-5.6-sol',
      effort: 'high',
    },
    {
      name: 'decodes escaped double-quoted strings',
      config: 'model = "gpt-5.6-\\\"sol"\nmodel_reasoning_effort = "medium"\n',
      model: 'gpt-5.6-"sol',
      effort: 'medium',
    },
    {
      name: 'ignores values after the first table boundary',
      config: 'model = "top"\n[tui]\nmodel = "nested"\nmodel_reasoning_effort = "low"\n',
      model: 'top',
      effort: 'default',
    },
    {
      name: 'ignores malformed string values',
      config: 'model = "unterminated\nmodel_reasoning_effort = nope\n',
      model: 'unknown',
      effort: 'default',
    },
  ];

  for (const configCase of configCases) {
    test(configCase.name, () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-runtime-context-'));
      try {
        if (configCase.config !== null) {
          fs.mkdirSync(path.join(tmp, '.codex'));
          fs.writeFileSync(path.join(tmp, '.codex', 'config.toml'), configCase.config);
        }
        const resolved = JSON.parse(execFileSync(
          'node', [RUNTIME_CONTEXT, '--harness', 'codex'],
          {
            env: { ...process.env, HOME: tmp, CODEX_HOME: '' },
            encoding: 'utf8',
          }
        ));
        assert.strictEqual(resolved.model, configCase.model);
        assert.strictEqual(resolved.effort_level, configCase.effort);
        assert.strictEqual(resolved.config_file, path.join(tmp, '.codex', 'config.toml'));
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  }

  test('rejects invalid harness arguments with usage on stderr', () => {
    const result = spawnSync('node', [RUNTIME_CONTEXT, '--harness', 'claude'], {
      encoding: 'utf8',
    });
    assert.notStrictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
    assert.ok(result.stderr.includes('Usage: runtime-context-cli.js --harness codex'));
  });
});

describe('exported project context runtime', () => {
  for (const [target, targetDir, stateEnv] of [
    ['codex', '.codex', 'CODEX_HOME'],
    ['opencode', '.opencode', 'OPENCODE_CONFIG_DIR'],
  ]) {
    test(`${target} select-project bundles and executes its local runtime`, () => {
      const root = runInstaller(target);
      if (root === null) return;
      try {
        const skillDir = path.join(root, targetDir, 'skills', 'groundwork-select-project');
        const cli = path.join(skillDir, 'scripts', 'project-context-cli.js');
        const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
        assert.ok(fs.existsSync(cli));
        assert.ok(fs.existsSync(path.join(skillDir, 'scripts', 'project-context.js')));
        assert.ok(skill.includes(`project-context-cli.js select "<selected-name>" --harness ${target}`));
        assert.ok(!skill.includes('${PLUGIN_ROOT}'));

        const repo = path.join(root, `${target}-repo`);
        fs.mkdirSync(path.join(repo, 'apps', 'web', 'specs'), { recursive: true });
        fs.writeFileSync(path.join(repo, '.groundwork.yml'), [
          'version: 1', 'projects:', '  web:', '    path: apps/web', '',
        ].join('\n'));
        execFileSync('git', ['init', '-q'], { cwd: repo });
        const env = { ...process.env, [stateEnv]: path.join(root, `${target}-state`) };

        const selected = JSON.parse(execFileSync(
          'node', [cli, 'select', 'web', '--harness', target],
          { cwd: repo, env, encoding: 'utf8' }
        ));
        assert.strictEqual(selected.project_name, 'web');
        assert.strictEqual(selected.specs_dir, 'apps/web/specs');

        const resolved = JSON.parse(execFileSync(
          'node', [cli, 'resolve', '--harness', target],
          { cwd: repo, env, encoding: 'utf8' }
        ));
        assert.strictEqual(resolved.selection_required, false);
        assert.strictEqual(resolved.project_name, 'web');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }

  test('codex select-project command treats a metacharacter-leading name as data', () => {
    const root = runInstaller('codex');
    if (root === null) return;
    try {
      const skillDir = path.join(root, '.codex', 'skills', 'groundwork-select-project');
      const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
      const template = skill.split('\n').find((line) => line.includes('project-context-cli.js select'));
      assert.ok(template, 'select-project command template is missing');

      const binDir = path.join(root, 'bin');
      const marker = path.join(root, 'injected');
      const injectedCommand = path.join(binDir, 'pwn');
      fs.mkdirSync(binDir);
      fs.writeFileSync(injectedCommand, '#!/bin/sh\n: > "$MARKER"\n');
      fs.chmodSync(injectedCommand, 0o755);

      const command = template.trim()
        .replace('<skill-directory>', skillDir)
        .replace('<selected-name>', ';pwn');
      spawnSync('bash', ['-c', command], {
        cwd: root,
        env: { ...process.env, MARKER: marker, PATH: `${binDir}:${process.env.PATH}` },
        encoding: 'utf8',
      });
      assert.strictEqual(fs.existsSync(marker), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('codex context-aware skills bundle a resolver and explain placeholder binding', () => {
    const root = runInstaller('codex');
    if (root === null) return;
    try {
      const skillDir = path.join(root, '.codex', 'skills', 'groundwork-plan-task');
      const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
      assert.ok(fs.existsSync(path.join(skillDir, 'scripts', 'project-context-cli.js')));
      assert.ok(fs.existsSync(path.join(skillDir, 'scripts', 'project-context.js')));
      assert.ok(skill.includes('project-context-cli.js resolve --harness codex'));
      assert.ok(skill.includes('exact bindings for `{{project_name}}`, `{{project_root}}`, and `{{specs_dir}}`'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
