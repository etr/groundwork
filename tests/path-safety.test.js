/**
 * Path-safety guard.
 *
 * Enforces the five invariants that prevent the plan-collision bug class
 * from recurring:
 *   1. Scope by the key that makes a name unique — artifacts keyed on
 *      per-project identifiers (task IDs, feature/bug slugs) must be
 *      project-scoped via template variables, and run-keyed artifacts must
 *      carry a uniqueness suffix.
 *   2. Operational bindings are normalized absolute paths.
 *   3. No fixed shared temp paths for run-scoped data.
 *   4. Fixed mutable state ("active" pointers, owned locks, lease
 *      publications) transitions only through the serialized owned-lock /
 *      lease-mutation protocol with holder identity.
 *   5. Worktree/branch construction routes through the shared
 *      worktree-identity helper — never derived by hand in a skill.
 *
 * Enforcement scope, per rule (docs/developing-skills.md states the same):
 *   - R1 project-scoping/uniqueness: corpus-wide text scan over every
 *     authored surface (skills, agents, references, lib, hooks, bin,
 *     pi-extension, root scripts/docs), plus targeted contract checks for
 *     the journal-authoring skills and the handoff skill.
 *   - R2 absolute bindings: a functional contract check — the resolve CLI
 *     must emit absolute normalized paths (one invocation covers the single
 *     binding-emission path); it is not a corpus text scan.
 *   - R3 fixed shared temp paths: corpus-wide text scan.
 *   - R4 serialized fixed-state transitions: checks against the lock
 *     primitive implementations themselves (owned-lock, lease-mutation,
 *     atomic-write, validation-session, manifest) plus a corpus-wide
 *     prohibition on touching shared pointers outside the approved helper.
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
  const surfaces = ['skills', 'agents', 'references', 'lib', 'hooks', 'bin', 'pi-extension'];
  const walk = (relativeRoot, absoluteDir) => {
    for (const entry of fs.readdirSync(absoluteDir)) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const full = path.join(absoluteDir, entry);
      const relative = `${relativeRoot}/${entry}`;
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(relative, full);
      } else if (stat.isFile() && /\.(js|sh|md|ts)$/.test(entry) && !/\.test\.js$/.test(entry)) {
        targets.push({ name: relative, body: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  for (const surface of surfaces) {
    const absolute = path.join(PLUGIN_ROOT, surface);
    if (fs.existsSync(absolute)) walk(surface, absolute);
  }
  // Authored root-level scripts and docs.
  for (const entry of fs.readdirSync(PLUGIN_ROOT)) {
    const full = path.join(PLUGIN_ROOT, entry);
    if (fs.statSync(full).isFile() && /\.(sh|js|md)$/.test(entry)) {
      targets.push({ name: entry, body: fs.readFileSync(full, 'utf8') });
    }
  }
  return targets;
}

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

describe('reserved directories are project-scoped in skills', () => {

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
    for (const { name, body } of scanTargets()) {
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
    for (const { name, body } of scanTargets()) {
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
    for (const { name, body } of scanTargets()) {
      for (const line of body.split('\n')) {
        if (/plan_file_path\s*=\s*`?\.groundwork-plans\//.test(line)) offenders.push(`${name}: ${line.trim()}`);
      }
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
  test('reserved directories are never addressed by a literal relative shell spelling', () => {
    // The template form is covered above; this catches the equivalent shell
    // spelling of the same violation (`.debug/...` instead of
    // `{{debug_dir}}/...`). Only write contexts count — prose mentions and
    // `.gitignore` maintenance name the directory without addressing an
    // artifact inside it.
    const offenders = [];
    const WRITE_CONTEXT = /mkdir|printf|echo\b|tee\b|\bmv\b|\bcp\b|\brm\b|>>|>|--output\b|\bopen\(|writeFileSync|mkdirSync/;
    const GITIGNORE_MAINTENANCE = /gitignore/i;
    // JS writers address reserved dirs through resolved absolute bindings
    // (path.join(projectRoot, '.debug')), never a CWD-relative literal.
    const JS_RESOLVED_BINDING = /\bjoin\(\s*(?:projectRoot|projectPath|project_root|root)\b|\b(projectRoot|projectPath|debugDir|researchDir|plansDir)\s*[,)]/;
    for (const { name, body } of scanTargets()) {
      for (const line of body.split('\n')) {
        if (
          /(?:^|[\s"'`=(])\.(?:debug|architecture|groundwork-plans)\//.test(line)
          && WRITE_CONTEXT.test(line)
          && !GITIGNORE_MAINTENANCE.test(line)
          && !LEGACY_LINE(line)
          && !(name.endsWith('.js') && JS_RESOLVED_BINDING.test(line))
        ) {
          offenders.push(`${name}: ${line.trim()}`);
        }
      }
    }
    assert.deepStrictEqual(offenders, []);
  });

  test('operational bindings resolve to normalized absolute paths', () => {
    const cli = require('child_process').spawnSync(
      'node',
      [path.join(PLUGIN_ROOT, 'lib', 'project-context-cli.js'), 'resolve', '--harness', 'zcode'],
      { cwd: PLUGIN_ROOT, encoding: 'utf8' }
    );
    assert.strictEqual(cli.status, 0, cli.stderr);
    const bindings = JSON.parse(cli.stdout);
    for (const key of ['project_root', 'debug_dir', 'research_dir']) {
      const value = bindings[key];
      assert.ok(value, `binding ${key} missing`);
      assert.ok(path.isAbsolute(value), `binding ${key} is not absolute: ${value}`);
      assert.strictEqual(value, path.normalize(value), `binding ${key} is not normalized: ${value}`);
    }
  });

  test('the five path-safety invariants are anchored and non-vacuous in the docs', () => {
    const docs = fs.readFileSync(path.join(PLUGIN_ROOT, 'docs', 'developing-skills.md'), 'utf8');
    const invariants = [
      [/project-scoped via template variables?|Scope by the key that makes a name unique/, 'project-keyed artifacts are project-scoped'],
      [/uniqueness suffix|invocation-unique/, 'run-keyed artifacts are invocation-unique'],
      [/absolute normalized path/, 'operational bindings are normalized absolute paths'],
      [/O_EXCL lock|serialized mutation turn/, 'fixed mutable state uses serialized owned-lock transitions'],
      [/worktree-identity\.js/, 'task worktree/branch identity comes from worktree-identity'],
    ];
    for (const [anchor, label] of invariants) {
      assert.match(docs, anchor, `docs/developing-skills.md lost the invariant anchor: ${label}`);
    }
    // Non-vacuity: the guard's corpus genuinely spans every authored
    // surface (not a hand-picked file list), so each rule above is
    // exercised against the whole repository.
    const surfaces = new Set(scanTargets().map(({ name }) => name.split('/')[0]));
    for (const surface of ['skills', 'agents', 'references', 'lib', 'hooks', 'bin', 'pi-extension']) {
      assert.ok(surfaces.has(surface), `the path-safety corpus no longer scans ${surface}/`);
    }
    assert.ok(scanTargets().length >= 130, 'the path-safety corpus suspiciously shrank');
  });

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

// ---------------------------------------------------------------------------
// Invocation-unique debug/research journals: concurrent same-project,
// same-slug work must never share a journal path. The instruction itself has
// to generate a collision-resistant literal path (slug + run identity), pass
// it to every collaborator, return it in the final output, locate prior
// journals by slug prefix on resume, and never erect a shared pointer.
// ---------------------------------------------------------------------------
describe('invocation-unique debug and research journals', () => {
  const JOURNAL_CASES = [
    { file: 'skills/debug/SKILL.md', fixed: '{{debug_dir}}/{slug}.md', prefix: '{{debug_dir}}' },
    { file: 'skills/swarm-debug/SKILL.md', fixed: '{{debug_dir}}/{slug}.md', prefix: '{{debug_dir}}' },
    { file: 'skills/swarm-design-architecture/SKILL.md', fixed: '{{research_dir}}/{slug}-research.md', prefix: '{{research_dir}}' },
  ];

  test('no journal skill instructs a fixed slug-only path', () => {
    for (const { file, fixed } of JOURNAL_CASES) {
      const body = fs.readFileSync(path.join(PLUGIN_ROOT, file), 'utf8');
      const offenders = body
        .split('\n')
        .filter((line) => line.includes(fixed) && !LEGACY_LINE(line));
      assert.deepStrictEqual(
        offenders.map((line) => line.trim()),
        [],
        `${file} still instructs a fixed journal name (concurrent same-slug work would overwrite)`
      );
    }
  });

  test('each journal skill generates a collision-resistant literal path once', () => {
    for (const { file } of JOURNAL_CASES) {
      const body = fs.readFileSync(path.join(PLUGIN_ROOT, file), 'utf8');
      // Run identity: an atomically unique mktemp directory keyed on the
      // slug (mktemp is O_EXCL under the hood, so same-second invocations
      // and PID reuse cannot collide). A timestamp+PID-only contract is
      // rejected — it collides on same-process-same-second and pid reuse.
      assert.match(body, /mktemp -d "\{\{(?:debug|research)_dir\}\}\/\$\{SLUG\}-X{6}"/, `${file} must allocate its journal run directory with mktemp`);
      assert.ok(!/\$\$[-.)]/.test(body), `${file} still uses the pid in its journal identity (pid reuse collides)`);
      // The literal generated path is what collaborators receive.
      assert.match(body, /literal (?:resolved )?(?:journal|path|research)/i, `${file} must pass the literal path to collaborators`);
      // Prior work is found by slug-prefixed run directories, never by a fixed name.
      assert.match(body, /\$\{SLUG\}-\*\//, `${file} must locate prior journal run directories by slug prefix on resume`);
      // Several matches must not be silently resolved.
      assert.match(body, /more than one match|several match/i, `${file} must require a literal path or user selection when several runs match`);
      // No shared "current" pointer.
      assert.ok(
        !/\{\{(?:debug|research)_dir\}\}\/current/.test(body),
        `${file} must never create a shared current pointer`
      );
    }
  });

  test('journal skills return the literal path in their output contract', () => {
    for (const { file } of JOURNAL_CASES) {
      const body = fs.readFileSync(path.join(PLUGIN_ROOT, file), 'utf8');
      assert.match(
        body,
        /final output|handoff output|report the (?:literal )?(?:journal|research) path/i,
        `${file} must return the journal path in its final or handoff output`
      );
    }
  });

  test('the mktemp run-directory contract is collision-proof in the same second and across pid reuse', () => {
    // Same process, same second: two allocations must not collide.
    const base = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gw-journal-'));
    try {
      const { execSync } = require('child_process');
      const first = execSync('mktemp -d "$BASE/login-timeout-XXXXXX"', {
        shell: '/bin/bash', encoding: 'utf8', env: { ...process.env, BASE: base },
      }).trim();
      const second = execSync('mktemp -d "$BASE/login-timeout-XXXXXX"', {
        shell: '/bin/bash', encoding: 'utf8', env: { ...process.env, BASE: base },
      }).trim();
      assert.notStrictEqual(first, second, 'two same-second allocations collided');
      assert.ok(fs.statSync(first).isDirectory());
      assert.ok(fs.statSync(second).isDirectory());
      // Resume contract: slug-prefix matching finds both, in the shell
      // spelling the skills document.
      const matches = fs.readdirSync(base).filter((name) => name.startsWith('login-timeout-'));
      assert.strictEqual(matches.length, 2, `slug-prefix resume glob found ${matches.length}`);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});

describe('fixed shared pointers and lock primitives', () => {
  // A fixed shared pointer (an "active" slot another process rewrites) is
  // only acceptable behind the approved lock primitive. `active.json` is the
  // validation session pointer: code may touch it only in the session
  // helper; protocol documentation is the explicit doc exemption.
  const POINTER_DOCS = new Set(['references/validation-session-protocol.md']);

  test('active pointers appear only in the validation session helper or its protocol doc', () => {
    const offenders = [];
    // A prohibition line ("Never edit ... active.json directly") names the
    // pointer only to forbid touching it — that is the policy itself.
    const PROHIBITION = /never edit|never modify|do not edit|must not|helper-owned/i;
    for (const { name, body } of scanTargets()) {
      if (name === 'lib/validation-session.js') continue;
      if (POINTER_DOCS.has(name)) continue;
      for (const line of body.split('\n')) {
        if (/active\.json/.test(line) && !PROHIBITION.test(line)) {
          offenders.push(`${name}: ${line.trim()}`);
        }
      }
    }
    assert.deepStrictEqual(offenders, []);
  });

  test('every shared-pointer and temporary allocation uses O_EXCL with holder identity', () => {
    const atomicWrite = fs.readFileSync(path.join(PLUGIN_ROOT, 'lib', 'atomic-write.js'), 'utf8');
    assert.match(atomicWrite, /openSync\(temporary, 'wx'/, 'atomic temporaries must be O_EXCL');
    assert.match(atomicWrite, /randomBytes/, 'atomic temporaries must carry cryptographic uniqueness');
    const ownedLock = fs.readFileSync(path.join(PLUGIN_ROOT, 'lib', 'owned-lock.js'), 'utf8');
    assert.match(ownedLock, /openSync\(lockFile, 'wx'/, 'owned locks must be O_EXCL');
    assert.match(ownedLock, /processStart/, 'owned locks must record holder process identity');
    assert.match(ownedLock, /withMutationTurn/, 'owned-lock transitions must run in a serialized mutation turn');
    const session = fs.readFileSync(path.join(PLUGIN_ROOT, 'lib', 'validation-session.js'), 'utf8');
    // The session open lock delegates to owned-lock (single O_EXCL/identity
    // implementation) instead of carrying its own lockfile creation.
    assert.match(session, /acquireOwnedLock/, 'the session open lock must delegate to owned-lock');
    const leaseMutation = fs.readFileSync(path.join(PLUGIN_ROOT, 'lib', 'lease-mutation.js'), 'utf8');
    assert.match(leaseMutation, /openSync\(stagingPath, 'wx'/, 'mutation tickets must be O_EXCL staged');
    assert.match(leaseMutation, /randomBytes/, 'mutation tickets must carry cryptographic uniqueness');
  });

  test('runtime export closure ships the locking primitives', () => {
    const manifest = JSON.parse(
      require('child_process').execFileSync(
        'node',
        [path.join(PLUGIN_ROOT, 'lib', 'external-runner-manifest.js'), '--json'],
        { encoding: 'utf8' }
      )
    );
    const installed = new Set(manifest.map((entry) => entry.installed));
    for (const helper of ['atomic-write.js', 'owned-lock.js', 'process-identity.js', 'validation-session.js']) {
      assert.ok(installed.has(helper), `the runner export is missing lock primitive ${helper}`);
    }
    const installer = fs.readFileSync(path.join(PLUGIN_ROOT, 'install-skills.sh'), 'utf8');
    assert.ok(
      installer.includes('external-runner-manifest.js'),
      'the installer must export the runner runtime from the checked manifest, not a hand list'
    );
  });

  test('accepted single-writer boundaries remain unchanged', () => {
    // Fixed collaborative spec files stay intentionally single-writer per
    // project: spec artifacts are addressed through {{specs_dir}}, and task
    // claiming stays a loud Git branch/worktree collision via the shared
    // identity helper — never a claim marker in the base checkout.
    const claimMarkingOffenders = [];
    for (const { name, body } of scanTargets()) {
      if (!/^skills\/|^\agents\//.test(name)) continue;
      if (/touch .*\.groundwork.*claim|claim[-_]marker/.test(body)) claimMarkingOffenders.push(name);
    }
    assert.deepStrictEqual(claimMarkingOffenders, []);
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
