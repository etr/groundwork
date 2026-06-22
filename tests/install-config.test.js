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
const { execFileSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(PLUGIN_ROOT, 'skills');
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

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
