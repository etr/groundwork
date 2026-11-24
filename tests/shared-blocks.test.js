/**
 * The Pre-flight block, Step 0's checks, and the manual-merge snippet that
 * many skills share are rendered from one source (lib/sync-shared-blocks.js).
 * These tests keep the copies from drifting back into per-skill variants.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  USAGE, PREFLIGHT_HEADING,
  renderPreflight, renderStep0Items, renderManualMerge,
  preflightRegion, step0Region, manualMergeRegions, renderSkill,
} = require('../lib/sync-shared-blocks.js');

const PLUGIN_ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(PLUGIN_ROOT, 'skills');

const skills = fs.readdirSync(SKILLS_DIR).filter((name) => (
  fs.existsSync(path.join(SKILLS_DIR, name, 'SKILL.md'))
));
const read = (name) => fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
const registered = (block) => Object.keys(USAGE).filter((name) => USAGE[name][block]);

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`      ${error.message.split('\n').join('\n      ')}`);
  }
}

console.log('shared-blocks.test.js');

test('every skill that opens with the Pre-flight heading is registered, and only those', () => {
  const carrying = skills.filter((name) => read(name).includes(`${PREFLIGHT_HEADING}\n`));
  assert.deepStrictEqual(carrying.sort(), registered('preflight').sort());
  assert.ok(carrying.length >= 20, `expected the known corpus, found ${carrying.length}`);
});

test('every skill that runs the monorepo check is registered, and only those', () => {
  const carrying = skills.filter((name) => /\d+\. \*\*Monorepo check:\*\*/.test(read(name)));
  assert.deepStrictEqual(carrying.sort(), registered('step0').sort());
  assert.ok(carrying.length >= 15, `expected the known corpus, found ${carrying.length}`);
});

test('each registered skill carries its rendered blocks byte-for-byte, exactly once', () => {
  const drift = [];
  for (const [name, params] of Object.entries(USAGE)) {
    const text = read(name);
    const lines = text.split('\n');
    if (params.preflight) {
      const region = preflightRegion(lines);
      const rendered = renderPreflight(params.preflight);
      if (!region || lines.slice(region.start, region.end).join('\n') !== rendered
        || text.split(rendered).length !== 2) drift.push(`${name}: preflight`);
    }
    if (params.step0) {
      const region = step0Region(lines);
      const rendered = renderStep0Items(params.step0);
      if (!region || lines.slice(region.start, region.end).join('\n') !== rendered
        || text.split(rendered).length !== 2) drift.push(`${name}: step0`);
    }
  }
  assert.deepStrictEqual(drift, [], `drifted from lib/sync-shared-blocks.js: ${drift.join(', ')} (run: node lib/sync-shared-blocks.js)`);
});

test('the checker is not vacuous: a one-word hand edit in any copy is drift, and re-rendering repairs it', () => {
  const [name, params] = Object.entries(USAGE).find(([, p]) => p.preflight && p.step0);
  const text = read(name);
  assert.strictEqual(renderSkill(name, params, text), null, 'a clean copy must need no change');
  const edited = text.replace('Continue anyway', 'Continue');
  assert.notStrictEqual(edited, text, 'the edit must have applied');
  assert.strictEqual(renderSkill(name, params, edited), text, 're-rendering must restore the canonical text');
});

test('the two model variants differ only where the recommendation differs', () => {
  const standard = renderPreflight({ rationale: 'R.' });
  const oneM = renderPreflight({ rationale: 'R.', model: 'opus-1m' });
  assert.ok(standard.includes('AND you are Sonnet or Opus.'));
  assert.ok(oneM.includes('AND you are Opus (1M context).'));
  assert.ok(standard.includes('Recommended: Sonnet or Opus at high effort.'));
  assert.ok(oneM.includes('Recommended: Opus (1M context) at high effort.'));
  assert.ok(standard.includes('run `/effort high` (and `/model sonnet` if on Haiku)'));
  assert.ok(oneM.includes('run `/model opus[1m]` and `/effort high`'));
  for (const text of [standard, oneM]) {
    // The lines the export installer's ZCode translation keys on.
    assert.ok(text.includes("(the scale is `low` < `medium` < `high` < `xhigh` < `max`, so `xhigh` and `max` are already above `high`)"));
    // Every copy carries the stacking fix and the non-interactive rule.
    assert.ok(text.includes('Ask once per conversation'));
    assert.ok(text.includes('`GROUNDWORK_RUNNER_MODE=true`, or `GROUNDWORK_BATCH_MODE=true`'));
  }
  assert.throws(() => renderPreflight({ rationale: 'R.', model: 'haiku' }), /unknown pre-flight model variant/);
});

test('every copy keeps the anchors the export pipeline keys on', () => {
  for (const name of registered('preflight')) {
    const text = read(name);
    assert.ok(text.includes('{{effort_level}}'), `${name}: effort binding (Codex runtime-context gate)`);
    assert.ok(/AND you are (Sonnet or Opus|Opus \(1M context\))\./.test(text), `${name}: model gate (model detection and translation)`);
  }
});

test('Step 0 variants: the CWD check, the specs check and the proceed line are the only switches', () => {
  const full = renderStep0Items({});
  assert.ok(full.includes('2. **CWD mismatch check (monorepo only):**'));
  assert.ok(full.includes('3. Proceed with the resolved project context.'));
  const monorepoOnly = renderStep0Items({ cwdCheck: false });
  assert.ok(!monorepoOnly.includes('CWD mismatch check'));
  assert.ok(monorepoOnly.includes('2. Proceed with the resolved project context.'));
  const bootstrap = renderStep0Items({ specsCheck: true, proceed: false });
  assert.ok(bootstrap.includes('3. **Check `{{specs_dir}}/`:**'));
  assert.ok(bootstrap.includes('Skill(skill="groundwork:setup-repo")'));
  assert.ok(!bootstrap.includes('Proceed with the resolved project context'));
  const midRun = renderStep0Items({ start: 3, proceed: false });
  assert.ok(midRun.startsWith('3. **Monorepo check:**'));
  assert.ok(midRun.includes('4. **CWD mismatch check'));
  // The unified rules every copy now carries.
  assert.ok(full.includes('or the invocation carried an explicit `--project`'));
  assert.ok(full.includes('with `--noninteractive`, keep the selected project and continue'));
});

test('the pre-consolidation variants are gone from every skill', () => {
  const legacy = [
    /regardless of effort level/,
    /regardless of model/,
    /If CWD doesn't match any project/,
    /Skip if not in monorepo mode/,
    /Continue to item 3\./,
    /"header": "Effort check"/,
    /"header": "Recommended: (Sonnet or Opus|Opus \(1M context\)) at high effort"/,
    /ensure project context is resolved:\*\*/,
  ];
  const hits = [];
  for (const name of skills) {
    const text = read(name);
    for (const re of legacy) {
      if (re.test(text)) hits.push(`${name}: ${re}`);
    }
  }
  assert.deepStrictEqual(hits, []);
});

test('no copy of the Pre-flight JSON envelope remains', () => {
  // The compact block states the prompt; the envelope was 14 lines of scaffolding per skill.
  const hits = skills.filter((name) => /"multiSelect": false\n  \]\}\n\}```\n\nIf the user selects "Cancel — I'll switch first": output the switching commands/.test(read(name)));
  assert.deepStrictEqual(hits, []);
});

test('the manual-merge snippet is the same generated text at every site', () => {
  let sites = 0;
  for (const [name, params] of Object.entries(USAGE)) {
    if (!params.manualMerge) continue;
    const lines = read(name).split('\n');
    const regions = manualMergeRegions(lines);
    assert.strictEqual(regions.length, params.manualMerge.length, `${name}: site count`);
    regions.forEach((region, i) => {
      assert.strictEqual(lines.slice(region.start, region.end).join('\n'), renderManualMerge(params.manualMerge[i]), `${name}: site ${i + 1}`);
      sites += 1;
    });
  }
  assert.ok(sites >= 4, `expected the known corpus, found ${sites} sites`);
});

test('merge and cleanup commands live only in the shared sequence and the generated snippet', () => {
  const reference = fs.readFileSync(path.join(PLUGIN_ROOT, 'references', 'task-merge-sequence.md'), 'utf8');
  assert.ok(reference.includes('git merge --no-ff <branch>'), 'the reference holds the merge');
  assert.ok(!reference.includes('${CLAUDE_PLUGIN_ROOT}') && !/\{\{/.test(reference), 'the reference exports verbatim');
  const command = /^\s*git (?:merge --no-ff|worktree remove|branch -d) /;
  const stray = [];
  for (const name of skills) {
    const lines = read(name).split('\n');
    const generated = new Set();
    for (const region of manualMergeRegions(lines)) {
      for (let k = region.start; k < region.end; k++) generated.add(k);
    }
    lines.forEach((line, i) => {
      if (command.test(line) && !generated.has(i)) stray.push(`${name}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepStrictEqual(stray, [], `merge commands outside the shared sequence:\n  ${stray.join('\n  ')}`);
  for (const name of ['work-on', 'build-unplanned', 'use-git-worktree']) {
    assert.ok(read(name).includes('${CLAUDE_PLUGIN_ROOT}/references/task-merge-sequence.md'), `${name} does not point at the shared merge sequence`);
  }
});

const specBlocks = require('../lib/shared-blocks-specs');

test("create-tasks' task format is the tasks template's block", () => {
  const lines = read('create-tasks').split('\n');
  const region = specBlocks.taskFormatRegion(lines);
  assert.ok(region, 'create-tasks carries the task format block');
  const block = specBlocks.renderTaskFormat();
  assert.strictEqual(lines.slice(region.start, region.end).join('\n'), block, 'run: node lib/sync-shared-blocks.js');
  for (const field of ['**Milestone:**', '**Component:**', '**Estimate:**', '**Goal:**', '**Action Items:**', '**Dependencies:**',
    '**Acceptance Criteria:**', '**Test Seams:**', '**Related Requirements:**', '**Related Decisions:**', '**Status:**']) {
    assert.ok(block.includes(field), `the template is missing ${field}`);
  }
  // The template stays the only place the block is spelled out.
  const template = fs.readFileSync(path.join(PLUGIN_ROOT, 'references', 'tasks', 'tasks-template.md'), 'utf8');
  assert.ok(template.slice(template.indexOf('## Individual Task File Template')).includes(block), 'the template no longer holds the block it is the source of');
});

test('every registered spec-detection site states the full rule, and no partial phrasing remains', () => {
  const registered = Object.keys(USAGE).filter((name) => USAGE[name].specDetection);
  assert.ok(registered.length >= 10, `expected the known corpus, found ${registered.length}`);
  for (const name of registered) {
    const lines = read(name).split('\n');
    const region = specBlocks.specDetectionRegion(lines);
    const text = lines.slice(region.start, region.end).join('\n');
    assert.strictEqual(text, specBlocks.renderSpecDetection(USAGE[name].specDetection), `${name}: run node lib/sync-shared-blocks.js`);
    assert.ok(text.includes('`_index.md` first, then numerically-prefixed files, then alphabetically'), `${name}: the read order`);
  }
  const partial = [];
  for (const name of skills) {
    if (/Check for (?:single )?file first \(takes precedence\), then directory\.|If a directory, aggregate all `\.md` files\./.test(read(name))) {
      partial.push(name);
    }
  }
  assert.deepStrictEqual(partial, [], `partial copies of the rule: ${partial.join(', ')}`);
});

test('the auto-split thresholds come from one table for every producer and every split skill', () => {
  assert.strictEqual(specBlocks.SPLIT_LINE_THRESHOLD, 500);
  assert.strictEqual(specBlocks.SPLIT_DOCS.prd.threshold, 15);
  assert.strictEqual(specBlocks.SPLIT_DOCS.architecture.threshold, 10);
  let callers = 0;
  for (const [name, params] of Object.entries(USAGE)) {
    if (!params.autoSplit) continue;
    const lines = read(name).split('\n');
    if (params.autoSplit.form === 'caller') {
      const region = specBlocks.autoSplitCallerRegion(lines);
      assert.ok(region, `${name}: auto-split check not found`);
      assert.strictEqual(lines.slice(region.start, region.end).join('\n'), specBlocks.renderAutoSplitCaller(params.autoSplit), `${name}: run node lib/sync-shared-blocks.js`);
      callers += 1;
    } else {
      const [summary, thresholds] = [specBlocks.autoSplitSummaryRegion(lines), specBlocks.autoSplitThresholdsRegion(lines)];
      assert.ok(summary && thresholds, `${name}: split-skill sites not found`);
      assert.strictEqual(lines.slice(summary.start, summary.end).join('\n'), specBlocks.renderAutoSplitSummary(params.autoSplit), `${name}: summary`);
      assert.strictEqual(lines.slice(thresholds.start, thresholds.end).join('\n'), specBlocks.renderAutoSplitThresholds(params.autoSplit), `${name}: thresholds`);
    }
  }
  assert.strictEqual(callers, 4, 'one producer and one reverse-engineering skill per document kind');
  // No skill outside the table states a split threshold of its own.
  const stray = [];
  for (const name of skills) {
    if (!USAGE[name]?.autoSplit) continue;
    const text = read(name);
    const d = specBlocks.SPLIT_DOCS[USAGE[name].autoSplit.kind];
    const numbers = [...text.matchAll(/lines? >= (\d+)|\*\*(\d+) lines\*\*/g)].map((m) => Number(m[1] || m[2]));
    const counts = [...text.matchAll(new RegExp(`(?:${d.thing} >= |\\*\\*\\d+ ${d.thing}\\*\\*|headings >= )(\\d+)`, 'g'))].map((m) => Number(m[1]));
    if (numbers.some((n) => n !== specBlocks.SPLIT_LINE_THRESHOLD)) stray.push(`${name}: line threshold`);
    if (counts.some((n) => n !== d.threshold)) stray.push(`${name}: ${d.thing} threshold`);
  }
  assert.deepStrictEqual(stray, [], `a threshold drifted from the table: ${stray.join(', ')}`);
});

test('the plan constraints and the executor task block are shared by plan-task, implement-task, and just-do-it', () => {
  // Plan constraints: one list, so just-do-it cannot drift to weaker planning rules again.
  const planTask = read('plan-task').split('\n');
  const regions = specBlocks.planConstraintsRegions(planTask);
  assert.strictEqual(regions.length, 2, 'plan-task has a task-mode and a feature-mode prompt');
  USAGE['plan-task'].planConstraints.forEach((params, i) => {
    assert.strictEqual(planTask.slice(regions[i].start, regions[i].end).join('\n'), specBlocks.renderPlanConstraints(params), `plan-task site ${i + 1}`);
  });
  const justDoIt = read('just-do-it').split('\n');
  const [batchPlan] = specBlocks.planConstraintsRegions(justDoIt);
  assert.strictEqual(justDoIt.slice(batchPlan.start, batchPlan.end).join('\n'), specBlocks.renderPlanConstraints(USAGE['just-do-it'].planConstraints), 'just-do-it plan constraints: run node lib/sync-shared-blocks.js');
  for (const name of ['plan-task', 'just-do-it']) {
    const text = read(name);
    assert.ok(text.includes('5. If a design system is present, the plan must reference design tokens'), `${name}: the design-system constraint`);
    assert.ok(/1\. Work happens in an isolated git worktree — the plan must instruct the implementer to resolve it with `node \$\{CLAUDE_PLUGIN_ROOT\}\/lib\/worktree-identity\.js/.test(text), `${name}: the worktree-helper constraint`);
  }
  // Executor task block: the seam rule is spelled the same to an executor however it was dispatched.
  for (const name of ['implement-task', 'just-do-it']) {
    const lines = read(name).split('\n');
    const region = specBlocks.executorTaskRegion(lines);
    assert.ok(region, `${name}: executor task block not found`);
    assert.strictEqual(lines.slice(region.start, region.end).join('\n'), specBlocks.renderExecutorTask(USAGE[name].executorTask), `${name}: run node lib/sync-shared-blocks.js`);
  }
});

if (failed > 0) {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`\n${passed} passed, 0 failed`);
