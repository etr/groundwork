/** Shared validation closure semantics must remain harness-neutral. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const validate = fs.readFileSync(path.join(ROOT, 'skills', 'validate', 'SKILL.md'), 'utf8');
const fixer = fs.readFileSync(path.join(ROOT, 'agents', 'validation-fixer', 'AGENT.md'), 'utf8');
const justDoIt = fs.readFileSync(path.join(ROOT, 'skills', 'just-do-it', 'SKILL.md'), 'utf8');
const protocolPath = path.join(ROOT, 'references', 'validation-review-protocol.md');
const sessionProtocolPath = path.join(ROOT, 'references', 'validation-session-protocol.md');
const reviewers = [
  'architecture-alignment-checker',
  'cloud-infrastructure-reviewer',
  'code-quality-reviewer',
  'code-simplifier',
  'conventions-reviewer',
  'design-consistency-checker',
  'housekeeper',
  'performance-reviewer',
  'security-reviewer',
  'spec-alignment-checker',
  'test-quality-reviewer',
];

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

console.log('\nvalidation-closure-contract');

test('defines one shared initial-audit and closure-review protocol', () => {
  assert.ok(fs.existsSync(protocolPath), 'missing shared validation review protocol');
  const protocol = fs.readFileSync(protocolPath, 'utf8');
  assert.ok(protocol.includes('initial-audit'));
  assert.ok(protocol.includes('closure-review'));
  assert.ok(protocol.includes('introduced-by-fix'));
  assert.ok(protocol.includes('exposed-by-fix'));
  assert.ok(protocol.includes('invalidated-prior-assumption'));
  assert.ok(protocol.includes('initial-audit-miss'));
  assert.ok(protocol.includes('scope-expansion'));
  assert.ok(protocol.includes('Do not re-audit unchanged code'));
  assert.ok(protocol.includes('Approve immediately'));
});

test('makes every implementation reviewer load the shared protocol', () => {
  for (const reviewer of reviewers) {
    const body = fs.readFileSync(path.join(ROOT, 'agents', reviewer, 'AGENT.md'), 'utf8');
    assert.ok(
      body.includes('${CLAUDE_PLUGIN_ROOT}/references/validation-review-protocol.md'),
      `${reviewer} does not load the shared review protocol`
    );
    assert.ok(
      body.includes('"review_mode": "<review_mode from prompt>"'),
      `${reviewer} does not persist review_mode in its artifact`
    );
  }
});

test('makes the coordinator own semantic closure without invented terminal states', () => {
  assert.ok(validate.includes('review_mode: initial-audit'));
  assert.ok(validate.includes('review_mode: closure-review'));
  assert.ok(validate.includes('closure brief'));
  assert.ok(validate.includes('repair envelope'));
  assert.ok(validate.includes('baseline-compatible'));
  assert.ok(validate.includes('initial-audit-miss'));
  assert.ok(!validate.includes('REPLAN_REQUIRED'));
  assert.ok(!validate.includes('BASELINE_INVALIDATED'));
  assert.ok(!validate.includes('You MUST continue this loop until ALL agents return `approve`. No exceptions.'));
});

test('requires the fixer to classify scope before mutation', () => {
  assert.ok(fixer.includes('baseline-compatible-repair'));
  assert.ok(fixer.includes('conflicts-with-baseline'));
  assert.ok(fixer.includes('requires-clarification'));
  assert.ok(fixer.includes('not-reproduced'));
  assert.ok(fixer.includes('Repair size alone is never a reason to skip'));
  assert.ok(!fixer.includes('requires-reimplementation'));
  assert.ok(!fixer.includes('REPLAN_REQUIRED'));
});

test('routes batch execution through the same validation state machine', () => {
  assert.ok(validate.includes('--noninteractive'));
  assert.ok(justDoIt.includes('Skill(skill="groundwork:validate", args="--noninteractive")'));
  assert.ok(!justDoIt.includes('#### Phase D: Fix Loop (if needed)'));
  assert.ok(!justDoIt.includes('REPLAN_REQUIRED'));
  assert.ok(!justDoIt.includes('BASELINE_INVALIDATED'));
});

test('persists validation closure state and transactional fixer recovery', () => {
  assert.ok(fs.existsSync(sessionProtocolPath), 'missing validation session protocol');
  const sessionProtocol = fs.readFileSync(sessionProtocolPath, 'utf8');
  assert.ok(validate.includes('${CLAUDE_PLUGIN_ROOT}/references/validation-session-protocol.md'));
  assert.ok(validate.includes('validation-session.js open'));
  assert.ok(validate.includes('validation-session.js begin-fixer'));
  assert.ok(validate.includes('validation-session.js complete-fixer'));
  assert.ok(validate.includes('validation-session.js complete'));
  assert.ok(sessionProtocol.includes('initial-audit-pending'));
  assert.ok(sessionProtocol.includes('fixer-inflight'));
  assert.ok(sessionProtocol.includes('needs-recovery'));
  assert.ok(sessionProtocol.includes('Do not restart the initial audit'));
  assert.ok(sessionProtocol.includes('quarantine'));
});

console.log(`\nTests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
