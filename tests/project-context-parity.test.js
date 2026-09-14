/**
 * Parity tests: the pi-extension config-parser mirror cannot drift from the
 * canonical lib/project-context.js grammar.
 *
 * pi-extension/lib/project-context-core.js intentionally ships a
 * dependency-free verbatim mirror of the strict .groundwork.yml parser and
 * project-mapping validator (the standalone-shipping constraint is a
 * documented decision). This suite feeds BOTH implementations the same
 * corpus of valid/invalid/overlapping configs and asserts identical
 * ok/code/message outcomes, so a grammar or overlap-rule change in one copy
 * fails CI instead of shipping a divergent fail-closed config contract.
 *
 * Run with: node tests/project-context-parity.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CANONICAL = path.resolve(__dirname, '..', 'lib', 'project-context.js');
const MIRROR = path.resolve(__dirname, '..', 'pi-extension', 'lib', 'project-context-core.js');

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

// The shared corpus. `expect` documents each fixture's intended
// classification, so the corpus cannot silently degrade into cases where
// both parsers trivially agree; the equality assertion then pins the mirror
// to the canonical outcome — including exact message wording.
const PARSE_CORPUS = [
  {
    label: 'canonical single project',
    expect: { ok: true },
    content: 'version: 1\nprojects:\n  api:\n    path: api\n',
  },
  {
    label: 'canonical two projects',
    expect: { ok: true },
    content: 'version: 1\nprojects:\n  api:\n    path: api\n  web:\n    path: services/web\n',
  },
  {
    label: 'comments and blank lines are ignored',
    expect: { ok: true },
    content: '# header\n\nversion: 1\n# note\nprojects:\n\n  api:\n    path: api\n# tail\n',
  },
  {
    label: 'empty content',
    expect: { code: 'empty-config' },
    content: '',
  },
  {
    label: 'whitespace-only content',
    expect: { code: 'empty-config' },
    content: '   \n\t\n',
  },
  {
    label: 'unsupported version',
    expect: { code: 'unsupported-version' },
    content: 'version: 2\nprojects:\n  api:\n    path: api\n',
  },
  {
    label: 'missing version line',
    expect: { code: 'malformed-yaml' },
    content: 'projects:\n  api:\n    path: api\n',
  },
  {
    label: 'missing projects mapping',
    expect: { code: 'malformed-yaml' },
    content: 'version: 1\n',
  },
  {
    label: 'projects before version',
    expect: { code: 'malformed-yaml' },
    content: 'projects:\nversion: 1\n',
  },
  {
    label: 'duplicate version line',
    expect: { code: 'malformed-yaml' },
    content: 'version: 1\nversion: 1\nprojects:\n  api:\n    path: api\n',
  },
  {
    label: 'duplicate project key',
    expect: { code: 'malformed-yaml' },
    content: 'version: 1\nprojects:\n  api:\n    path: api\n  api:\n    path: web\n',
  },
  {
    label: 'duplicate path property',
    expect: { code: 'malformed-yaml' },
    content: 'version: 1\nprojects:\n  api:\n    path: api\n    path: web\n',
  },
  {
    label: 'unknown property under a project',
    expect: { code: 'malformed-yaml' },
    content: 'version: 1\nprojects:\n  api:\n    path: api\n    other: x\n',
  },
  {
    label: 'list-style entries are not the canonical mapping',
    expect: { code: 'malformed-yaml' },
    content: 'version: 1\nprojects:\n  - name: web\n    path: web\n',
  },
  {
    label: 'indented top-level key',
    expect: { code: 'malformed-yaml' },
    content: 'version: 1\n  projects:\n',
  },
  {
    label: 'unknown top-level key',
    expect: { code: 'malformed-yaml' },
    content: 'version: 1\nprojects:\n  api:\n    path: api\nextra: true\n',
  },
  {
    label: 'absolute project path',
    expect: { code: 'escaping-project-path' },
    content: 'version: 1\nprojects:\n  api:\n    path: /etc\n',
  },
  {
    label: 'parent-relative project path',
    expect: { code: 'escaping-project-path' },
    content: 'version: 1\nprojects:\n  api:\n    path: ../outside\n',
  },
  {
    label: 'project without a path',
    expect: { code: 'missing-project-path' },
    content: 'version: 1\nprojects:\n  api:\n',
  },
  {
    label: 'project key starting with a dash',
    expect: { code: 'malformed-yaml' },
    content: 'version: 1\nprojects:\n  -api:\n    path: api\n',
  },
  {
    label: 'version with trailing space is trimmed and accepted',
    expect: { ok: true },
    content: 'version: 1 \nprojects:\n  api:\n    path: api\n',
  },
  {
    label: 'non-numeric version',
    expect: { code: 'malformed-yaml' },
    content: 'version: one\nprojects:\n  api:\n    path: api\n',
  },
];

describe('parse corpus parity (canonical parser vs pi-extension mirror)', () => {
  const canonical = require(CANONICAL).parseConfigResult;
  const mirror = require(MIRROR).parseGroundworkYmlResult;

  for (const fixture of PARSE_CORPUS) {
    test(`both parsers classify: ${fixture.label}`, () => {
      const reference = canonical(fixture.content);
      // The corpus documents its intent: the canonical parser is the
      // ground truth for the classification itself.
      assert.strictEqual(reference.ok, !fixture.expect.code,
        `canonical classification drifted: ${JSON.stringify(reference)}`);
      if (fixture.expect.code) assert.strictEqual(reference.code, fixture.expect.code);
      // Parity: the mirror must produce the byte-identical outcome,
      // including the typed code and exact message wording.
      assert.deepStrictEqual(mirror(fixture.content), reference);
    });
  }
});

describe('project-mapping validation parity (overlap and escape rules)', () => {
  const canonical = require(CANONICAL).validateProjectMapping;
  const mirror = require(MIRROR).validateProjectMapping;

  function mappingFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-config-parity-'));
    // A real directory OUTSIDE the repository root, so the escaping symlink
    // resolves (a dangling ENOENT target is lawfully tolerated unrealpathed).
    const outside = `${root}-outside`;
    fs.mkdirSync(outside);
    fs.mkdirSync(path.join(root, 'api'));
    fs.mkdirSync(path.join(root, 'web'), { recursive: true });
    fs.mkdirSync(path.join(root, 'api', 'packages', 'core'), { recursive: true });
    fs.symlinkSync(path.join(root, 'api'), path.join(root, 'alias'));
    fs.symlinkSync(outside, path.join(root, 'escape'));
    return { root, cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    } };
  }

  const CASES = [
    {
      label: 'disjoint project trees pass',
      projects: { api: { path: 'api' }, web: { path: 'web' } },
      expect: { ok: true },
    },
    {
      label: 'lexically nested project trees are rejected',
      projects: { api: { path: 'api' }, core: { path: 'api/packages/core' } },
      expect: { code: 'overlapping-project-path' },
    },
    {
      label: 'identical paths under two names are rejected',
      projects: { one: { path: 'api' }, two: { path: 'api' } },
      expect: { code: 'overlapping-project-path' },
    },
    {
      label: 'symlink-aliased trees are rejected after realpath',
      projects: { api: { path: 'api' }, aliased: { path: 'alias' } },
      expect: { code: 'overlapping-project-path' },
    },
    {
      label: 'a realpath escaping the repository is rejected',
      projects: { bad: { path: 'escape' }, web: { path: 'web' } },
      expect: { code: 'overlapping-project-path' },
    },
    {
      label: 'genuinely missing paths may pass unrealpathed',
      projects: { ghost: { path: 'does/not/exist' }, other: { path: 'web' } },
      expect: { ok: true },
    },
  ];

  for (const testCase of CASES) {
    test(`both validators classify: ${testCase.label}`, () => {
      const { root, cleanup } = mappingFixture();
      try {
        const config = { version: 1, projects: testCase.projects };
        const reference = canonical(config, root);
        assert.strictEqual(reference.ok, !testCase.expect.code,
          `canonical classification drifted: ${JSON.stringify(reference)}`);
        if (testCase.expect.code) assert.strictEqual(reference.code, testCase.expect.code);
        assert.deepStrictEqual(mirror(config, root), reference);
      } finally {
        cleanup();
      }
    });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
