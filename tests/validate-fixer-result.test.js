/** Tests for the structured validation artifact contract. */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const VALIDATOR = path.resolve(__dirname, '..', 'lib', 'validate-fixer-result.js');

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

function defaultReviews() {
  return [
    {
      agent: 'code-quality-reviewer',
      iteration: 1,
      summary: 'One major issue',
      score: 70,
      verdict: 'request-changes',
      findings: [
        {
          id: 1,
          severity: 'major',
          category: 'correctness',
          file: 'lib/example.js',
          line: 12,
          finding: 'The implementation is incomplete.',
          recommendation: 'Complete the implementation.',
        },
        {
          id: 2,
          severity: 'minor',
          category: 'style',
          file: 'lib/example.js',
          line: 18,
          finding: 'The name is vague.',
          recommendation: 'Use a clearer name.',
        },
      ],
    },
    {
      agent: 'security-reviewer',
      iteration: 1,
      summary: 'One critical issue',
      score: 50,
      verdict: 'request-changes',
      findings: [
        {
          id: 3,
          severity: 'critical',
          category: 'injection',
          file: 'lib/example.js',
          line: 24,
          finding: 'Untrusted input reaches a shell.',
          recommendation: 'Remove the shell data path.',
        },
      ],
    },
  ];
}

function countsFor(findings) {
  const counts = { critical: 0, major: 0, minor: 0 };
  for (const finding of findings) counts[finding.severity]++;
  return counts;
}

function createArtifacts(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'groundwork-validation-'));
  const iteration = options.iteration === undefined ? 1 : options.iteration;
  const reviews = options.reviews || defaultReviews();
  const manifestName = `fixer-manifest-iter${iteration}.json`;
  const resultName = `fixer-result-iter${iteration}.json`;
  const manifest = {
    iteration,
    result_file: resultName,
    reviews: reviews.map((review) => ({
      file: `findings-${review.agent}-iter${review.iteration}.json`,
      agent: review.agent,
      iteration: review.iteration,
      summary: review.summary,
      score: review.score,
      verdict: review.verdict,
      counts: countsFor(review.findings),
    })),
  };

  for (const review of reviews) {
    fs.writeFileSync(
      path.join(dir, `findings-${review.agent}-iter${review.iteration}.json`),
      JSON.stringify(review)
    );
  }
  fs.writeFileSync(path.join(dir, manifestName), JSON.stringify(manifest));
  if (options.result !== undefined) {
    const body = options.rawResult ? options.result : JSON.stringify(options.result);
    fs.writeFileSync(path.join(dir, resultName), body);
  }
  return { dir, manifest, manifestName, resultName };
}

function validate(artifacts, extraArgs = []) {
  return spawnSync('node', [
    VALIDATOR,
    '--findings-dir', artifacts.dir,
    '--manifest', artifacts.manifestName,
    ...extraArgs,
  ], { encoding: 'utf8' });
}

function withArtifacts(options, assertion) {
  const artifacts = createArtifacts(options);
  try {
    assertion(validate(artifacts), artifacts);
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
  }
}

function expectRejected(result, message) {
  assert.notStrictEqual(result.status, 0);
  assert.ok(result.stderr.includes(message), `expected "${message}" in:\n${result.stderr}`);
}

console.log('\nvalidate-fixer-result');

test('accepts a complete fixed result derived from validated findings files', () => {
  const ids = ['code-quality-reviewer-iter1-1', 'security-reviewer-iter1-3'];
  withArtifacts({
    result: {
      status: 'fixed',
      files_touched: ['lib/example.js'],
      findings_fixed: ids,
      findings_skipped: [],
    },
  }, (result) => {
    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(JSON.parse(result.stdout), {
      status: 'fixed',
      files_touched: ['lib/example.js'],
      findings_fixed: ids,
      findings_skipped: [],
    });
  });
});

test('validates findings independently before fixer use', () => {
  const artifacts = createArtifacts();
  try {
    const result = validate(artifacts, ['--check-findings']);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(JSON.parse(result.stdout).finding_ids, [
      'code-quality-reviewer-iter1-1',
      'security-reviewer-iter1-3',
    ]);
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
  }
});

test('accepts a partial result with a reason for each skipped finding', () => {
  withArtifacts({
    result: {
      status: 'partial',
      files_touched: ['lib/example.js'],
      findings_fixed: ['code-quality-reviewer-iter1-1'],
      findings_skipped: [
        { id: 'security-reviewer-iter1-3', reason: 'requires a product decision' },
      ],
    },
  }, (result) => {
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(JSON.parse(result.stdout).status, 'partial');
  });
});

test('accepts a failure result with a concise reason', () => {
  withArtifacts({
    result: { status: 'failure', reason: 'the required fixture is unavailable' },
  }, (result) => {
    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(JSON.parse(result.stdout), {
      status: 'failure',
      reason: 'the required fixture is unavailable',
    });
  });
});

test('rejects an unknown finding ID', () => {
  withArtifacts({
    result: {
      status: 'fixed',
      files_touched: ['lib/example.js'],
      findings_fixed: ['not-a-requested-finding'],
      findings_skipped: [],
    },
  }, (result) => expectRejected(result, 'unknown finding ID'));
});

test('rejects a skipped finding without a reason', () => {
  withArtifacts({
    result: {
      status: 'partial',
      files_touched: ['lib/example.js'],
      findings_fixed: ['code-quality-reviewer-iter1-1'],
      findings_skipped: [{ id: 'security-reviewer-iter1-3', reason: '' }],
    },
  }, (result) => expectRejected(result, 'requires an ID and non-empty reason'));
});

test('rejects malformed result JSON', () => {
  withArtifacts({ result: '{broken', rawResult: true }, (result) => {
    expectRejected(result, 'could not read result file');
  });
});

test('rejects a missing result JSON file', () => {
  withArtifacts({}, (result) => expectRejected(result, 'could not read result file'));
});

test('rejects malformed findings JSON', () => {
  const artifacts = createArtifacts();
  try {
    fs.writeFileSync(
      path.join(artifacts.dir, artifacts.manifest.reviews[0].file),
      '{broken'
    );
    expectRejected(validate(artifacts, ['--check-findings']), 'could not read findings file');
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
  }
});

test('rejects a missing findings JSON file', () => {
  const artifacts = createArtifacts();
  try {
    fs.unlinkSync(path.join(artifacts.dir, artifacts.manifest.reviews[0].file));
    expectRejected(validate(artifacts, ['--check-findings']), 'could not read findings file');
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
  }
});

test('rejects duplicate finding IDs in a fixer result', () => {
  withArtifacts({
    result: {
      status: 'fixed',
      files_touched: ['lib/example.js'],
      findings_fixed: [
        'code-quality-reviewer-iter1-1',
        'code-quality-reviewer-iter1-1',
      ],
      findings_skipped: [],
    },
  }, (result) => expectRejected(result, 'duplicate finding ID'));
});

test('rejects duplicate numeric IDs in a findings file', () => {
  const reviews = defaultReviews();
  reviews[0].findings[1].id = reviews[0].findings[0].id;
  const artifacts = createArtifacts({ reviews });
  try {
    expectRejected(validate(artifacts, ['--check-findings']), 'duplicate local finding ID');
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
  }
});

test('rejects a bad fixer result status', () => {
  withArtifacts({ result: { status: 'done' } }, (result) => {
    expectRejected(result, 'status must be fixed, partial, or failure');
  });
});

test('rejects a bad reviewer verdict status', () => {
  const artifacts = createArtifacts();
  try {
    artifacts.manifest.reviews[0].verdict = 'changes-needed';
    fs.writeFileSync(
      path.join(artifacts.dir, artifacts.manifestName),
      JSON.stringify(artifacts.manifest)
    );
    expectRejected(validate(artifacts, ['--check-findings']), 'review verdict must be approve or request-changes');
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
  }
});

test('rejects fixed status with skipped findings', () => {
  withArtifacts({
    result: {
      status: 'fixed',
      files_touched: ['lib/example.js'],
      findings_fixed: ['code-quality-reviewer-iter1-1'],
      findings_skipped: [
        { id: 'security-reviewer-iter1-3', reason: 'requires a product decision' },
      ],
    },
  }, (result) => expectRejected(result, 'fixed result cannot include skipped findings'));
});

test('rejects partial status without skipped findings', () => {
  withArtifacts({
    result: {
      status: 'partial',
      files_touched: ['lib/example.js'],
      findings_fixed: [
        'code-quality-reviewer-iter1-1',
        'security-reviewer-iter1-3',
      ],
      findings_skipped: [],
    },
  }, (result) => expectRejected(result, 'partial result requires at least one skipped finding'));
});

test('rejects stale findings metadata from another iteration', () => {
  const artifacts = createArtifacts();
  try {
    artifacts.manifest.reviews[0].iteration = 2;
    fs.writeFileSync(
      path.join(artifacts.dir, artifacts.manifestName),
      JSON.stringify(artifacts.manifest)
    );
    expectRejected(validate(artifacts, ['--check-findings']), 'review iteration must match manifest iteration');
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
  }
});

test('rejects findings metadata with incorrect severity counts', () => {
  const artifacts = createArtifacts();
  try {
    artifacts.manifest.reviews[0].counts.major = 99;
    fs.writeFileSync(
      path.join(artifacts.dir, artifacts.manifestName),
      JSON.stringify(artifacts.manifest)
    );
    expectRejected(validate(artifacts, ['--check-findings']), 'review counts do not match findings');
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
  }
});

test('rejects an invalid agent name schema', () => {
  const artifacts = createArtifacts();
  try {
    artifacts.manifest.reviews[0].agent = 'code; touch owned';
    fs.writeFileSync(
      path.join(artifacts.dir, artifacts.manifestName),
      JSON.stringify(artifacts.manifest)
    );
    expectRejected(validate(artifacts, ['--check-findings']), 'invalid review agent');
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
  }
});

test('rejects an invalid iteration schema', () => {
  const artifacts = createArtifacts();
  try {
    artifacts.manifest.iteration = 0;
    fs.writeFileSync(
      path.join(artifacts.dir, artifacts.manifestName),
      JSON.stringify(artifacts.manifest)
    );
    expectRejected(validate(artifacts, ['--check-findings']), 'manifest iteration must be a positive integer');
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
  }
});

test('rejects a non-numeric local finding ID', () => {
  const reviews = defaultReviews();
  reviews[0].findings[0].id = 'one';
  const artifacts = createArtifacts({ reviews });
  try {
    expectRejected(validate(artifacts, ['--check-findings']), 'finding id must be a positive integer');
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
  }
});

test('rejects a symlink findings file', () => {
  const artifacts = createArtifacts();
  const external = path.join(os.tmpdir(), `external-findings-${process.pid}.json`);
  try {
    const file = path.join(artifacts.dir, artifacts.manifest.reviews[0].file);
    fs.renameSync(file, external);
    fs.symlinkSync(external, file);
    expectRejected(validate(artifacts, ['--check-findings']), 'must not be a symlink');
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
    fs.rmSync(external, { force: true });
  }
});

test('rejects a symlink fixer result file', () => {
  const artifacts = createArtifacts();
  const external = path.join(os.tmpdir(), `external-result-${process.pid}.json`);
  try {
    fs.writeFileSync(external, JSON.stringify({ status: 'failure', reason: 'external' }));
    fs.symlinkSync(external, path.join(artifacts.dir, artifacts.resultName));
    expectRejected(validate(artifacts), 'must not be a symlink');
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
    fs.rmSync(external, { force: true });
  }
});

test('rejects an out-of-directory findings path', () => {
  const artifacts = createArtifacts();
  try {
    artifacts.manifest.reviews[0].file = '../outside-findings.json';
    fs.writeFileSync(
      path.join(artifacts.dir, artifacts.manifestName),
      JSON.stringify(artifacts.manifest)
    );
    expectRejected(validate(artifacts, ['--check-findings']), 'review file must be a direct-child basename');
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
  }
});

test('rejects a stale same-directory findings basename', () => {
  const artifacts = createArtifacts();
  try {
    artifacts.manifest.reviews[0].file = 'findings-code-quality-reviewer-iter99.json';
    fs.writeFileSync(
      path.join(artifacts.dir, artifacts.manifestName),
      JSON.stringify(artifacts.manifest)
    );
    expectRejected(validate(artifacts, ['--check-findings']), 'review file must match expected basename');
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
  }
});

test('rejects an out-of-directory fixer result path', () => {
  const artifacts = createArtifacts();
  try {
    artifacts.manifest.result_file = '../outside-result.json';
    fs.writeFileSync(
      path.join(artifacts.dir, artifacts.manifestName),
      JSON.stringify(artifacts.manifest)
    );
    expectRejected(validate(artifacts), 'result_file must be a direct-child basename');
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
  }
});

test('rejects a stale same-directory fixer result basename', () => {
  const artifacts = createArtifacts();
  try {
    artifacts.manifest.result_file = 'fixer-result-iter99.json';
    fs.writeFileSync(
      path.join(artifacts.dir, artifacts.manifestName),
      JSON.stringify(artifacts.manifest)
    );
    expectRejected(validate(artifacts), 'result_file must match expected basename');
  } finally {
    fs.rmSync(artifacts.dir, { recursive: true, force: true });
  }
});

console.log(`\nTests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
