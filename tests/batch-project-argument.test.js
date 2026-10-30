/**
 * Batch skills must honor an explicit --project argument instead of
 * re-selecting the shared project.
 *
 * Concurrent batch sessions on the same monorepo (each on a different
 * package) previously collided: the batch skills ignored their argument and
 * Step 0 unconditionally invoked select-project whenever {{project_name}}
 * resolved empty, flipping the workspace-level selection shared by every
 * pane-less session. These tests pin the contract that an explicit
 * `--project <name>` is the highest-precedence resolution, never triggers
 * select-project or a persisted selection change, and is threaded to
 * downstream invocations.
 *
 * Run with: node tests/batch-project-argument.test.js
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

const BATCH_SKILLS = ['just-do-it', 'just-do-it-swarming'];

describe('Batch skill argument surface', () => {
  for (const skill of BATCH_SKILLS) {
    test(`${skill} declares a --project argument hint`, () => {
      const frontmatter = parseFrontmatter(readSkill(skill));
      assert.ok(/argument-hint:.*--project/.test(frontmatter),
        `${skill} frontmatter must advertise --project in argument-hint`);
      assert.ok(/description:.*--project/.test(frontmatter),
        `${skill} description should mention --project usage`);
    });
  }
});

describe('Batch skills: explicit project precedence (Step 0 item 0)', () => {
  for (const skill of BATCH_SKILLS) {
    const content = readSkill(skill);

    test(`${skill} resolves an explicit --project with highest precedence`, () => {
      assert.ok(/Explicit project argument \(highest precedence\)/.test(content),
        'Step 0 must open with the explicit-project branch');
      assert.ok(/configured in `\.groundwork\.yml`/.test(content),
        'the branch must resolve the project from .groundwork.yml');
    });

    test(`${skill} explicit branch precedes the monorepo/{{project_name}} check`, () => {
      const explicitIndex = content.indexOf('Explicit project argument (highest precedence)');
      const monorepoIndex = content.indexOf('**Monorepo check:**');
      assert.ok(explicitIndex !== -1 && monorepoIndex !== -1, 'both Step 0 branches exist');
      assert.ok(explicitIndex < monorepoIndex,
        'the explicit-project branch must be evaluated before the {{project_name}} check');
    });

    test(`${skill} never invokes select-project or persists a selection under an explicit project`, () => {
      const explicitStart = content.indexOf('Explicit project argument (highest precedence)');
      const explicitBranch = content.slice(explicitStart, content.indexOf('1. **Monorepo check:**'));
      assert.ok(/Do NOT invoke `select-project`/.test(explicitBranch),
        'explicit branch must forbid invoking select-project');
      assert.ok(/do NOT persist or change the stored selection/.test(explicitBranch),
        'explicit branch must forbid changing the persisted selection');
      assert.ok(/never run it when an explicit `--project` was provided/.test(content),
        'the select-project fallback must be annotated as never applying to an explicit project');
    });
  }
});

describe('Batch skills: threading the explicit project downstream', () => {
  for (const skill of BATCH_SKILLS) {
    test(`${skill} threads the project to the worktree helper and lib calls`, () => {
      const content = readSkill(skill);
      assert.ok(/worktree-identity\.js TASK-NNN --project <name>/.test(content),
        'worktree-identity must be called with --project <name>');
      assert.ok(/GROUNDWORK_PROJECT=<name>/.test(content),
        'other lib calls must be prefixed with GROUNDWORK_PROJECT=<name>');
    });

    test(`${skill} maps template vars to the resolved project paths`, () => {
      const content = readSkill(skill);
      assert.ok(/`<project root>\/specs` for `\{\{specs_dir\}\}`/.test(content),
        'specs paths must come from the resolved project root');
      assert.ok(/`<project root>\/\.groundwork-plans` for `\{\{plans_dir\}\}`/.test(content),
        'plans paths must come from the resolved project root');
    });
  }

  test('just-do-it passes --project to validate and finalize-task', () => {
    const content = readSkill('just-do-it');
    assert.ok(/args="--project <name> --noninteractive"/.test(content),
      'validate must receive --project when one was resolved');
    assert.ok(/\[TASK-NNN\] --project <name>/.test(content),
      'finalize-task must receive --project when one was resolved');
  });

  test('just-do-it-swarming records the project in teammate spawn prompts', () => {
    const content = readSkill('just-do-it-swarming');
    assert.ok(/ACTIVE PROJECT: \[project name from Step 0[^\]]*\]/.test(content),
      'teammate spawn prompt must carry the explicit project');
    assert.ok(/not change the shared selection/.test(content),
      'teammates must be told not to change the shared selection');
  });
});
