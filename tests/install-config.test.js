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
const AGENTS_DIR = path.join(PLUGIN_ROOT, 'agents');
const CONFIG = path.join(PLUGIN_ROOT, 'install-config.txt');
const INSTALLER = path.join(PLUGIN_ROOT, 'install-skills.sh');

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

function agentDirs() {
  return fs
    .readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(AGENTS_DIR, name, 'AGENT.md')))
    .sort();
}

function frontmatterValue(text, key) {
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  assert.ok(frontmatter, 'missing YAML frontmatter');
  const match = frontmatter[1].match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  return match ? match[1] : undefined;
}

// Codex agent files intentionally use a flat TOML document containing only
// basic strings. Parse that schema strictly so invalid escaping, duplicate
// keys, sections, and non-string values fail the test.
function parseCodexAgentToml(text) {
  const parsed = {};
  for (const [index, line] of text.trimEnd().split('\n').entries()) {
    const match = line.match(/^([A-Za-z0-9_-]+) = ("(?:[^"\\]|\\.)*")$/);
    assert.ok(match, `invalid flat TOML at line ${index + 1}: ${line}`);
    assert.ok(!(match[1] in parsed), `duplicate TOML key: ${match[1]}`);
    parsed[match[1]] = JSON.parse(match[2]);
  }
  return parsed;
}

function transformAgents(text, target = 'codex') {
  return execFileSync(
    'node',
    [path.join(PLUGIN_ROOT, 'lib', 'transform-agents.js'), '--target', target],
    { input: text, encoding: 'utf8' }
  );
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
function runInstaller(target, options = {}) {
  try {
    execFileSync('bash', ['-c', 'exit 0'], { stdio: 'ignore' });
  } catch {
    return null; // no bash on this platform — skip the end-to-end check
  }
  const tmp = options.root || fs.mkdtempSync(path.join(os.tmpdir(), 'gw-install-'));
  const args = [INSTALLER, `--${target}`, `--${options.scope || 'project'}`];
  if (options.force !== false) args.push('--force');
  if (options.dryRun) args.push('--dry-run');
  args.push('--source', options.source || PLUGIN_ROOT);
  const stdout = execFileSync(
    'bash',
    args,
    {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  return options.capture ? { root: tmp, stdout } : tmp;
}

function createAgentFixture(agentMarkdown) {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-source-'));
  fs.mkdirSync(path.join(source, 'skills'));
  fs.mkdirSync(path.join(source, 'agents', 'fixture-agent'), { recursive: true });
  fs.mkdirSync(path.join(source, 'lib'));
  fs.writeFileSync(path.join(source, 'install-config.txt'), '');
  fs.writeFileSync(path.join(source, 'agents', 'fixture-agent', 'AGENT.md'), agentMarkdown);
  for (const file of [
    'transform-agents.js',
    'render-codex-agent.js',
    'write-codex-agent.js',
    'remove-legacy-codex-agent-skill.js',
  ]) {
    const original = path.join(PLUGIN_ROOT, 'lib', file);
    if (fs.existsSync(original)) fs.copyFileSync(original, path.join(source, 'lib', file));
  }
  return source;
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

function snapshotTree(dir) {
  const snapshot = {};
  for (const file of allFiles(dir)) {
    snapshot[path.relative(dir, file)] = fs.readFileSync(file, 'utf8');
  }
  return snapshot;
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

describe('Codex native agent export', () => {
  test('exports every Claude agent exactly once as valid Codex TOML', () => {
    const root = runInstaller('codex');
    if (root === null) return;
    try {
      const agentsDir = path.join(root, '.codex', 'agents');
      const expectedNames = agentDirs();
      const actualNames = fs.readdirSync(agentsDir)
        .filter((name) => name.endsWith('.toml'))
        .map((name) => name.slice(0, -'.toml'.length))
        .sort();
      assert.deepStrictEqual(actualNames, expectedNames);

      const modelMap = {
        sonnet: 'gpt-5.6-terra',
        'opus[1m]': 'gpt-5.6-sol',
      };
      for (const name of expectedNames) {
        const source = fs.readFileSync(path.join(AGENTS_DIR, name, 'AGENT.md'), 'utf8');
        const parsed = parseCodexAgentToml(
          fs.readFileSync(path.join(agentsDir, `${name}.toml`), 'utf8')
        );
        const claudeModel = frontmatterValue(source, 'model');
        const effort = frontmatterValue(source, 'effort');

        assert.strictEqual(parsed.name, name);
        assert.strictEqual(parsed.description, frontmatterValue(source, 'description'));
        const sourceHeading = source.replace(/^---\n[\s\S]*?\n---\n?/, '').split('\n')[0];
        assert.ok(
          parsed.developer_instructions.startsWith(`${sourceHeading}\n`),
          `${name}: transformed developer instructions lost their source heading`
        );
        assert.ok(parsed.developer_instructions.length > sourceHeading.length);
        if (claudeModel && claudeModel !== 'inherit') {
          assert.strictEqual(parsed.model, modelMap[claudeModel]);
        } else {
          assert.ok(!('model' in parsed), `${name}: inherited model must be omitted`);
        }
        if (effort) assert.strictEqual(parsed.model_reasoning_effort, effort);
        else assert.ok(!('model_reasoning_effort' in parsed), `${name}: absent effort must be omitted`);

        assert.strictEqual(
          fs.existsSync(path.join(root, '.codex', 'skills', `review-${name}`)),
          false,
          `${name}: Codex agent must not also export as a legacy review-* skill`
        );
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('removes only exact legacy Groundwork agent skill files during migration', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-migrate-'));
    const names = agentDirs();
    try {
      for (const name of names) {
        const legacyDir = path.join(root, '.codex', 'skills', `review-${name}`);
        fs.mkdirSync(legacyDir, { recursive: true });
        fs.writeFileSync(path.join(legacyDir, 'SKILL.md'), `legacy ${name}\n`);
      }

      const retainedSidecar = path.join(
        root, '.codex', 'skills', `review-${names[0]}`, 'user-notes.md'
      );
      fs.writeFileSync(retainedSidecar, 'keep me\n');
      const unrelated = path.join(root, '.codex', 'skills', 'review-personal', 'SKILL.md');
      fs.mkdirSync(path.dirname(unrelated), { recursive: true });
      fs.writeFileSync(unrelated, 'personal skill\n');

      runInstaller('codex', { root });

      for (const name of names) {
        const legacyDir = path.join(root, '.codex', 'skills', `review-${name}`);
        assert.strictEqual(
          fs.existsSync(path.join(legacyDir, 'SKILL.md')),
          false,
          `${name}: legacy Groundwork skill was not removed`
        );
        assert.strictEqual(
          fs.existsSync(legacyDir),
          name === names[0],
          `${name}: empty legacy directory cleanup did not preserve the sidecar boundary`
        );
      }
      assert.strictEqual(fs.existsSync(path.dirname(retainedSidecar)), true);
      assert.strictEqual(fs.readFileSync(retainedSidecar, 'utf8'), 'keep me\n');
      assert.strictEqual(fs.readFileSync(unrelated, 'utf8'), 'personal skill\n');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('cleans legacy agents globally, during non-force installs, and only reports in dry-run', () => {
    const cases = [
      { label: 'global', scope: 'global', force: true },
      { label: 'non-force', scope: 'project', force: false },
      { label: 'dry-run', scope: 'project', force: true, dryRun: true },
    ];
    for (const scenario of cases) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `gw-migrate-${scenario.label}-`));
      const legacy = path.join(root, '.codex', 'skills', 'review-researcher', 'SKILL.md');
      fs.mkdirSync(path.dirname(legacy), { recursive: true });
      fs.writeFileSync(legacy, 'legacy researcher\n');
      try {
        const result = runInstaller('codex', {
          root,
          scope: scenario.scope,
          force: scenario.force,
          dryRun: scenario.dryRun,
          capture: true,
          env: scenario.scope === 'global' ? { HOME: root } : {},
        });
        assert.strictEqual(fs.existsSync(legacy), Boolean(scenario.dryRun), scenario.label);
        assert.strictEqual(
          fs.existsSync(path.dirname(legacy)),
          Boolean(scenario.dryRun),
          scenario.label
        );
        if (scenario.dryRun) {
          assert.ok(result.stdout.includes('[dry-run] remove'));
          assert.ok(result.stdout.includes('review-researcher/SKILL.md (legacy agent skill)'));
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  test('refuses final, legacy-directory, and ancestor symlinks during cleanup', () => {
    const source = createAgentFixture([
      '---',
      'name: fixture-agent',
      'description: Cleanup fixture',
      '---',
      '# Fixture Agent',
      '',
    ].join('\n'));
    try {
      for (const symlinkKind of ['final', 'directory', 'ancestor']) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-migrate-link-'));
        const external = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-migrate-external-'));
        const skills = path.join(root, '.codex', 'skills');
        const legacyDir = path.join(skills, 'review-fixture-agent');
        const legacySkill = path.join(legacyDir, 'SKILL.md');
        fs.writeFileSync(path.join(external, 'marker'), 'unchanged\n');
        if (symlinkKind === 'ancestor') {
          fs.mkdirSync(path.join(external, 'review-fixture-agent'));
          fs.writeFileSync(path.join(external, 'review-fixture-agent', 'SKILL.md'), 'external\n');
          fs.mkdirSync(path.dirname(skills), { recursive: true });
          fs.symlinkSync(external, skills);
        } else if (symlinkKind === 'directory') {
          fs.mkdirSync(skills, { recursive: true });
          fs.writeFileSync(path.join(external, 'SKILL.md'), 'external\n');
          fs.symlinkSync(external, legacyDir);
        } else {
          fs.mkdirSync(legacyDir, { recursive: true });
          fs.writeFileSync(path.join(external, 'target.md'), 'external\n');
          fs.symlinkSync(path.join(external, 'target.md'), legacySkill);
        }
        const before = snapshotTree(external);

        try {
          const result = spawnSync(
            'bash',
            [INSTALLER, '--codex', '--project', '--force', '--source', source],
            { cwd: root, encoding: 'utf8' }
          );
          const expectedError = symlinkKind === 'final'
            ? 'Refusing symlink at legacy Codex skill:'
            : 'Refusing symlink in legacy Codex skill path:';
          assert.notStrictEqual(result.status, 0, `${symlinkKind}: cleanup unexpectedly succeeded`);
          assert.ok(
            result.stderr.includes(expectedError),
            `${symlinkKind}: cleanup failed for an unrelated reason:\n${result.stderr}`
          );
          assert.deepStrictEqual(snapshotTree(external), before, `${symlinkKind}: external tree changed`);
        } finally {
          fs.rmSync(root, { recursive: true, force: true });
          fs.rmSync(external, { recursive: true, force: true });
        }
      }
    } finally {
      fs.rmSync(source, { recursive: true, force: true });
    }
  });

  test('cannot delete an external skill when the validated directory is swapped at unlink', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-migrate-race-'));
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-migrate-race-external-'));
    const base = path.join(root, '.codex');
    const legacyDir = path.join(base, 'skills', 'review-race-agent');
    const heldDir = path.join(base, 'skills', 'review-race-agent-held');
    const legacySkill = path.join(legacyDir, 'SKILL.md');
    const externalSkill = path.join(external, 'SKILL.md');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(legacySkill, 'legacy\n');
    fs.writeFileSync(externalSkill, 'external\n');

    const { removeLegacySkill } = require('../lib/remove-legacy-codex-agent-skill');
    const unlinkSync = fs.unlinkSync;
    let swapped = false;
    fs.unlinkSync = function unlinkWithDirectorySwap(target) {
      if (!swapped) {
        swapped = true;
        fs.renameSync(legacyDir, heldDir);
        fs.symlinkSync(external, legacyDir);
        try {
          return unlinkSync.call(fs, target);
        } finally {
          unlinkSync.call(fs, legacyDir);
          fs.renameSync(heldDir, legacyDir);
        }
      }
      return unlinkSync.call(fs, target);
    };
    try {
      removeLegacySkill({ base, skill: legacySkill });
      assert.strictEqual(fs.readFileSync(externalSkill, 'utf8'), 'external\n');
    } finally {
      fs.unlinkSync = unlinkSync;
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(external, { recursive: true, force: true });
    }
  });

  test('renders quotes, backslashes, and newlines as parseable TOML strings', () => {
    const { renderAgent } = require('../lib/render-codex-agent');
    const args = {
      name: 'quoted-agent',
      description: 'Checks "quoted" paths such as C:\\work',
      model: 'gpt-5.6-sol',
      effort: 'max',
    };
    const instructions = 'First line\nUse "quotes" and C:\\work\\agent\n';
    const parsed = parseCodexAgentToml(renderAgent(args, instructions));

    assert.deepStrictEqual(parsed, {
      name: args.name,
      description: args.description,
      developer_instructions: instructions,
      model: args.model,
      model_reasoning_effort: args.effort,
    });
  });

  test('omits model and effort overrides when optional frontmatter is absent', () => {
    const source = createAgentFixture([
      '---',
      'name: fixture-agent',
      'description: Uses Codex defaults',
      '---',
      '# Fixture Agent',
      '',
    ].join('\n'));
    let root;
    try {
      root = runInstaller('codex', { source });
      const parsed = parseCodexAgentToml(
        fs.readFileSync(path.join(root, '.codex', 'agents', 'fixture-agent.toml'), 'utf8')
      );
      assert.ok(!('model' in parsed));
      assert.ok(!('model_reasoning_effort' in parsed));
    } finally {
      if (root) fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(source, { recursive: true, force: true });
    }
  });

  test('refuses final-path and ancestor symlinks when writing Codex agents', () => {
    for (const symlinkKind of ['final', 'ancestor']) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-symlink-'));
      const external = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-external-'));
      const marker = path.join(external, 'marker');
      fs.writeFileSync(marker, 'unchanged');
      fs.mkdirSync(path.join(root, '.codex'), { recursive: true });
      if (symlinkKind === 'final') {
        fs.mkdirSync(path.join(root, '.codex', 'agents'));
        fs.symlinkSync(marker, path.join(root, '.codex', 'agents', 'researcher.toml'));
      } else {
        fs.symlinkSync(external, path.join(root, '.codex', 'agents'));
      }

      try {
        const result = spawnSync(
          'bash',
          [INSTALLER, '--codex', '--project', '--force', '--source', PLUGIN_ROOT],
          { cwd: root, encoding: 'utf8' }
        );
        assert.notStrictEqual(result.status, 0, `${symlinkKind} symlink was followed`);
        const expectedError = symlinkKind === 'final'
          ? 'Refusing symlink at Codex agent destination:'
          : 'Refusing symlink in Codex agent path:';
        assert.ok(
          result.stderr.includes(expectedError),
          `${symlinkKind} case failed for an unrelated reason:\n${result.stderr}`
        );
        if (symlinkKind === 'ancestor') {
          assert.deepStrictEqual(
            fs.readdirSync(external).sort(),
            ['marker'],
            'ancestor symlink allowed Codex agent files outside the destination tree'
          );
        } else {
          assert.strictEqual(fs.readFileSync(marker, 'utf8'), 'unchanged');
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(external, { recursive: true, force: true });
      }
    }
  });

  test('rewrites Codex Agent calls to name the installed custom agents', () => {
    const root = runInstaller('codex');
    if (root === null) return;
    try {
      const architecture = fs.readFileSync(
        path.join(root, '.codex', 'skills', 'groundwork-design-architecture', 'SKILL.md'),
        'utf8'
      );
      const justDoIt = fs.readFileSync(
        path.join(root, '.codex', 'skills', 'groundwork-just-do-it', 'SKILL.md'),
        'utf8'
      );

      assert.ok(architecture.includes('Spawn the `researcher` custom agent'));
      assert.ok(justDoIt.includes('Spawn these custom agents in parallel:'));
      assert.ok(justDoIt.includes('(custom agent: `code-quality-reviewer`)'));
      assert.ok(!justDoIt.includes('(skill: `review-code-quality-reviewer`)'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('preserves exact single-line and multiline task prompts in Codex rewrites', () => {
    const single = transformAgents(
      '    Agent(subagent_type="groundwork:researcher:researcher", description="Research", prompt="Check \\"quoted\\" path C:\\\\tmp")'
    );
    assert.strictEqual(single, [
      '> Spawn the `researcher` custom agent for **Research** with this task:',
      '>',
      '> Check "quoted" path C:\\tmp',
      '',
    ].join('\n'));

    const multiline = transformAgents([
      '    Agent(',
      '        subagent_type="groundwork:researcher:researcher",',
      '        description="Research",',
      '        prompt="First line',
      '',
      '        Second \\"quoted\\" line"',
      '    )',
    ].join('\n'));
    assert.strictEqual(multiline, [
      '> Spawn the `researcher` custom agent for **Research** with this task:',
      '>',
      '> First line',
      '>',
      '> Second "quoted" line',
      '',
    ].join('\n'));
  });
});

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
