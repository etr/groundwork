/** Behavioral tests for Codex-only skill policy transforms. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { applyAgentPolicy, applyPolicy } = require('../lib/apply-codex-skill-policy');

const ROOT = path.resolve(__dirname, '..');
const validateSource = fs.readFileSync(path.join(ROOT, 'skills', 'validate', 'SKILL.md'), 'utf8');
const fixerSource = fs.readFileSync(path.join(ROOT, 'agents', 'validation-fixer', 'AGENT.md'), 'utf8');

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

console.log('\napply-codex-skill-policy');

test('requires project gates and reviewer approval on the same unchanged tree', () => {
  const exported = applyPolicy('validate', validateSource);

  assert.ok(exported.includes('before the first reviewer batch'));
  assert.ok(exported.includes('after every fixer mutation, before re-review'));
  assert.ok(exported.includes('same unchanged worktree state'));
  assert.ok(exported.includes('Do not declare PASS and then run a mutating fixer'));
  assert.ok(exported.includes('### 1.75. Project Gate Barrier'));
  assert.ok(!exported.includes('   - ALL approve → **PASS**, return success'));
});

test('preserves complete gate failures as stable manifest findings', () => {
  const exported = applyPolicy('validate', validateSource);

  assert.ok(exported.includes('Never pipe gate output through `tail`'));
  assert.ok(exported.includes('complete failure inventory'));
  assert.ok(exported.includes('reported failure count differs from the parsed inventory'));
  assert.ok(exported.includes('findings-project-gates-iter<N>.json'));
  assert.ok(exported.includes('command + check + file + normalized message'));
  assert.ok(exported.includes('category` as `gate:<normalized-command>:<normalized-check>'));
});

test('limits fixer scope and passes complete targeted re-review context', () => {
  const exported = applyPolicy('validate', validateSource);

  assert.ok(exported.includes('Only findings owned by `request-changes` reviews'));
  assert.ok(exported.includes('Approved major findings remain unworked findings'));
  assert.ok(exported.includes('prior finding IDs and status'));
  assert.ok(exported.includes('validated fixer result'));
  assert.ok(exported.includes('post-fix changed paths and diff stat'));
  assert.ok(exported.includes('current project-gate result'));
  assert.ok(exported.includes('Reviewer prompts may contain only'));
  assert.ok(exported.includes('prior finding IDs/status'));
  assert.ok(exported.includes('Fixer prompts may contain only'));
  assert.ok(exported.includes('validator path'));
  assert.ok(!exported.includes('Build the list of `findings_file` paths'));
  assert.ok(!exported.includes('FINDINGS FILES:'));
  assert.ok(exported.includes('Pass only `findings_dir`, the manifest basename, and `fixer_result_file`'));
});

test('makes cross-domain Sol elevation and concurrent fan-out executable', () => {
  const exported = applyPolicy('validate', validateSource);

  assert.ok(exported.includes('two or more reviewer domains'));
  assert.ok(exported.includes('spawn a default agent with `fork_turns="none"`, model `gpt-5.6-sol`, and `reasoning_effort: "high"`'));
  assert.ok(exported.includes('Emit every independent reviewer `spawn_agent` call in one batch'));
  assert.ok(exported.includes('wait once for the batch'));
  assert.ok(exported.includes('Never issue fixed-interval status polls'));
});

test('fixer consumes only validator-authorized requested findings', () => {
  const exported = applyAgentPolicy('validation-fixer', fixerSource);

  assert.ok(exported.includes('Fix only the requested finding IDs returned by that validation command'));
  assert.ok(exported.includes('Do not fix major findings from an `approve` review'));
  assert.ok(!exported.includes('Address all `critical` and `major` findings across all files'));
  assert.ok(!exported.includes('If a prompt explicitly asks for a different scope'));
  assert.ok(!exported.includes('build it as `{agent}-iter{iteration}-{id}` from each file'));
});

console.log(`\nTests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
