/**
 * Every skill description is loaded into context in every session, and on
 * export it is the only place a flag is advertised (argument-hint is dropped
 * and a "Usage /groundwork:" suffix is stripped). Keep them short, specific,
 * and consistent.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SKILLS = path.join(__dirname, '..', 'skills');
const skills = fs.readdirSync(SKILLS).filter((name) => fs.existsSync(path.join(SKILLS, name, 'SKILL.md')));
const frontmatter = (name) => fs.readFileSync(path.join(SKILLS, name, 'SKILL.md'), 'utf8').split('\n---')[0];
const description = (name) => frontmatter(name).match(/^description:[ \t]*(.*)$/m)[1].trim();
const hint = (name) => (frontmatter(name).match(/^argument-hint:[ \t]*(.*)$/m) || [])[1];

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n      ${error.message}`);
  }
}

console.log('skill-descriptions.test.js');

test('no description opens with a generic phrase or repeats the usage line', () => {
  const generic = skills.filter((name) => /^This skill should be used when/i.test(description(name)));
  assert.deepStrictEqual(generic, [], `generic openers: ${generic.join(', ')}`);
  const usage = skills.filter((name) => /Usage \/groundwork:/.test(description(name)));
  assert.deepStrictEqual(usage, [], `"Usage /groundwork:" belongs in argument-hint, not the description: ${usage.join(', ')}`);
});

test('descriptions stay short; only the multi-flag batch skills run long', () => {
  // About 330 characters fits a one-sentence purpose plus two flags; beyond
  // that only the skills that carry three flags, or the survey skill's
  // scoping argument, have a reason (validate carries the unrelated-failure
  // modes and --noninteractive).
  const long = skills.filter((name) => description(name).length > 340);
  assert.deepStrictEqual(long.sort(), ['improve-codebase-architecture', 'just-do-it', 'just-do-it-swarming', 'validate', 'work-on'], 'over 340 characters');
  const huge = skills.filter((name) => description(name).length > 440);
  assert.deepStrictEqual(huge, [], 'over 440 characters');
  const total = skills.reduce((n, name) => n + description(name).length, 0);
  assert.ok(total <= 7500, `always-loaded description text grew to ${total} characters`);
});

test('every flag an argument-hint advertises is explained in portable prose', () => {
  const missing = [];
  for (const name of skills) {
    const text = hint(name);
    if (!text) continue;
    for (const flag of text.match(/--[a-z-]+/g) || []) {
      if (flag === '--project') continue; // spelled "--project name" in the hint, "--project <name>" in prose
      if (!description(name).includes(flag)) missing.push(`${name}: ${flag}`);
    }
  }
  assert.deepStrictEqual(missing, [], `flags advertised only in argument-hint: ${missing.join(', ')}`);
});

test('a shared flag is described with one wording wherever it appears', () => {
  for (const name of skills) {
    const d = description(name);
    if (/--on-unrelated-failure/.test(d) && name !== 'finalize-task') {
      assert.ok(d.includes('--on-unrelated-failure stop-and-ask|expand-and-fix|ignore-and-merge - how validation treats gate failures unrelated to the active project (default stop-and-ask)'), `${name}: --on-unrelated-failure wording`);
    }
    if (/--take-over/.test(d)) {
      assert.ok(d.includes('--take-over resumes past a possibly-live prior session without asking'), `${name}: --take-over wording`);
    }
    if (/--project/.test(d)) {
      assert.ok(d.includes('--project <name> pins the monorepo package for the whole run'), `${name}: --project wording`);
    }
  }
});

test('a description is one plain YAML line (no ": " inside an unquoted scalar)', () => {
  for (const name of skills) {
    const d = description(name);
    assert.ok(!/\n/.test(d), `${name}: multi-line description`);
    assert.ok(!(/^["']/.test(d) ? false : /: /.test(d)), `${name}: ": " would break the plain scalar`);
    assert.ok(d.length >= 20, `${name}: too short to route by`);
  }
});

if (failed > 0) {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`\n${passed} passed, 0 failed`);
