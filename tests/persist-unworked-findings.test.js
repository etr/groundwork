/**
 * Concurrency tests for manual unworked-findings persistence.
 *
 * Many independent processes with the same findings, task ID, output
 * directory, and (effectively frozen) timestamp are released together through
 * a deterministic file-marker IPC barrier. Each must produce one distinct,
 * intact report with a truthful returned path — no silent overwrites, no
 * orphan temporary or reservation files. Same-run (--run-id) persistence
 * remains intentionally idempotent: one report per run.
 *
 * Run with: node tests/persist-unworked-findings.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const PERSIST = path.join(PLUGIN_ROOT, 'lib', 'persist-unworked-findings.js');
const BARRIER_WORKER = path.join(__dirname, 'helpers', 'cli-barrier-worker.js');

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

function sleepMs(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function waitForFile(file, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(file)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${file}`);
    sleepMs(10);
  }
  return file;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-unworked-'));
  const findingsDir = path.join(root, 'findings');
  const specsDir = path.join(root, 'specs');
  fs.mkdirSync(findingsDir);
  fs.mkdirSync(specsDir);
  fs.writeFileSync(path.join(findingsDir, 'findings-code-quality-reviewer-iter1.json'), JSON.stringify({
    agent: 'code-quality-reviewer',
    iteration: 1,
    verdict: 'request-changes',
    findings: [
      { id: 1, severity: 'major', category: 'cleanup', file: 'src.txt', line: 1, finding: 'Optional cleanup', recommendation: 'Polish later' },
      { id: 2, severity: 'minor', category: 'docs', file: 'README.md', line: 3, finding: 'Stale docs', recommendation: 'Update' },
    ],
  }));
  return { root, findingsDir, specsDir };
}

function spawnPersistWorker(barrierDir, name, args) {
  const ready = path.join(barrierDir, `${name}.ready`);
  const release = path.join(barrierDir, `${name}.release`);
  const result = path.join(barrierDir, `${name}.result`);
  const child = spawn(process.execPath, [BARRIER_WORKER], {
    env: {
      ...process.env,
      WORKER_COMMAND: JSON.stringify([PERSIST, ...args]),
      WORKER_READY: ready,
      WORKER_RELEASE: release,
      WORKER_RESULT: result,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return { child, ready, release, result };
}

describe('closed dispositions stay out of the unworked ledger', () => {
  const { spawnSync } = require('child_process');

  test('mixed-disposition fixture persists only actionable and legacy-actionable items', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-unworked-dispo-'));
    const findingsDir = path.join(root, 'findings');
    const specsDir = path.join(root, 'specs');
    fs.mkdirSync(findingsDir);
    fs.mkdirSync(specsDir);
    fs.writeFileSync(path.join(findingsDir, 'findings-reviewer-iter2.json'), JSON.stringify({
      agent: 'reviewer',
      iteration: 2,
      findings: [
        { id: 1, severity: 'minor', category: 'blocking-io', file: 'a.js', line: 1,
          finding: 'prior finding is RESOLVED', recommendation: 'None — resolved as claimed',
          disposition: 'resolved' },
        { id: 2, severity: 'minor', category: 'blocking-io', file: 'b.js', line: 2,
          finding: 'prior finding is RESOLVED (closure re-check)', recommendation: 'None — resolved as claimed',
          disposition: 'closure-observation' },
        { id: 35, severity: 'minor', category: 'specification-gap', file: 'c.js', line: 3,
          finding: 'open-path writes bypass the mutation lock', recommendation: 'Route through it',
          disposition: 'actionable' },
        { id: 4, severity: 'minor', category: 'docs', file: 'd.js', line: 4,
          finding: 'approved deviation', recommendation: 'None', disposition: 'approved' },
        { id: 5, severity: 'major', category: 'cleanup', file: 'e.js', line: 5,
          finding: 'fixed by the fixer', recommendation: 'None', disposition: 'fixed' },
        { id: 6, severity: 'minor', category: 'legacy', file: 'f.js', line: 6,
          finding: 'legacy record with no disposition', recommendation: 'Do it' },
      ],
    }));
    try {
      // Item 35 is also claimed fixed by --fixed-ids: even an actionable
      // disposition must yield to the verified fix list.
      const result = spawnSync(process.execPath, [PERSIST,
        '--findings-dir', findingsDir, '--specs-dir', specsDir,
        '--task-id', 'TASK-075', '--fixed-ids', 'reviewer-iter2-35',
      ], { encoding: 'utf8' });
      assert.strictEqual(result.status, 0, result.stderr);
      const outcome = JSON.parse(result.stdout);
      assert.strictEqual(outcome.status, 'written', result.stdout);
      assert.strictEqual(outcome.counts.minor, 1, JSON.stringify(outcome.counts));
      const report = fs.readFileSync(outcome.written, 'utf8');
      assert.ok(!report.includes('RESOLVED'), 'a resolved item re-entered the ledger');
      assert.ok(!report.includes('approved deviation'), 'an approved item re-entered the ledger');
      assert.ok(!report.includes('fixed by the fixer'), 'a fixed item re-entered the ledger');
      assert.ok(!report.includes('open-path writes'), 'a fixed-ID item re-entered the ledger');
      assert.ok(report.includes('legacy record with no disposition'),
        'a legacy actionable record was dropped from the ledger');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('concurrent manual unworked-findings persistence', () => {
  test('many same-second writers produce one intact, distinct report each', () => {
    const { root, findingsDir, specsDir } = fixture();
    const barrier = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-unworked-barrier-'));
    const WORKER_COUNT = 12;
    try {
      const baseArgs = [
        '--findings-dir', findingsDir,
        '--specs-dir', specsDir,
        '--task-id', 'TASK-075',
        '--fixed-ids', '',
      ];
      const workers = [];
      for (let i = 0; i < WORKER_COUNT; i++) {
        workers.push(spawnPersistWorker(barrier, `w${i}`, baseArgs));
      }
      for (const worker of workers) waitForFile(worker.ready);

      // Release everyone in the same tick — they share findings, task, output
      // directory, and (within the same second) the report timestamp prefix.
      for (const worker of workers) fs.writeFileSync(worker.release, 'go\n');
      const outcomes = workers.map((worker) => {
        waitForFile(worker.result);
        return JSON.parse(fs.readFileSync(worker.result, 'utf8'));
      });

      const writtenPaths = [];
      for (const outcome of outcomes) {
        assert.strictEqual(outcome.status, 0, outcome.stderr);
        const payload = JSON.parse(outcome.stdout);
        assert.strictEqual(payload.status, 'written', outcome.stdout);
        assert.deepStrictEqual(payload.counts, { critical: 0, major: 1, minor: 1 });
        writtenPaths.push(payload.written);
      }

      // One distinct report per process: no overwrites, no duplicates.
      assert.strictEqual(new Set(writtenPaths).size, WORKER_COUNT,
        `expected ${WORKER_COUNT} distinct reports, got ${new Set(writtenPaths).size}`);
      for (const written of writtenPaths) {
        const content = fs.readFileSync(written, 'utf8');
        assert.ok(content.startsWith('# Unworked Review Issues'), `report is not intact: ${written}`);
        assert.ok(content.includes('code-quality-reviewer'));
      }

      // The output directory contains exactly the reports — no temporary or
      // reservation leftovers.
      const outDir = path.join(specsDir, 'unworked_review_issues');
      const entries = fs.readdirSync(outDir);
      assert.strictEqual(entries.length, WORKER_COUNT, `orphan files left behind: ${entries}`);
      assert.ok(entries.every((name) => name.endsWith('.md')), `non-report files left behind: ${entries}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(barrier, { recursive: true, force: true });
    }
  });

  test('the same run id remains one intentional idempotent report under concurrency', () => {
    const { root, findingsDir, specsDir } = fixture();
    const barrier = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-unworked-barrier-'));
    try {
      const args = [
        '--findings-dir', findingsDir,
        '--specs-dir', specsDir,
        '--task-id', 'TASK-075',
        '--fixed-ids', '',
        '--run-id', 'a'.repeat(32),
      ];
      const workers = [0, 1, 2, 3].map((i) => spawnPersistWorker(barrier, `w${i}`, args));
      for (const worker of workers) waitForFile(worker.ready);
      for (const worker of workers) fs.writeFileSync(worker.release, 'go\n');
      const outcomes = workers.map((worker) => {
        waitForFile(worker.result);
        return JSON.parse(fs.readFileSync(worker.result, 'utf8'));
      });

      const paths = outcomes.map((outcome) => {
        assert.strictEqual(outcome.status, 0, outcome.stderr);
        return JSON.parse(outcome.stdout).written;
      });
      assert.ok(paths.every((p) => p === paths[0]), 'same-run persistence produced divergent paths');
      const outDir = path.join(specsDir, 'unworked_review_issues');
      assert.deepStrictEqual(fs.readdirSync(outDir), [`task-075_validation_${'a'.repeat(32)}.md`]);
      const content = fs.readFileSync(paths[0], 'utf8');
      assert.ok(content.startsWith('# Unworked Review Issues'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(barrier, { recursive: true, force: true });
    }
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
