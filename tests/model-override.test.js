'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const INSTALLER = path.join(PLUGIN_ROOT, 'install-skills.sh');
const GLM_PRESET = path.join(PLUGIN_ROOT, 'model-overrides', 'glm.json');
const MODEL_OVERRIDE = path.join(PLUGIN_ROOT, 'lib', 'model-override.js');
const BUILTIN_POLICY = path.join(PLUGIN_ROOT, 'lib', 'codex-model-policy.json');
const AGENTS_DIR = path.join(PLUGIN_ROOT, 'agents');
const { applyToText } = require(path.join(PLUGIN_ROOT, 'lib', 'model-override.js'));

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

function runInstaller(options = {}) {
  const tmp = options.root || fs.mkdtempSync(path.join(os.tmpdir(), 'gw-models-'));
  const args = [
    INSTALLER,
    `--${options.target || 'codex'}`,
    `--${options.scope || 'project'}`,
  ];
  if (options.force !== false) args.push('--force');
  if (options.dryRun) args.push('--dry-run');
  if (options.skillsOnly) args.push('--skills-only');
  for (const arg of options.extraArgs || []) args.push(arg);

  const stdout = execFileSync('bash', args, {
    cwd: tmp,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { root: tmp, stdout };
}

function runInstallerFailure(options = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-model-fail-'));
  const args = [
    INSTALLER,
    `--${options.target || 'codex'}`,
    `--${options.scope || 'project'}`,
    '--dry-run',
  ];
  if (options.skillsOnly) args.push('--skills-only');
  for (const arg of options.extraArgs || []) args.push(arg);

  const result = spawnSync('bash', args, {
    cwd: tmp,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  return result;
}

function allFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function codexFiles(root) {
  return allFiles(path.join(root, '.codex'));
}

function writeJson(object) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gw-model-json-')), 'override.json');
  fs.writeFileSync(file, `${JSON.stringify(object, null, 2)}\n`);
  return file;
}

function resolveBuiltinAgent(name, sourceModel, sourceEffort) {
  return spawnSync('node', [
    MODEL_OVERRIDE,
    'resolve-builtin-agent',
    '--name', name,
    '--source-model', sourceModel,
    '--source-effort', sourceEffort,
  ], { encoding: 'utf8' });
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

describe('Codex model overrides', () => {
  test('builtin Codex conversion is a complete internal policy config', () => {
    const policy = JSON.parse(fs.readFileSync(BUILTIN_POLICY, 'utf8'));
    assert.deepStrictEqual(policy.translation, {
      light: 'gpt-5.6-luna',
      balanced: 'gpt-5.6-terra',
      deep: 'gpt-5.6-sol',
    });
    assert.deepStrictEqual(policy.sourceModels, {
      '': 'inherit',
      inherit: 'inherit',
      sonnet: 'balanced',
      'opus[1m]': 'deep',
    });

    const agentNames = fs.readdirSync(AGENTS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => fs.existsSync(path.join(AGENTS_DIR, name, 'AGENT.md')))
      .sort();
    assert.deepStrictEqual(
      Object.keys(policy.agents).sort(),
      agentNames,
      'builtin Codex agent policy is not synchronized with agents/'
    );

    for (const config of Object.values(policy.agents)) {
      assert.ok(['light', 'balanced', 'deep'].includes(config.tier));
      assert.ok(['low', 'medium', 'high', 'max'].includes(config.effort));
    }
    assert.deepStrictEqual(
      { tier: policy.agents.researcher.tier, effort: policy.agents.researcher.effort },
      { tier: 'deep', effort: 'high' }
    );
    assert.deepStrictEqual(
      { tier: policy.agents.housekeeper.tier, effort: policy.agents.housekeeper.effort },
      { tier: 'light', effort: 'high' }
    );
  });

  test('resolves builtin agent conversions through the policy overlay', () => {
    const cases = [
      {
        name: 'researcher',
        sourceModel: 'opus[1m]',
        sourceEffort: 'max',
        expected: { model: 'gpt-5.6-sol', effort: 'high' },
      },
      {
        name: 'housekeeper',
        sourceModel: 'sonnet',
        sourceEffort: 'high',
        expected: { model: 'gpt-5.6-luna', effort: 'high' },
      },
      {
        name: 'unlisted-agent',
        sourceModel: 'sonnet',
        sourceEffort: 'medium',
        expected: { model: 'gpt-5.6-terra', effort: 'medium' },
      },
    ];

    for (const scenario of cases) {
      const result = resolveBuiltinAgent(
        scenario.name,
        scenario.sourceModel,
        scenario.sourceEffort
      );
      assert.strictEqual(result.status, 0, scenario.name);
      assert.deepStrictEqual(JSON.parse(result.stdout), scenario.expected);
    }

    const invalid = resolveBuiltinAgent('researcher', 'unknown-model', 'high');
    assert.notStrictEqual(invalid.status, 0);
    assert.ok(invalid.stderr.includes('No builtin Codex model mapping'));
  });

  test('exact overrides from one component kind do not rewrite the other kind', () => {
    const text = 'Use Terra/high for routine work and Sol/high for escalation.';
    assert.strictEqual(
      applyToText({ agents: { researcher: 'agent-exact' } }, 'skill', 'debug', text),
      text
    );
    assert.strictEqual(
      applyToText({ skills: { ship: 'skill-exact' } }, 'agent', 'researcher', text),
      text
    );
  });

  test('installer delegates builtin model IDs to the policy config', () => {
    const installer = fs.readFileSync(INSTALLER, 'utf8');
    assert.ok(
      !/gpt-5\.6-(?:luna|terra|sol)/.test(installer),
      'install-skills.sh still contains builtin Codex model IDs'
    );
    assert.ok(
      !installer.includes('codex_model_for_agent'),
      'install-skills.sh still owns agent-specific model conversion'
    );
  });

  test('GLM preset uses only GLM 5.3 models at max effort', () => {
    const preset = JSON.parse(fs.readFileSync(GLM_PRESET, 'utf8'));
    assert.strictEqual(preset.effort, 'max');
    assert.deepStrictEqual(preset.translation, {
      light: 'glm-5.3-flash',
      balanced: 'glm-5.3-flash',
      deep: 'glm-5.3',
    });

    const modelValues = Object.values(preset.translation)
      .concat(Object.values(preset.skills || {}), Object.values(preset.agents || {}));
    assert.deepStrictEqual(
      [...new Set(modelValues)].sort(),
      ['glm-5.3', 'glm-5.3-flash']
    );
  });

  test('GLM preset removes built-in GPT model directives from the Codex export', () => {
    const { root } = runInstaller({ extraArgs: ['--model-override', GLM_PRESET] });
    try {
      const files = codexFiles(root);
      assert.ok(files.length > 0, 'installer produced no Codex files');

      const offenders = files.filter((file) => {
        // The standalone runner is the model-policy consumer (its coordinator
        // default names a builtin model); the guard targets exported prose.
        if (file.endsWith('groundwork-run.js')) return false;
        const content = fs.readFileSync(file, 'utf8');
        return /gpt-5\.6-(?:luna|terra|sol)/.test(content);
      });
      assert.deepStrictEqual(
        offenders.map((file) => path.relative(root, file)),
        [],
        'export retained built-in GPT model directives'
      );

      const ship = fs.readFileSync(
        path.join(root, '.codex', 'skills', 'groundwork-ship', 'SKILL.md'),
        'utf8'
      );
      assert.ok(ship.includes('glm-5.3-flash'));
      assert.ok(ship.includes('max'));
      assert.ok(!ship.includes('Luna'));
      assert.ok(!ship.includes('low effort'));

      const validate = fs.readFileSync(
        path.join(root, '.codex', 'skills', 'groundwork-validate', 'SKILL.md'),
        'utf8'
      );
      assert.ok(validate.includes('Use glm-5.3-flash/max for the validation coordinator'));
      assert.ok(validate.includes('closure review rejected the immediately preceding fix'));
      assert.ok(validate.includes('model `glm-5.3`'));
      assert.ok(validate.includes('glm-5.3'));
      assert.ok(!validate.includes('gpt-5.6-sol'));
      assert.ok(!validate.includes('Sol/high'));

      const agentsDir = path.join(root, '.codex', 'agents');
      const agentModels = new Set();
      const efforts = new Set();
      for (const file of fs.readdirSync(agentsDir).filter((name) => name.endsWith('.toml'))) {
        const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
        const model = content.match(/^model = "(.+)"$/m);
        const effort = content.match(/^model_reasoning_effort = "(.+)"$/m);
        assert.ok(model, `${file}: missing model`);
        assert.ok(effort, `${file}: missing effort`);
        agentModels.add(model[1]);
        efforts.add(effort[1]);
      }
      assert.deepStrictEqual([...agentModels].sort(), ['glm-5.3', 'glm-5.3-flash']);
      assert.deepStrictEqual([...efforts], ['max']);
    } finally {
      cleanup(root);
    }
  });

  test('exact skill and agent entries take precedence over tier translation', () => {
    const override = writeJson({
      effort: 'max',
      translation: {
        light: 'translation-light',
        balanced: 'translation-balanced',
        deep: 'translation-deep',
      },
      skills: { ship: 'skill-exact' },
      agents: { researcher: 'agent-exact' },
    });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-model-exact-'));
    try {
      runInstaller({ root, extraArgs: ['--model-override', override] });

      const ship = fs.readFileSync(
        path.join(root, '.codex', 'skills', 'groundwork-ship', 'SKILL.md'),
        'utf8'
      );
      assert.ok(ship.includes('skill-exact'));
      assert.ok(!ship.includes('translation-light'));

      const researcher = fs.readFileSync(
        path.join(root, '.codex', 'agents', 'researcher.toml'),
        'utf8'
      );
      assert.ok(researcher.includes('model = "agent-exact"'));
      assert.ok(researcher.includes('model_reasoning_effort = "max"'));

      const housekeeper = fs.readFileSync(
        path.join(root, '.codex', 'agents', 'housekeeper.toml'),
        'utf8'
      );
      assert.ok(housekeeper.includes('model = "translation-light"'));
    } finally {
      cleanup(root);
      fs.rmSync(path.dirname(override), { recursive: true, force: true });
    }
  });

  test('dry-run validates the override without writing Codex output', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-model-dry-'));
    try {
      const { stdout } = runInstaller({
        root,
        dryRun: true,
        extraArgs: ['--model-override', GLM_PRESET],
      });
      assert.ok(stdout.includes('light: glm-5.3-flash'));
      assert.ok(stdout.includes('effort: max'));
      assert.ok(!fs.existsSync(path.join(root, '.codex')));
    } finally {
      cleanup(root);
    }
  });

  test('requires force when an existing file is changed by an override', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-model-conflict-'));
    const skill = path.join(root, '.codex', 'skills', 'groundwork-ship', 'SKILL.md');
    try {
      fs.mkdirSync(path.dirname(skill), { recursive: true });
      fs.writeFileSync(skill, 'existing export\n');

      const result = spawnSync('bash', [
        INSTALLER,
        '--codex',
        '--project',
        '--model-override',
        GLM_PRESET,
      ], { cwd: root, encoding: 'utf8' });

      assert.notStrictEqual(result.status, 0);
      assert.ok(
        result.stderr.includes('the model override changes it; rerun with --force'),
        `unexpected failure output: ${result.stderr}`
      );
      assert.deepStrictEqual(
        codexFiles(root).map((file) => path.relative(root, file)),
        [path.join('.codex', 'skills', 'groundwork-ship', 'SKILL.md')],
        'conflicting override install partially wrote before failing'
      );
    } finally {
      cleanup(root);
    }
  });

  test('applies the GLM preset to the ZCode export', () => {
    const { root } = runInstaller({ target: 'zcode', extraArgs: ['--model-override', GLM_PRESET] });
    try {
      const validate = fs.readFileSync(
        path.join(root, '.zcode', 'skills', 'groundwork-validate', 'SKILL.md'),
        'utf8'
      );
      assert.ok(validate.includes('glm-5.3'), 'expected pinned glm-5.3 in ZCode export');
      assert.ok(validate.includes('glm-5.3-flash'), 'expected pinned glm-5.3-flash in ZCode export');
      assert.ok(!/\bGLM\b/.test(validate), 'ZCode export kept unpinned GLM family name');
      assert.ok(!/\bGLM-Flash\b/.test(validate), 'ZCode export kept unpinned GLM-Flash family name');
      assert.ok(!/\b(?:Sonnet|Opus|Haiku)\b/.test(validate), 'ZCode export kept Claude model names');

      const researcher = fs.readFileSync(
        path.join(root, '.zcode', 'skills', 'review-researcher', 'SKILL.md'),
        'utf8'
      );
      assert.ok(!/\b(?:Sonnet|Opus|Haiku|GLM-Flash)\b/.test(researcher), 'review agent kept model names');
    } finally {
      cleanup(root);
    }
  });

  test('applies the GLM preset to the OpenCode export', () => {
    const { root } = runInstaller({ target: 'opencode', extraArgs: ['--model-override', GLM_PRESET] });
    try {
      const validate = fs.readFileSync(
        path.join(root, '.opencode', 'skills', 'groundwork-validate', 'SKILL.md'),
        'utf8'
      );
      assert.ok(validate.includes('glm-5.3-flash'), 'expected pinned glm-5.3-flash in OpenCode export');
      assert.ok(!/\b(?:Sonnet|Opus|Haiku)\b/.test(validate), 'OpenCode export kept Claude model names');
    } finally {
      cleanup(root);
    }
  });

  test('applies the GLM preset to a full-copy Claude Code install', () => {
    const { root, stdout } = runInstaller({
      target: 'claude-code',
      extraArgs: ['--allow-manual-claude-code-install', '--model-override', GLM_PRESET],
    });
    try {
      assert.ok(stdout.includes('[override] applied model override'), 'override step not reported');
      const validate = fs.readFileSync(
        path.join(root, '.claude', 'plugins', 'groundwork', 'skills', 'validate', 'SKILL.md'),
        'utf8'
      );
      assert.ok(validate.includes('glm-5.3-flash'), 'expected pinned glm-5.3-flash in Claude Code copy');
      assert.ok(!/\b(?:Sonnet|Opus|Haiku)\b/.test(validate), 'Claude Code copy kept Claude model names');

      const fixer = fs.readFileSync(
        path.join(root, '.claude', 'plugins', 'groundwork', 'agents', 'validation-fixer', 'AGENT.md'),
        'utf8'
      );
      assert.ok(!/\b(?:Sonnet|Opus|Haiku)\b/.test(fixer), 'agent copy kept Claude model names');
    } finally {
      cleanup(root);
    }
  });

  test('applies the override across multiple targets at once', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-model-multi-'));
    const args = [
      INSTALLER,
      '--codex', '--opencode', '--project', '--force',
      '--model-override', GLM_PRESET,
    ];
    try {
      execFileSync('bash', args, {
        cwd: root,
        encoding: 'utf8',
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      for (const base of ['.codex', '.opencode']) {
        const validate = fs.readFileSync(
          path.join(root, base, 'skills', 'groundwork-validate', 'SKILL.md'),
          'utf8'
        );
        assert.ok(validate.includes('glm-5.3'), `${base}: expected pinned glm-5.3`);
      }
    } finally {
      cleanup(root);
    }
  });

  test('rejects invalid keys and overrides that cannot take effect', () => {
    const cases = [
      {
        name: 'unknown top-level key',
        json: { translation: {}, unknown: true },
        message: 'Unknown model override key: unknown',
      },
      {
        name: 'prefixed skill name',
        json: { skills: { 'groundwork-validate': 'model-x' } },
        message: 'Use canonical skill ID validate',
      },
      {
        name: 'skill with no installer-controlled model',
        json: { skills: { handoff: 'model-x' } },
        message: 'Skill model override for handoff has no effect: that skill has no installer-controlled model directive',
      },
      {
        name: 'agent override while installing skills only',
        json: { agents: { researcher: 'model-x' } },
        message: 'Cannot install agent model overrides with --skills-only',
        skillsOnly: true,
      },
    ];

    for (const scenario of cases) {
      const override = writeJson(scenario.json);
      const result = runInstallerFailure({
        skillsOnly: scenario.skillsOnly,
        extraArgs: ['--model-override', override],
      });
      fs.rmSync(path.dirname(override), { recursive: true, force: true });
      assert.notStrictEqual(result.status, 0, scenario.name);
      assert.ok(
        result.stderr.includes(scenario.message),
        `${scenario.name}: unexpected failure output: ${result.stderr}`
      );
    }
  });
});

if (failed > 0) {
  console.error(`\nmodel-override tests: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nmodel-override tests: ${passed} passed`);
