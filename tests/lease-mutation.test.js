/**
 * Tests for lib/lease-mutation.js fail-closed queue validation.
 *
 * The mutation queue serializes every fixed-lock transition, so a malformed
 * or tampered queue entry must be rejected with its documented typed error —
 * never silently skipped, never auto-repaired — and a rejected turn must not
 * disturb queue state. These tests pin every documented rejection:
 * inspectMutationEntry's invalid/unsafe/invalid-ownership failures and the
 * 4KiB bound (driven through acquireLeaseMutation, the public turn entry),
 * mutationEntries' invalid-filename rejection, and
 * createContainedDirectory's symlink/outside/non-directory containment
 * refusals.
 *
 * Run with: node tests/lease-mutation.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LEASE_MUTATION = path.resolve(__dirname, '..', 'lib', 'lease-mutation.js');

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

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gw-lease-mutation-'));
}

// Full file-tree snapshot (path -> content or symlink target) so a failed
// turn can be proven not to disturb queue state.
function snapshot(root) {
  const files = {};
  if (!fs.existsSync(root)) return files;
  const walk = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      const stat = fs.lstatSync(file);
      const relative = path.relative(root, file);
      if (stat.isSymbolicLink()) files[relative] = `symlink:${fs.readlinkSync(file)}`;
      else if (stat.isDirectory()) walk(file);
      else files[relative] = fs.readFileSync(file, 'utf8');
    }
  };
  walk(root);
  return files;
}

// A mutation queue layout as acquireLeaseMutation would find it, with the
// tickets directory pre-seeded per case.
function queueFixture(entry) {
  const parent = tmp();
  const mutationRoot = path.join(parent, 'queue');
  const mutationDirectory = path.join(mutationRoot, '.lease-mutation');
  const choosing = path.join(mutationDirectory, 'choosing');
  const tickets = path.join(mutationDirectory, 'tickets');
  fs.mkdirSync(choosing, { recursive: true });
  fs.mkdirSync(tickets, { recursive: true });
  if (entry) {
    const name = entry.name || `${'a'.repeat(48)}.lock`;
    const target = path.join(tickets, name);
    if (entry.symlinkTo) {
      fs.symlinkSync(entry.symlinkTo, target);
    } else {
      fs.writeFileSync(target, entry.content);
    }
  }
  return { parent, mutationRoot, tickets };
}

function queueRecord(overrides = {}, token = 'a'.repeat(48)) {
  return JSON.stringify({
    version: 1,
    pid: 424_242,
    processStart: 'recorded-identity',
    token,
    ticket: 7,
    startedAt: 1,
    ...overrides,
  });
}

describe('queue entry validation (fail-closed, driven through acquireLeaseMutation)', () => {
  const CASES = [
    {
      label: 'a non-JSON entry is rejected as invalid',
      entry: { content: 'this is not json{' },
      message: /Repository lease mutation entry is invalid: .*\.lease-mutation[/\\]tickets[/\\]a{48}\.lock$/,
    },
    {
      label: 'an entry whose token disagrees with its filename is rejected as invalid ownership',
      entry: { content: queueRecord({}, 'b'.repeat(48)) },
      message: /Repository lease mutation entry has invalid ownership: /,
    },
    {
      label: 'an entry with an out-of-range pid is rejected as invalid ownership',
      entry: { content: queueRecord({ pid: 0 }) },
      message: /Repository lease mutation entry has invalid ownership: /,
    },
    {
      label: 'an entry with a negative ticket is rejected as invalid ownership',
      entry: { content: queueRecord({ ticket: -1 }) },
      message: /Repository lease mutation entry has invalid ownership: /,
    },
    {
      label: 'an entry with a non-integer ticket is rejected as invalid ownership',
      entry: { content: queueRecord({ ticket: 1.5 }) },
      message: /Repository lease mutation entry has invalid ownership: /,
    },
    {
      label: 'an entry with an unsupported version is rejected as invalid ownership',
      entry: { content: queueRecord({ version: 2 }) },
      message: /Repository lease mutation entry has invalid ownership: /,
    },
    {
      label: 'an entry without a processStart identity is rejected as invalid ownership',
      entry: { content: queueRecord({ processStart: '' }) },
      message: /Repository lease mutation entry has invalid ownership: /,
    },
    {
      label: 'an entry larger than 4KiB is rejected as unsafe',
      entry: { content: queueRecord({ padding: 'x'.repeat(5_000) }) },
      message: /Repository lease mutation entry is unsafe: /,
    },
    {
      label: 'a symlinked entry is rejected as unsafe',
      entry: {
        symlinkTo: (() => {
          const real = path.join(os.tmpdir(), `gw-lease-mutation-real-${process.pid}.json`);
          fs.writeFileSync(real, queueRecord());
          return real;
        })(),
      },
      message: /Repository lease mutation entry is unsafe: /,
    },
    {
      label: 'a queue filename outside the token grammar is rejected',
      entry: { name: 'zzz.lock', content: queueRecord() },
      message: /Repository lease mutation filename is invalid: .*zzz\.lock$/,
    },
  ];

  for (const testCase of CASES) {
    test(testCase.label, () => {
      const fixture = queueFixture(testCase.entry);
      try {
        const before = snapshot(fixture.parent);
        assert.throws(
          () => require(LEASE_MUTATION).acquireLeaseMutation(fixture.mutationRoot),
          (error) => testCase.message.test(error.message)
        );
        // Fail-closed means fail-clean: the rejected entry survives untouched
        // and the failed turn leaves no choosing/ticket records of its own.
        assert.deepStrictEqual(
          snapshot(fixture.parent),
          before,
          'a rejected mutation turn disturbed queue state'
        );
      } finally {
        fs.rmSync(fixture.parent, { recursive: true, force: true });
      }
    });
  }

  test('contrast: a well-formed queue admits a mutation turn and releases it', () => {
    const fixture = queueFixture();
    try {
      const release = require(LEASE_MUTATION).acquireLeaseMutation(fixture.mutationRoot);
      release();
      assert.deepStrictEqual(
        snapshot(path.join(fixture.mutationRoot, '.lease-mutation', 'tickets')),
        {},
        'a released turn left ticket records behind'
      );
    } finally {
      fs.rmSync(fixture.parent, { recursive: true, force: true });
    }
  });
});

describe('createContainedDirectory containment refusals', () => {
  const LABEL = 'Repository lease mutation directory';

  test('a symlinked parent is refused', () => {
    const parent = tmp();
    try {
      const real = path.join(parent, 'real');
      fs.mkdirSync(real);
      const link = path.join(parent, 'link');
      fs.symlinkSync(real, link);
      assert.throws(
        () => require(LEASE_MUTATION).createContainedDirectory(link, path.join(link, 'child'), LABEL),
        (error) => error.message === `${LABEL} parent is not a real directory: ${link}`
      );
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  test('a non-directory parent is refused', () => {
    const parent = tmp();
    try {
      const file = path.join(parent, 'file');
      fs.writeFileSync(file, 'x');
      assert.throws(
        () => require(LEASE_MUTATION).createContainedDirectory(file, path.join(file, 'child'), LABEL),
        (error) => error.message === `${LABEL} parent is not a real directory: ${file}`
      );
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  test('a child outside the parent is refused', () => {
    const parent = tmp();
    try {
      const outside = path.join(parent, '..', 'elsewhere');
      assert.throws(
        () => require(LEASE_MUTATION).createContainedDirectory(parent, outside, LABEL),
        (error) => error.message === `${LABEL} is outside ${parent}`
      );
      assert.strictEqual(fs.existsSync(outside), false, 'an outside target was created');
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  test('a file where a directory component is required is refused', () => {
    const parent = tmp();
    try {
      const blocker = path.join(parent, 'blocker');
      fs.writeFileSync(blocker, 'x');
      const child = path.join(parent, 'blocker', 'child');
      assert.throws(
        () => require(LEASE_MUTATION).createContainedDirectory(parent, child, LABEL),
        (error) => error.message === `${LABEL} contains a non-directory or symlink: ${blocker}`
      );
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  test('a symlink where a directory component is required is refused', () => {
    const parent = tmp();
    try {
      const real = path.join(parent, 'real');
      fs.mkdirSync(real);
      const link = path.join(parent, 'link');
      fs.symlinkSync(real, link);
      const child = path.join(parent, 'link', 'child');
      assert.throws(
        () => require(LEASE_MUTATION).createContainedDirectory(parent, child, LABEL),
        (error) => error.message === `${LABEL} contains a non-directory or symlink: ${link}`
      );
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
