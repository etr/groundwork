/**
 * Tests for lib/plan-check.js — plan ownership verification.
 *
 * Task IDs are only unique per project, so a legacy repo-root plan may belong
 * to a DIFFERENT project than the one now implementing. These tests pin the
 * resolution logic (candidates: repoRoot-resolved base, plus a projectRoot
 * base only for `specs/`-prefixed recordings), the lenient acceptances
 * (N/A, missing fields), and the rejection branch whose reason must name the
 * recorded context so the operator can act on it.
 *
 * Run with: node tests/plan-check.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const { planBelongsToProject, readPlanContext } = require(path.join(PLUGIN_ROOT, 'lib', 'plan-check'));

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

// A monorepo layout: two projects under one repo root. Membership is always
// checked for apps/web; plans record either project's context.
function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-plan-check-'));
  const root = fs.realpathSync(tmp);
  fs.mkdirSync(path.join(root, 'apps', 'web', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps', 'api', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(root, '.groundwork-plans'), { recursive: true });
  return {
    root,
    webRoot: path.join(root, 'apps', 'web'),
    apiRoot: path.join(root, 'apps', 'api'),
  };
}

function writePlan(repo, name, fields, extra = '') {
  const lines = ['# Plan\n', '\n', '## Context\n'];
  for (const [key, value] of Object.entries(fields)) {
    lines.push(`- ${key}: ${value}\n`);
  }
  lines.push(extra);
  const file = path.join(repo.root, '.groundwork-plans', name);
  fs.writeFileSync(file, lines.join(''));
  return file;
}

function cleanup(repo) {
  fs.rmSync(repo.root, { recursive: true, force: true });
}

describe('planBelongsToProject acceptance', () => {
  test('accepts a header recording this project’s specs dir (repo-root base)', () => {
    const repo = fixture();
    try {
      const plan = writePlan(repo, 'TASK-004-plan.md', {
        'Identifier': 'TASK-004',
        'Specs dir': 'apps/web/specs',
        'Tasks path': 'apps/web/specs/tasks.md',
      });
      const verdict = planBelongsToProject(plan, repo.webRoot, repo.root);
      assert.strictEqual(verdict.ok, true);
      assert.strictEqual(verdict.reason, '');
    } finally {
      cleanup(repo);
    }
  });

  test('accepts a project-relative specs/ recording via the project-root base', () => {
    const repo = fixture();
    try {
      // 'specs/tasks.md' does not resolve inside apps/web from the repo root,
      // so acceptance must come from the second candidate base.
      const plan = writePlan(repo, 'TASK-004-plan.md', {
        'Specs dir': 'specs',
        'Tasks path': 'specs/tasks.md',
      });
      const verdict = planBelongsToProject(plan, repo.webRoot, repo.root);
      assert.strictEqual(verdict.ok, true);
    } finally {
      cleanup(repo);
    }
  });

  test('accepts N/A feature-mode plans', () => {
    const repo = fixture();
    try {
      const plan = writePlan(repo, 'TASK-004-plan.md', {
        'Specs dir': 'N/A',
        'Tasks path': 'n/a',
      });
      const verdict = planBelongsToProject(plan, repo.webRoot, repo.root);
      assert.strictEqual(verdict.ok, true);
      assert.strictEqual(verdict.reason, 'no recorded project path');
    } finally {
      cleanup(repo);
    }
  });

  test('accepts a header with no recorded project path', () => {
    const repo = fixture();
    try {
      const plan = writePlan(repo, 'TASK-004-plan.md', { 'Identifier': 'TASK-004' });
      const verdict = planBelongsToProject(plan, repo.webRoot, repo.root);
      assert.strictEqual(verdict.ok, true);
      assert.strictEqual(verdict.reason, 'no recorded project path');
    } finally {
      cleanup(repo);
    }
  });

  test('accepts an absolute recorded path inside the project', () => {
    const repo = fixture();
    try {
      const plan = writePlan(repo, 'TASK-004-plan.md', {
        'Specs dir': path.join(repo.webRoot, 'specs'),
      });
      const verdict = planBelongsToProject(plan, repo.webRoot, repo.root);
      assert.strictEqual(verdict.ok, true);
    } finally {
      cleanup(repo);
    }
  });
});

describe('planBelongsToProject rejection', () => {
  test('rejects a foreign project with a reason naming the recorded context', () => {
    const repo = fixture();
    try {
      const plan = writePlan(repo, 'TASK-004-plan.md', {
        'Identifier': 'TASK-004',
        'Specs dir': 'apps/api/specs',
        'Tasks path': 'apps/api/specs/tasks.md',
      });
      const verdict = planBelongsToProject(plan, repo.webRoot, repo.root);
      assert.strictEqual(verdict.ok, false);
      assert.ok(verdict.reason.includes('apps/api/specs'), `reason must name the recording: ${verdict.reason}`);
      assert.ok(verdict.reason.includes(repo.webRoot), `reason must name the project root: ${verdict.reason}`);
    } finally {
      cleanup(repo);
    }
  });

  test('rejects a non-specs-prefixed recording that only the project-root base could save', () => {
    const repo = fixture();
    try {
      // 'tasks.md' is not specs/-prefixed, so the projectRoot candidate base
      // is never added; the repoRoot resolution lands outside apps/web.
      const plan = writePlan(repo, 'TASK-004-plan.md', { 'Tasks path': 'tasks.md' });
      const verdict = planBelongsToProject(plan, repo.webRoot, repo.root);
      assert.strictEqual(verdict.ok, false);
    } finally {
      cleanup(repo);
    }
  });

  test('rejects an unreadable header', () => {
    const repo = fixture();
    try {
      const missing = path.join(repo.root, '.groundwork-plans', 'does-not-exist.md');
      const verdict = planBelongsToProject(missing, repo.webRoot, repo.root);
      assert.strictEqual(verdict.ok, false);
      assert.ok(/unreadable/.test(verdict.reason), verdict.reason);
    } finally {
      cleanup(repo);
    }
  });
});

describe('readPlanContext header scanning', () => {
  test('maps `## Context` fields to lowercase keys', () => {
    const repo = fixture();
    try {
      const plan = writePlan(repo, 'TASK-004-plan.md', {
        'Identifier': 'TASK-004',
        'Specs dir': 'apps/web/specs',
      });
      const fields = readPlanContext(plan);
      assert.strictEqual(fields['identifier'], 'TASK-004');
      assert.strictEqual(fields['specs dir'], 'apps/web/specs');
    } finally {
      cleanup(repo);
    }
  });

  test('extracts fields from the bounded header only', () => {
    const repo = fixture();
    try {
      const plan = writePlan(repo, 'TASK-004-plan.md', {}, [
        '## Steps\n',
        '- Specs dir: apps/api/specs\n',
      ].join(''));
      // Field lines anywhere in the bounded head are scanned (the header is a
      // hint, not a fence) — pin the current lenient scan shape.
      const fields = readPlanContext(plan);
      assert.strictEqual(fields['specs dir'], 'apps/api/specs');
    } finally {
      cleanup(repo);
    }
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
