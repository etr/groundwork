/**
 * Task-executing skills must honor --on-unrelated-failure
 * <stop-and-ask|expand-and-fix|ignore-and-merge>.
 *
 * Validation correctly blocks publication when repo-wide gates fail. In
 * monorepos those failures are often confidently unrelated to the active
 * project; the flag selects the disposition for that assessment, keeping
 * stop-and-ask (the historical behavior) as the default. These tests pin:
 * the argument surface on every task-executing skill, stop-and-ask as the
 * documented default, eligibility limited to the confident Unrelated
 * assessment, downstream threading (work-on → validate, just-do-it phases
 * C/E, swarming teammate prompts, finalize-task's waived-pass entry), the
 * PASSED-WITH-WAIVERS terminal contract, and the waiver-receipt record
 * shape in the shared session protocol.
 *
 * Run with: node tests/on-unrelated-failure.test.js
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
    console.log(`    ${error.message}`);
    failed++;
  }
}

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function readSkill(name) {
  return fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', name, 'SKILL.md'), 'utf8');
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, 'SKILL.md has YAML frontmatter');
  return match[1];
}

const MODES = ['stop-and-ask', 'expand-and-fix', 'ignore-and-merge'];

// work-on-next-task has no argument-hint by design; description-only there.
const HINT_SKILLS = ['validate', 'work-on', 'just-do-it', 'just-do-it-swarming', 'finalize-task', 'build-unplanned'];
const ALL_SKILLS = [...HINT_SKILLS, 'work-on-next-task'];

describe('Argument surface', () => {
  for (const skill of HINT_SKILLS) {
    test(`${skill} advertises the flag in argument-hint`, () => {
      const frontmatter = parseFrontmatter(readSkill(skill));
      assert.ok(/argument-hint:.*--on-unrelated-failure/.test(frontmatter),
        `${skill} frontmatter must advertise --on-unrelated-failure in argument-hint`);
    });
  }

  for (const skill of ALL_SKILLS) {
    test(`${skill} mentions the flag in its description`, () => {
      const frontmatter = parseFrontmatter(readSkill(skill));
      assert.ok(/description:.*--on-unrelated-failure/.test(frontmatter),
        `${skill} description should mention --on-unrelated-failure (portable across exports)`);
    });
  }

  for (const skill of ALL_SKILLS) {
    test(`${skill} documents stop-and-ask as the default`, () => {
      const content = readSkill(skill);
      assert.ok(/default[^.]*stop-and-ask|stop-and-ask[^.)]*\(default/.test(content),
        `${skill} must state that stop-and-ask is the default mode`);
    });
  }
});

describe('Validate owns the policy', () => {
  const content = readSkill('validate');

  test('documents every mode action in the incidental-failure policy', () => {
    for (const mode of MODES) {
      assert.ok(content.includes(`\`${mode}\``), `validate must document the ${mode} mode action`);
    }
  });

  test('PASSED-WITH-WAIVERS is a terminal result emitted only after waiver receipts', () => {
    assert.ok(/Validation PASSED-WITH-WAIVERS \(\{N\} iter/.test(content),
      'validate must define the PASSED-WITH-WAIVERS terminal line');
    assert.ok(/unrelated gates waived/.test(content),
      'the terminal line must count waived gates');
    assert.ok(/never present a waived gate as passed/i.test(content),
      'waived gates must never be presented as passed');
  });

  test('only the confident Unrelated assessment is eligible; uncertain falls back to stop-and-ask', () => {
    assert.ok(/never eligible for the unrelated-failure modes/.test(content),
      'the uncertain assessment must be explicitly ineligible');
    assert.ok(/stop-and-ask.*outcome/i.test(content),
      'ineligible cases must fall back to the stop-and-ask outcome');
  });

  test('the flag does not apply in runner mode', () => {
    assert.ok(/does not apply in runner mode/.test(content),
      'runner mode keeps the unchanged failure path');
  });

  test('expand-and-fix preserves the orchestrator source-write hard rule', () => {
    assert.ok(/validation-fixer.*Hard Rule still applies|Hard Rule still applies/.test(content),
      'expanded repairs must still go through the validation-fixer subagent');
  });
});

describe('Downstream threading', () => {
  test('work-on parses the flag and threads it to validate', () => {
    const content = readSkill('work-on');
    assert.ok(/--on-unrelated-failure <mode>.*also accepted anywhere in the argument/.test(content),
      'work-on Step 1 must parse the flag like --take-over');
    assert.ok(/Call: `Skill\(skill="groundwork:validate"\)`\. When the invocation carried `--on-unrelated-failure <mode>` other than the default, include the flag in that call's arguments/.test(content),
      'work-on Step 4 must forward the mode to validate (prose form — args inside the Skill() call do not survive export)');
    assert.ok(/Validation PASSED-WITH-WAIVERS/.test(content),
      'work-on must handle the waived-pass outcome');
  });

  test('work-on final checklist accepts only PASS or a receipt-backed waived pass', () => {
    const content = readSkill('work-on');
    assert.ok(/PASS, or PASSED-WITH-WAIVERS under `--on-unrelated-failure ignore-and-merge` with waiver receipts recorded/.test(content),
      'the checklist must keep stop-and-ask as the only no-receipt pass path');
  });

  test('just-do-it threads the flag through Phase C and Phase E', () => {
    const content = readSkill('just-do-it');
    assert.ok(/forwarded to every Phase C validate invocation and Phase E finalize-task invocation/.test(content),
      'Step 0 must remember the flag for the whole run');
    assert.ok(/--on-unrelated-failure <mode> --noninteractive/.test(content),
      'Phase C must combine the mode with --noninteractive');
    assert.ok(/\[TASK-NNN\] --on-unrelated-failure ignore-and-merge/.test(content),
      'Phase E must forward ignore-and-merge to finalize-task');
  });

  test('work-on-next-task passes the flag through to work-on', () => {
    const content = readSkill('work-on-next-task');
    assert.ok(/args="<task-id> \[--take-over\] \[--on-unrelated-failure <mode>\]"/.test(content),
      'Step 4 must include the flag in the work-on delegation');
  });

  test('just-do-it-swarming records the mode in teammate spawn prompts', () => {
    const content = readSkill('just-do-it-swarming');
    assert.ok(/ON UNRELATED FAILURE: \[mode/.test(content),
      'teammate spawn prompt must carry the mode');
    assert.ok(/WAIVED: <gate> — <one-line evidence>/.test(content),
      'teammate completion reports must relay waived gates');
  });

  test('finalize-task accepts a waived pass only under ignore-and-merge with receipts', () => {
    const content = readSkill('finalize-task');
    assert.ok(/PASSED-WITH-WAIVERS` outcome counts as a pass \*\*only\*\* when this invocation carried `--on-unrelated-failure ignore-and-merge`/.test(content),
      'waived-pass acceptance must be gated on the explicit flag');
    assert.ok(/at least one waiver receipt/.test(content),
      'acceptance must require recorded waiver receipts');
    assert.ok(/name each waived gate as waived \(never as passed\)/.test(content),
      'the merge message must report waivers as waived');
  });
});

describe('Session protocol records waivers', () => {
  test('validation-session-protocol defines the waiver receipt shape and gates-complete amendment', () => {
    const content = fs.readFileSync(
      path.join(PLUGIN_ROOT, 'references', 'validation-session-protocol.md'), 'utf8');
    assert.ok(/"type":"gate-waiver"/.test(content),
      'the protocol must define the gate-waiver receipt shape');
    assert.ok(/authorized_by":"--on-unrelated-failure ignore-and-merge"/.test(content),
      'receipts must record the authorizing flag');
    assert.ok(/waived.*may transition the session toward `gates-complete`.*failed-but-not-waived gate still may not/s.test(content),
      'a waived gate — and only a waived gate — may pass the gates-complete boundary');
    assert.ok(/no new session stage, schema field, counter, or separate tracking file/.test(content),
      'the record-keeping constraint must be preserved');
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
