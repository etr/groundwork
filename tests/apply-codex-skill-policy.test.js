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

test('does not add a Codex-only initial project-gate barrier', () => {
  const exported = applyPolicy('validate', validateSource);

  assert.ok(!exported.includes('### 1.75. Project Gate Barrier'));
  assert.ok(!exported.includes('findings-project-gates-iter<N>.json'));
  assert.ok(!exported.includes('agent `project-gates`'));
  assert.ok(!exported.includes('return to the Project Gate Barrier'));
  assert.ok(exported.includes('Run every required post-fix project gate on the current worktree'));
});

test('limits fixer scope and passes complete targeted re-review context', () => {
  const exported = applyPolicy('validate', validateSource);

  assert.ok(exported.includes('Only findings owned by `request-changes` reviews'));
  assert.ok(exported.includes('Approved actionable major findings remain unworked findings'));
  assert.ok(exported.includes('prior finding records and status'));
  assert.ok(exported.includes('validated semantic repair claims'));
  assert.ok(exported.includes('repair delta'));
  assert.ok(!exported.includes('current project-gate result'));
  assert.ok(exported.includes('Reviewer prompts may contain only'));
  assert.ok(exported.includes('prior finding IDs/status'));
  assert.ok(exported.includes('Fixer prompts may contain only'));
  assert.ok(exported.includes('validator path'));
  assert.ok(!exported.includes('Build the list of `findings_file` paths'));
  assert.ok(!exported.includes('FINDINGS FILES:'));
  assert.ok(exported.includes('Pass only `findings_dir`, the manifest basename, and `fixer_result_file`'));
});

test('turns Codex rechecks into causal closure reviews', () => {
  const exported = applyPolicy('validate', validateSource);

  assert.ok(exported.includes('review_mode: initial-audit'));
  assert.ok(exported.includes('review_mode: closure-review'));
  assert.ok(exported.includes('coordinator-authored closure brief'));
  assert.ok(exported.includes('Do not re-audit unchanged code'));
  assert.ok(exported.includes('introduced-by-fix'));
  assert.ok(exported.includes('exposed-by-fix'));
  assert.ok(exported.includes('invalidated-prior-assumption'));
  assert.ok(exported.includes('initial-audit-miss'));
  assert.ok(exported.includes('scope-expansion'));
  assert.ok(exported.includes('causal reference to the fixer delta'));
  assert.ok(exported.includes('A concrete `initial-audit-miss` inside the frozen baseline may still request changes'));
  assert.ok(!exported.includes('REPLAN_REQUIRED'));
  assert.ok(!exported.includes('BASELINE_INVALIDATED'));
});

test('makes cross-domain Sol elevation and concurrent fan-out executable', () => {
  const exported = applyPolicy('validate', validateSource);

  assert.ok(exported.includes('Use Terra/medium for the validation coordinator'));
  assert.ok(!exported.includes('Use Sol/high for the validation coordinator'));
  assert.ok(exported.includes('two or more reviewer domains'));
  assert.ok(exported.includes('closure review rejected the immediately preceding fix'));
  assert.ok(exported.includes('spawn a default agent with `fork_turns="none"`, model `gpt-6.1-sol`, and `reasoning_effort: "high"`'));
  assert.ok(exported.includes('Emit every independent reviewer `spawn_agent` call in one batch'));
  assert.ok(exported.includes('wait once for the batch'));
  assert.ok(exported.includes('Never issue fixed-interval status polls'));
});

test('routine coordinator effort is consistent across entry points without lowering review effort', () => {
  const workOnSource = fs.readFileSync(path.join(ROOT, 'skills', 'work-on', 'SKILL.md'), 'utf8');
  const validate = applyPolicy('validate', validateSource);
  const workOn = applyPolicy('work-on', workOnSource);
  assert.ok(workOn.includes('model `Terra` at `medium` effort'));
  assert.ok(!validate.includes('Use Terra/high for the validation coordinator'));
  assert.ok(validate.includes('Security remains Sol/high'));
  assert.ok(validate.includes('Use Terra/high for routine validation leaves'));
});

test('completion guidance reaches coordinators and preserves honest acceptance', () => {
  for (const name of ['validate', 'work-on', 'build-unplanned', 'just-do-it']) {
    const source = fs.readFileSync(path.join(ROOT, 'skills', name, 'SKILL.md'), 'utf8');
    const exported = applyPolicy(name, source);
    assert.strictEqual(exported.split('## Codex Completion Discipline').length - 1, 1, name);
    assert.ok(exported.includes('covered inputs change'), name);
    assert.ok(exported.includes('Do not add speculative safeguards'), name);
    assert.ok(exported.includes('An unavailable or failed required check remains incomplete'), name);
  }
  assert.ok(!applyPolicy('debug', '# Debug').includes('Codex Completion Discipline'));
  assert.ok(applyPolicy('validate', validateSource).includes('no net reduction in unresolved blocking invariants'));
  const security = fs.readFileSync(path.join(ROOT, 'agents', 'security-reviewer', 'AGENT.md'), 'utf8');
  assert.ok(applyAgentPolicy('security-reviewer', security).includes('violated baseline requirement, concrete failure evidence, and blocking consequence'));
});

test('fixer consumes only validator-authorized requested findings', () => {
  const exported = applyAgentPolicy('validation-fixer', fixerSource);

  assert.ok(exported.includes('Fix only the requested finding IDs returned by that validation command'));
  assert.ok(exported.includes('Do not fix major findings from an `approve` review'));
  assert.ok(!exported.includes('Address all `critical` and `major` findings across all files'));
  assert.ok(!exported.includes('If a prompt explicitly asks for a different scope'));
  assert.ok(!exported.includes('build it as `{agent}-iter{iteration}-{id}` from each file'));
});

test('fixer receives no synthetic project-gate authority', () => {
  const exported = applyAgentPolicy('validation-fixer', fixerSource);

  assert.ok(!exported.includes('A project-gate finding does not expand the frozen validation baseline'));
  assert.ok(exported.includes('continue through newly exposed failures of the same gate invariant'));
});

test('Codex fixer reports semantic repairs without treating repair size as a blocker', () => {
  const exported = applyAgentPolicy('validation-fixer', fixerSource);

  assert.ok(exported.includes('repair envelope'));
  assert.ok(exported.includes('repair_claims'));
  assert.ok(exported.includes('contracts_changed'));
  assert.ok(exported.includes('baseline-compatible-repair'));
  assert.ok(exported.includes('Repair size alone'));
  assert.ok(!exported.includes('baseline_invalidated'));
  assert.ok(!exported.includes('replan-required'));
});

test('Codex reviewers enforce closure mode independently of coordinator wording', () => {
  const securitySource = fs.readFileSync(
    path.join(ROOT, 'agents', 'security-reviewer', 'AGENT.md'),
    'utf8'
  );
  const exported = applyAgentPolicy('security-reviewer', securitySource);

  assert.ok(exported.includes('Codex Closure Enforcement'));
  assert.ok(exported.includes('closure-review'));
  assert.ok(exported.includes('causal_ref'));
  assert.ok(exported.includes('scope-expansion'));
  assert.ok(exported.includes('Approve immediately'));
});

test('renders Codex defaults without collapsing balanced and deep overrides', () => {
  const { applyToText } = require('../lib/model-override');
  const text = 'Use Terra/medium, Sol/high, Luna/low, and model `gpt-6.1-sol`.';
  assert.strictEqual(
    applyToText({}, 'skill', 'work-on', text, 'codex'),
    'Use gpt-6.1-sol/medium, gpt-6.1-sol/high, gpt-6-luna/low, and model `gpt-6.1-sol`.'
  );
  assert.strictEqual(
    applyToText({ translation: { balanced: 'gpt-6.1-sol', deep: 'custom-deep' } },
      'skill', 'work-on', text, 'codex'),
    'Use gpt-6.1-sol/medium, custom-deep/high, gpt-6-luna/low, and model `custom-deep`.'
  );
  assert.strictEqual(
    applyToText({ translation: { balanced: 'custom-balanced', deep: 'custom-deep' }, effort: 'max' },
      'skill', 'work-on', text, 'codex'),
    'Use custom-balanced/max, custom-deep/max, gpt-6-luna/max, and model `custom-deep`.'
  );
});

test('preserves isolated delegation while assigning monitoring to one executor', () => {
  for (const name of ['work-on', 'implement-task']) {
    const source = fs.readFileSync(path.join(ROOT, 'skills', name, 'SKILL.md'), 'utf8');
    const exported = applyPolicy(name, source);
    for (const text of [source, exported]) {
      assert.match(text, /executor owns implementation and test monitoring/i);
      assert.match(text, /completion, a concrete blocker, or a required decision/i);
      assert.match(text, /do not request periodic progress/i);
    }
    if (name === 'work-on') {
      assert.ok(exported.includes('fork_turns="none"'));
      assert.ok(exported.includes('description `Validate [TASK-NNN]`'));
    } else {
      assert.ok(exported.includes('subagent_type="groundwork:task-executor:task-executor"'));
      assert.strictEqual((exported.match(/REPORTING:/g) || []).length, 2);
    }
  }
  const executor = fs.readFileSync(path.join(ROOT, 'agents', 'task-executor', 'AGENT.md'), 'utf8');
  const exported = applyAgentPolicy('task-executor', executor);
  assert.match(exported, /implementation and test monitoring/i);
  assert.match(exported, /completion, a concrete blocker, or a required decision/i);
  assert.ok(exported.includes('groundwork:test-driven-development'));
  assert.ok(exported.includes('RESULT: IMPLEMENTED'));
});

test('reports missing verification infrastructure without silently expanding the task', () => {
  for (const name of ['validate', 'work-on', 'implement-task']) {
    const source = fs.readFileSync(path.join(ROOT, 'skills', name, 'SKILL.md'), 'utf8');
    const exported = applyPolicy(name, source);
    assert.match(exported, /missing shared verification infrastructure/i);
    assert.match(exported, /blocked dependency/i);
    assert.match(exported, /required check remains incomplete/i);
  }
  const protocol = fs.readFileSync(path.join(ROOT, 'references', 'validation-review-protocol.md'), 'utf8');
  assert.match(protocol, /baseline requirement.*concrete failure evidence/i);
  assert.match(protocol, /missing shared verification infrastructure/i);
});

console.log(`\nTests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
