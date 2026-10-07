/** Runtime, wire-contract, and batch regressions from a real exported run. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const validator = path.join(ROOT, 'lib/validate-fixer-result.js');
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'groundwork-validation-'));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function review(disposition = 'actionable') {
  return {
    agent: 'code-quality-reviewer', iteration: 1, review_mode: 'initial-audit',
    summary: 'Contract check', score: 85, verdict: 'approve',
    findings: [{ id: 1, severity: 'major', category: 'correctness', file: 'lib/example.js',
      line: 1, finding: 'Named invariant', recommendation: 'Required outcome', disposition }],
  };
}
function write(dir, body) {
  const file = `findings-${body.agent}-iter${body.iteration}.json`;
  fs.writeFileSync(path.join(dir, file), JSON.stringify(body));
  const counts = { critical: 0, major: 0, minor: 0 };
  for (const finding of body.findings) counts[finding.severity]++;
  fs.writeFileSync(path.join(dir, 'fixer-manifest-iter1.json'), JSON.stringify({
    iteration: 1, result_file: 'fixer-result-iter1.json',
    reviews: [{ file, agent: body.agent, iteration: body.iteration, summary: body.summary,
      score: body.score, verdict: body.verdict, review_mode: body.review_mode, counts }],
  }));
  return file;
}
function run(dir, args = ['--check-findings']) {
  return spawnSync(process.execPath, [validator, '--findings-dir', dir,
    '--manifest', 'fixer-manifest-iter1.json', ...args], { encoding: 'utf8' });
}
test('the documented finding example passes the real artifact validator', () => fixture(dir => {
  const body = fs.readFileSync(path.join(ROOT, 'skills/validate/SKILL.md'), 'utf8');
  const example = body.slice(body.indexOf('**Full review file format**')).match(/```json\n([\s\S]*?)\n```/);
  const parsed = JSON.parse(example[1]);
  const compact = JSON.parse([...body.slice(body.indexOf('**Full review file format**')).matchAll(/```json\n([\s\S]*?)\n```/g)][1][1]);
  assert.deepStrictEqual(compact.counts, Object.fromEntries(['critical', 'major', 'minor'].map(k => [k, parsed.findings.filter(f => f.severity === k).length])));
  write(dir, parsed);
  const result = run(dir);
  assert.strictEqual(result.status, 0, result.stderr);
}));
test('every implementation reviewer file-mode template matches the wire contract', () => {
  for (const agent of fs.readdirSync(path.join(ROOT, 'agents'))) {
    const source = path.join(ROOT, 'agents', agent, 'AGENT.md');
    if (!fs.existsSync(source)) continue;
    const text = fs.readFileSync(source, 'utf8');
    const at = text.indexOf('**File mode**');
    if (at === -1 || !text.includes('validation-review-protocol.md')) continue;
    const block = text.slice(at).match(/```json\n([\s\S]*?)\n```/);
    const body = JSON.parse(block[1].replace(/<agent_name from prompt>/g, agent)
      .replace(/<iteration from prompt>/g, '1').replace(/<review_mode from prompt>/g, 'initial-audit'));
    const compact = JSON.parse([...text.slice(at).matchAll(/```json\n([\s\S]*?)\n```/g)][1][1]);
    assert.deepStrictEqual(compact.counts, Object.fromEntries(['critical', 'major', 'minor'].map(k => [k, body.findings.filter(f => f.severity === k).length])), agent);
    for (const key of ['summary', 'score', 'verdict']) assert.strictEqual(compact[key], body[key], `${agent}: ${key}`);
    fixture(dir => {
      write(dir, body);
      const result = run(dir);
      assert.strictEqual(result.status, 0, `${agent}: ${result.stderr}`);
    });
  }
});
test('all closed dispositions stay outside fixer scope even at critical severity', () => fixture(dir => {
  const body = review();
  body.verdict = 'request-changes';
  body.findings = ['actionable', 'resolved', 'approved', 'fixed', 'closure-observation'].map((disposition, index) => ({
    ...body.findings[0], id: index + 1, severity: 'critical', disposition,
  }));
  write(dir, body);
  const result = run(dir);
  assert.strictEqual(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.deepStrictEqual(parsed.finding_ids, ['code-quality-reviewer-iter1-1']);
  assert.deepStrictEqual(parsed.finding_refs.map(f => f.disposition), body.findings.map(f => f.disposition));
}));
test('closed critical observations can accompany approval without reopening work', () => fixture(dir => {
  const body = review('resolved');
  body.findings[0].severity = 'critical';
  write(dir, body);
  const result = run(dir);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.deepStrictEqual(JSON.parse(result.stdout).finding_ids, []);
}));
test('modern findings require a disposition and reject invalid types or values', () => {
  for (const disposition of [undefined, null, '', {}, 'actionble']) fixture(dir => {
    const body = review(disposition);
    if (disposition === undefined) delete body.findings[0].disposition;
    write(dir, body);
    const result = run(dir);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /disposition/);
  });
});
test('legacy findings without review_mode or disposition remain actionable', () => fixture(dir => {
  const body = review();
  delete body.review_mode;
  delete body.findings[0].disposition;
  body.verdict = 'request-changes';
  write(dir, body);
  const result = run(dir);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.deepStrictEqual(JSON.parse(result.stdout).finding_ids, ['code-quality-reviewer-iter1-1']);
}));
test('manifest preparation rejects a symlink destination without touching its target', () => fixture(dir => {
  const file = write(dir, review());
  const target = path.join(dir, 'fixer-manifest-iter1.json');
  fs.unlinkSync(target);
  const outside = path.join(dir, 'outside.json');
  fs.symlinkSync(outside, target);
  const result = run(dir, ['--prepare-manifest', '--review-files', file]);
  assert.notStrictEqual(result.status, 0);
  assert.ok(fs.lstatSync(target).isSymbolicLink());
  assert.ok(!fs.existsSync(outside));
}));
test('manifest preparation uses assigned files and publishes only validated metadata', () => fixture(dir => {
  const file = write(dir, review());
  fs.unlinkSync(path.join(dir, 'fixer-manifest-iter1.json'));
  fs.writeFileSync(path.join(dir, 'findings-security-reviewer-iter1.json'), 'unassigned junk');
  const result = run(dir, ['--prepare-manifest', '--review-files', file]);
  assert.strictEqual(result.status, 0, result.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'fixer-manifest-iter1.json')));
  assert.strictEqual(manifest.reviews.length, 1);
  assert.deepStrictEqual(manifest.reviews[0].counts, { critical: 0, major: 1, minor: 0 });
  assert.strictEqual(manifest.reviews[0].review_mode, 'initial-audit');
  assert.strictEqual(run(dir).status, 0);
  assert.deepStrictEqual(JSON.parse(result.stdout).reviews, manifest.reviews);
  assert.ok(!result.stdout.includes('Named invariant'));
}));
test('invalid prepared manifests never replace a valid prior artifact', () => fixture(dir => {
  const file = write(dir, review());
  const old = fs.readFileSync(path.join(dir, 'fixer-manifest-iter1.json'), 'utf8');
  for (const files of [file + ',' + file, '../outside.json', 'findings-code-quality-reviewer-iter2.json']) {
    const result = run(dir, ['--prepare-manifest', '--review-files', files]);
    assert.notStrictEqual(result.status, 0);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'fixer-manifest-iter1.json'), 'utf8'), old);
  }
}));
test('the helper closure loads independently of the source tree', () => fixture(dir => {
  const manifest = require('../lib/external-runner-manifest');
  assert.strictEqual(typeof manifest.checkedHelperEntries, 'function', 'missing checked helper export closure');
  const entries = manifest.checkedHelperEntries(['validation-session.js', 'persist-unworked-findings.js', 'validate-fixer-result.js']);
  for (const entry of entries) fs.copyFileSync(path.join(ROOT, entry.source), path.join(dir, entry.installed));
  for (const name of ['validation-session.js', 'validate-fixer-result.js']) {
    const result = spawnSync(process.execPath, ['-e', 'require(process.argv[1])', path.join(dir, name)], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
  }
  const persisted = spawnSync(process.execPath, [path.join(dir, 'persist-unworked-findings.js'), '--findings-dir', dir, '--specs-dir', dir, '--task-id', 'smoke'], { encoding: 'utf8' });
  assert.strictEqual(persisted.status, 0, persisted.stderr);
  assert.ok(!entries.some(entry => entry.installed === 'groundwork-run.js'));
}));
test('batch instructions route supported harnesses through the serial runner', () => {
  const body = fs.readFileSync(path.join(ROOT, 'skills/just-do-it/SKILL.md'), 'utf8');
  assert.ok(body.includes('node ${CLAUDE_PLUGIN_ROOT}/bin/groundwork-run.js all'));
  assert.ok(body.includes('Do not plan, prepare, implement, or validate a later task'));
  assert.ok(body.includes('finalize-task'));
  const { phasePrompt } = require('../bin/groundwork-run');
  assert.ok(phasePrompt('plan', { harness: 'codex', taskId: 'TASK-001', repoRoot: '/repo',
    projectRoot: '/repo', specsDir: '/repo/specs' }).includes('Do not work on another task'));
});
process.exitCode = failed ? 1 : 0;
