/**
 * Repo-wide path-safety guard.
 *
 * Enforces the three invariants that prevent the plan-collision bug class
 * from recurring:
 *   1. Scope by the key that makes a name unique — artifacts keyed on
 *      per-project identifiers (task IDs, feature/bug slugs) must be
 *      project-scoped via template vars, and run-keyed artifacts must carry
 *      a uniqueness suffix.
 *   2. No fixed shared temp paths for run-scoped data.
 *   3. Worktree/branch construction routes through the shared
 *      worktree-identity helper — never derived by hand in a skill.
 *
 * Run with: node tests/path-safety.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

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

function skillBodies() {
  const skillsDir = path.join(PLUGIN_ROOT, 'skills');
  const bodies = [];
  for (const entry of fs.readdirSync(skillsDir)) {
    const skillPath = path.join(skillsDir, entry, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      bodies.push({ name: entry, body: fs.readFileSync(skillPath, 'utf8') });
    }
  }
  return bodies;
}

function scanTargets() {
  const targets = [];
  for (const dir of ['skills', 'agents', 'lib', 'hooks', 'bin']) {
    const absolute = path.join(PLUGIN_ROOT, dir);
    if (!fs.existsSync(absolute)) continue;
    for (const entry of fs.readdirSync(absolute)) {
      if (entry.endsWith('.test.js')) continue;
      const full = path.join(absolute, entry);
      const stat = fs.statSync(full);
      if (stat.isFile() && /\.(js|sh|md)$/.test(entry)) {
        targets.push({ name: `${dir}/${entry}`, body: fs.readFileSync(full, 'utf8') });
      } else if (stat.isDirectory() && dir === 'skills') {
        const skillPath = path.join(full, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          targets.push({ name: `skills/${entry}/SKILL.md`, body: fs.readFileSync(skillPath, 'utf8') });
        }
      }
    }
  }
  return targets;
}

describe('reserved directories are project-scoped in skills', () => {
  // A mention of the unscoped form is exempt only when the line is a genuine
  // one-time migration instruction: it must name the legacy location
  // (legacy / migration / unscoped) AND move the file into the scoped
  // template destination (`mv ... {{debug_dir}}` / `{{research_dir}}`) or
  // explicitly withdraw the legacy location from use. A bare keyword
  // ("# legacy", "fallback:") must NOT exempt a live unscoped write — that
  // is the exact regression this guard exists to catch.
  const LEGACY_KEYWORD = /legacy|migration|unscoped/;
  const MIGRATION_FORM =
    /mv[^\n]*\{\{(?:debug|research)_dir\}\}|\{\{(?:debug|research)_dir\}\}[^\n]*\bmv\b|legacy location/;
  const LEGACY_LINE = (line) => LEGACY_KEYWORD.test(line) && MIGRATION_FORM.test(line);

  test('the legacy exemption cannot be bypassed by a bare keyword', () => {
    // Live unscoped writes that merely carry an exempt-looking word stay
    // flagged (LEGACY_LINE returns false → the guard reports them).
    for (const live of [
      'mkdir -p .debug/{slug}.md # legacy',
      'legacy repos: journal to .debug/{slug}.md',
      'fallback: write `.debug/{slug}.md` if {{debug_dir}} is unset',
    ]) {
      assert.ok(!LEGACY_LINE(live), `bare keyword exempted a live write: ${live}`);
    }
    // The genuine migration sentence in skills/debug/SKILL.md stays exempt.
    const debug = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', 'debug', 'SKILL.md'), 'utf8');
    const migrationLines = debug
      .split('\n')
      .filter((line) => /\.debug\/\{slug\}\.md/.test(line) && /legacy|migration|unscoped/.test(line));
    assert.ok(migrationLines.length > 0, 'no migration sentence found to protect');
    for (const line of migrationLines) {
      assert.ok(LEGACY_LINE(line), `migration sentence lost its exemption: ${line}`);
    }
  });

  test('debug journals are written via {{debug_dir}}', () => {
    const offenders = [];
    for (const { name, body } of skillBodies()) {
      for (const line of body.split('\n')) {
        if (/\.debug\/\{slug\}\.md/.test(line) && !LEGACY_LINE(line)) {
          offenders.push(`${name}: ${line.trim()}`);
        }
      }
    }
    assert.deepStrictEqual(offenders, []);
  });

  test('research journals are written via {{research_dir}}', () => {
    const offenders = [];
    for (const { name, body } of skillBodies()) {
      for (const line of body.split('\n')) {
        if (/\.architecture\/\{slug\}-research\.md/.test(line) && !LEGACY_LINE(line)) {
          offenders.push(`${name}: ${line.trim()}`);
        }
      }
    }
    assert.deepStrictEqual(offenders, []);
  });

  test('plan paths are written via {{plans_dir}}', () => {
    const offenders = [];
    for (const { name, body } of skillBodies()) {
      if (/plan_file_path\s*=\s*`?\.groundwork-plans\//.test(body)) offenders.push(name);
    }
    assert.deepStrictEqual(offenders, []);
  });
});

describe('run-keyed artifacts carry uniqueness', () => {
  test('handoff output paths include a per-invocation suffix', () => {
    const handoff = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', 'handoff', 'SKILL.md'), 'utf8');
    assert.ok(
      /groundwork-handoff-\$\{SLUG\}-\$\(date \+%Y%m%d%H%M%S\)-\$\$\.md/.test(handoff),
      'handoff OUT path must end in a timestamp+PID suffix'
    );
    // No unsuffixed construction anywhere in the skill.
    assert.ok(!/groundwork-handoff-\$\{SLUG\}\.md/.test(handoff));
  });

  test('no fixed shared /tmp paths for run-scoped data anywhere', () => {
    const offenders = [];
    for (const { name, body } of scanTargets()) {
      for (const pattern of [/\/tmp\/groundwork-validation/, /claude-groundwork['"`/]'/]) {
        if (pattern.test(body)) offenders.push(`${name}: ${pattern}`);
      }
    }
    assert.deepStrictEqual(offenders, []);
  });
});

describe('worktree and branch construction routes through the helper', () => {
  test('no skill or agent hardcodes a task branch into a worktree-add command', () => {
    const offenders = [];
    for (const { name, body } of skillBodies()) {
      if (/git worktree add -b task\//.test(body)) offenders.push(name);
    }
    const agentsDir = path.join(PLUGIN_ROOT, 'agents');
    for (const entry of fs.readdirSync(agentsDir)) {
      const agentPath = path.join(agentsDir, entry, 'AGENT.md');
      if (fs.existsSync(agentPath)) {
        const body = fs.readFileSync(agentPath, 'utf8');
        if (/git worktree add -b task\//.test(body)) offenders.push(`agents/${entry}`);
      }
    }
    assert.deepStrictEqual(offenders, []);
  });

  test('use-git-worktree resolves identity via the shared helper', () => {
    const skill = fs.readFileSync(
      path.join(PLUGIN_ROOT, 'skills', 'use-git-worktree', 'SKILL.md'),
      'utf8'
    );
    assert.ok(skill.includes('lib/worktree-identity.js'));
    assert.ok(skill.includes('project-qualified'));
  });
});

describe('template-variable wiring', () => {
  test('resolver emits {{debug_dir}} and {{research_dir}}', () => {
    const resolver = fs.readFileSync(path.join(PLUGIN_ROOT, 'lib', 'resolve-template-vars.js'), 'utf8');
    assert.ok(resolver.includes('- {{debug_dir}} = ${debugDir}'));
    assert.ok(resolver.includes('- {{research_dir}} = ${researchDir}'));
  });

  test('session-start bindings emit both variables', () => {
    const hook = fs.readFileSync(path.join(PLUGIN_ROOT, 'hooks', 'session-start.sh'), 'utf8');
    assert.ok(hook.includes("'- {{debug_dir}} = ' + getDebugDir()"));
    assert.ok(hook.includes("'- {{research_dir}} = ' + getResearchDir()"));
  });

  test('portable CLI bindings include both variables', () => {
    const cli = fs.readFileSync(path.join(PLUGIN_ROOT, 'lib', 'project-context-cli.js'), 'utf8');
    assert.ok(cli.includes("debug_dir: path.join(projectRoot, '.debug')"));
    assert.ok(cli.includes("research_dir: path.join(projectRoot, '.architecture')"));
  });

  test('installer content gate recognizes both variables', () => {
    const installer = fs.readFileSync(path.join(PLUGIN_ROOT, 'install-skills.sh'), 'utf8');
    assert.ok(installer.includes("*'{{debug_dir}}'*"));
    assert.ok(installer.includes("*'{{research_dir}}'*"));
  });
});

describe('repo slug encoding (D2)', () => {
  test('distinct repo roots map to distinct encoded slugs', () => {
    const { encodeRepoSlug } = require(path.join(PLUGIN_ROOT, 'lib', 'project-context'));
    // '/a/b' and '/a_b' collided under the legacy '/':'_' mapping.
    assert.notStrictEqual(encodeRepoSlug('/a/b'), encodeRepoSlug('/a_b'));
    assert.strictEqual(encodeRepoSlug('/a/b'), '%2Fa%2Fb');
    assert.strictEqual(encodeRepoSlug('/a_b'), '%2Fa_b');
    assert.strictEqual(encodeRepoSlug('/50%/mix'), '%2F50%25%2Fmix');
  });

  test('pane restore dual-reads the legacy slug form', () => {
    const fs = require('fs');
    const os = require('os');
    const ctx = require(path.join(PLUGIN_ROOT, 'lib', 'project-context'));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-slug-'));
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-slug-repo-'));
    const projectRoot = path.join(repo, 'apps', 'web');
    fs.mkdirSync(projectRoot, { recursive: true });
    try {
      const env = { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude') };
      for (const name of ['GROUNDWORK_HARNESS', 'ZCODE_HOME', 'CODEX_HOME']) delete env[name];
      const panesDir = path.join(home, '.claude', 'groundwork-state', 'panes');
      const payload = JSON.stringify({
        project: 'web', root: projectRoot, timestamp: Math.floor(Date.now() / 1000),
      });
      // Legacy-form file (old writer): restore must still find it.
      fs.mkdirSync(panesDir, { recursive: true });
      fs.writeFileSync(
        path.join(panesDir, `pts_9__${ctx.legacyRepoSlug(repo)}.json`),
        payload
      );
      const restoredLegacy = require('child_process').spawnSync('node', ['-e', `
        const ctx = require(${JSON.stringify(path.join(PLUGIN_ROOT, 'lib', 'project-context'))});
        const s = ctx.restorePaneSelection('pts_9', ${JSON.stringify(repo)});
        if (s) console.log(JSON.stringify(s));
      `], { env, encoding: 'utf8' });
      assert.strictEqual(restoredLegacy.status, 0, restoredLegacy.stderr);
      const legacy = restoredLegacy.stdout.trim() ? JSON.parse(restoredLegacy.stdout) : null;
      assert.ok(legacy, 'restore did not find the legacy-form pane selection');
      assert.strictEqual(legacy.projectName, 'web');

      // Current writer emits the encoded form only.
      fs.rmSync(path.join(panesDir, `pts_9__${ctx.legacyRepoSlug(repo)}.json`));
      const written = require('child_process').spawnSync('node', ['-e', `
        const ctx = require(${JSON.stringify(path.join(PLUGIN_ROOT, 'lib', 'project-context'))});
        ctx.persistPaneSelection('pts_9', ${JSON.stringify(repo)}, 'web', ${JSON.stringify(projectRoot)}, null);
      `], { env, encoding: 'utf8' });
      assert.strictEqual(written.status, 0, written.stderr);
      assert.ok(
        fs.existsSync(path.join(panesDir, `pts_9__${ctx.encodeRepoSlug(repo)}.json`)),
        'encoded pane file missing'
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
