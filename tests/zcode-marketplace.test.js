/**
 * Tests for the ZCode marketplace bundle (build-zcode-marketplace.sh).
 *
 * The bundle is the translated zcode-plugin export packaged as a marketplace
 * whose plugin root is the marketplace root. These tests guard the packaging
 * contract ZCode relies on: manifest shape/name rules, native agents/*.md
 * discovery, hooks limited to ZCode's seven supported events, and no
 * Claude-Code-only leakage in the generated tree.
 *
 * Run with: node tests/zcode-marketplace.test.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const AGENTS_DIR = path.join(PLUGIN_ROOT, 'agents');
const BUILD_SCRIPT = path.join(PLUGIN_ROOT, 'build-zcode-marketplace.sh');

const ZCODE_EVENTS = new Set([
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
]);

const CLAUDE_ARTIFACTS =
  /\b(?:Opus|Sonnet|Haiku|Fable)\b|opus\[1m\]|\/effort high|\/model (?:sonnet|opus)/;

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

function allFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allFiles(full));
    else out.push(full);
  }
  return out;
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

// --- Build the bundle once into a temp dir -----------------------------------

let bundle = null;
try {
  execFileSync('bash', ['-c', 'exit 0'], { stdio: 'ignore' });
} catch {
  bundle = null; // no bash — everything below skips
}

describe('ZCode marketplace bundle', () => {
  test('builds without errors', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-zcode-mkt-'));
    bundle = path.join(tmp, 'bundle');
    const stdout = execFileSync('bash', [BUILD_SCRIPT, bundle], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.ok(fs.existsSync(path.join(bundle, 'marketplace.json')), 'no marketplace.json');
    assert.ok(
      stdout.includes(`Agents: ${agentDirs().length}`),
      `unexpected agent count in build output: ${stdout}`
    );
  });

  test('marketplace.json points the plugin at the marketplace root', () => {
    if (bundle === null) return;
    const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'marketplace.json'), 'utf8'));
    assert.match(manifest.name, /^[a-z0-9][a-z0-9._-]{0,127}$/);
    assert.notStrictEqual(manifest.name, 'zcode-plugins-official');
    assert.strictEqual(manifest.plugins.length, 1);
    const entry = manifest.plugins[0];
    assert.strictEqual(entry.name, 'groundwork');
    assert.strictEqual(entry.source, './');
    assert.match(entry.version, /^\d+\.\d+\.\d+$/);
  });

  test('plugin manifest is valid and carries the source version', () => {
    if (bundle === null) return;
    const plugin = JSON.parse(
      fs.readFileSync(path.join(bundle, '.zcode-plugin', 'plugin.json'), 'utf8')
    );
    const source = JSON.parse(
      fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
    );
    assert.match(plugin.name, /^[a-z0-9][a-z0-9._-]{0,127}$/);
    assert.strictEqual(plugin.name, 'groundwork');
    assert.strictEqual(plugin.version, source.version);
    assert.strictEqual(plugin.skills, 'skills');
  });

  test('exports skills with ZCode-compatible frontmatter', () => {
    if (bundle === null) return;
    const skillFiles = allFiles(path.join(bundle, 'skills')).filter(
      (file) => path.basename(file) === 'SKILL.md'
    );
    assert.ok(skillFiles.length > 0, 'bundle produced no skills');

    for (const file of skillFiles) {
      const rel = path.relative(bundle, file);
      const text = fs.readFileSync(file, 'utf8');
      const description = frontmatterValue(text, 'description');
      assert.ok(description !== undefined, `${rel}: missing description`);
      assert.ok(
        description.length <= 1024,
        `${rel}: description is ${description.length} chars (ZCode drops skills over 1024)`
      );
      const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);
      const keys = frontmatter[1]
        .split('\n')
        .map((line) => line.match(/^([A-Za-z-]+):/))
        .filter(Boolean)
        .map((match) => match[1]);
      assert.deepStrictEqual(
        keys.slice().sort(),
        ['description', 'name'],
        `${rel}: unexpected frontmatter keys`
      );
      assert.strictEqual(
        frontmatterValue(text, 'name'),
        path.basename(path.dirname(file)),
        `${rel}: frontmatter name does not match its directory`
      );
    }
  });

  test('exports every agent natively exactly once, with no review-* shim', () => {
    if (bundle === null) return;
    const expected = agentDirs();
    const agentFiles = fs
      .readdirSync(path.join(bundle, 'agents'))
      .filter((name) => name.endsWith('.md'))
      .map((name) => name.replace(/\.md$/, ''))
      .sort();
    assert.deepStrictEqual(agentFiles, expected);

    for (const name of expected) {
      const rel = path.join(bundle, 'agents', `${name}.md`);
      const text = fs.readFileSync(rel, 'utf8');
      assert.strictEqual(frontmatterValue(text, 'name'), name, `${rel}: name mismatch`);
      const source = fs.readFileSync(path.join(AGENTS_DIR, name, 'AGENT.md'), 'utf8');
      assert.strictEqual(
        frontmatterValue(text, 'description'),
        frontmatterValue(source, 'description'),
        `${rel}: description drifted from the source agent`
      );
    }

    const shim = fs
      .readdirSync(path.join(bundle, 'skills'))
      .filter((name) => name.startsWith('review-'));
    assert.deepStrictEqual(shim, [], `review-* agent skills leaked into the plugin: ${shim}`);
  });

  test('inlines agent references as appendices', () => {
    if (bundle === null) return;
    const reviewer = fs.readFileSync(
      path.join(bundle, 'agents', 'code-quality-reviewer.md'),
      'utf8'
    );
    assert.ok(reviewer.includes('## Appendix: validation-review-protocol'));
    assert.ok(reviewer.includes('## Appendix: clean-code-principles'));
    assert.ok(reviewer.includes('the validation-review-protocol appendix below'));
    assert.ok(!reviewer.includes('${CLAUDE_PLUGIN_ROOT}/references'));
  });

  test('skill bodies delegate to native agents', () => {
    if (bundle === null) return;
    const justDoIt = fs.readFileSync(
      path.join(bundle, 'skills', 'groundwork-just-do-it', 'SKILL.md'),
      'utf8'
    );
    assert.ok(justDoIt.includes('Spawn the `task-executor` agent'));
    assert.ok(!justDoIt.includes('review-task-executor'));
  });

  test('hooks are limited to ZCode-supported events and reference shipped scripts', () => {
    if (bundle === null) return;
    const hooks = JSON.parse(fs.readFileSync(path.join(bundle, 'hooks', 'hooks.json'), 'utf8'));
    for (const event of Object.keys(hooks.hooks || {})) {
      assert.ok(
        ZCODE_EVENTS.has(event),
        `${event} is not a ZCode hook event (supported: ${[...ZCODE_EVENTS].join(', ')})`
      );
    }
    assert.ok(hooks.hooks.SessionStart, 'SessionStart hook missing');
    assert.ok(hooks.hooks.PostToolUse, 'PostToolUse hook missing');

    for (const entries of Object.values(hooks.hooks)) {
      for (const entry of entries) {
        for (const hook of entry.hooks || []) {
          const command = hook.command || '';
          const pluginRoot = command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9._/-]+)/);
          assert.ok(pluginRoot, `hook command does not use \${CLAUDE_PLUGIN_ROOT}: ${command}`);
          const target = path.join(bundle, ...pluginRoot[1].split('/'));
          assert.ok(
            fs.existsSync(target),
            `hook references ${pluginRoot[1]} which is not in the bundle`
          );
        }
      }
    }
  });

  test('ships the lib/ runtime the hook scripts resolve', () => {
    if (bundle === null) return;
    const sessionStart = fs.readFileSync(path.join(bundle, 'hooks', 'session-start.sh'), 'utf8');
    const referenced = [...sessionStart.matchAll(/PLUGIN_ROOT\/lib\/([A-Za-z0-9._-]+\.js)/g)].map(
      (m) => m[1]
    );
    for (const lib of referenced) {
      assert.ok(
        fs.existsSync(path.join(bundle, 'lib', lib)),
        `session-start.sh references lib/${lib} which is not in the bundle`
      );
    }
    assert.ok(
      !fs.existsSync(path.join(bundle, 'lib', 'inject-specs.test.js')),
      'test files leaked into the bundle lib/'
    );
  });

  test('carries the GLM wording and no Claude-Code-only artifacts', () => {
    if (bundle === null) return;
    const offenders = allFiles(bundle).filter((file) =>
      CLAUDE_ARTIFACTS.test(fs.readFileSync(file, 'utf8'))
    );
    assert.deepStrictEqual(
      offenders,
      [],
      `bundle retained Claude model names or switch commands:\n  ${offenders.join('\n  ')}`
    );

    const workOn = fs.readFileSync(
      path.join(bundle, 'skills', 'groundwork-work-on', 'SKILL.md'),
      'utf8'
    );
    assert.ok(workOn.includes('you are on GLM with reasoning at max'));
    assert.ok(workOn.includes('GLM-Flash'));
  });

  test('refuses to overwrite a directory that is not a previous bundle', () => {
    if (bundle === null) return;
    const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-zcode-mkt-foreign-'));
    fs.writeFileSync(path.join(foreign, 'important.txt'), 'keep me');
    let threw = null;
    try {
      execFileSync('bash', [BUILD_SCRIPT, foreign], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      threw = error;
    }
    assert.ok(threw, 'build script overwrote a foreign directory');
    assert.match(
      String(threw.stderr || threw.message),
      /not a previously built bundle/,
      'refusal reason not reported'
    );
    assert.ok(fs.existsSync(path.join(foreign, 'important.txt')), 'guard destroyed a foreign dir');
  });
});

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
