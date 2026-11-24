#!/usr/bin/env node
/**
 * Single source for the blocks skills carry verbatim: the Pre-flight model
 * recommendation, Step 0's project-context checks, the manual-merge snippet,
 * and (with lib/shared-blocks-specs.js) the task format, the spec-detection
 * rule, and the auto-split thresholds.
 *
 * Skills keep the rendered text (every harness loads SKILL.md as-is, and the
 * export installer's gates and model-name translation key on these blocks
 * being in the body), so the blocks are re-rendered in place rather than
 * pointed at:
 *
 *   node lib/sync-shared-blocks.js          # rewrite every listed skill
 *   node lib/sync-shared-blocks.js --check  # exit 1 on drift, write nothing
 *
 * tests/shared-blocks.test.js renders each block and compares it with the
 * skill, so a hand edit to one copy fails until the source here is updated.
 */

const fs = require('fs');
const path = require('path');

const specBlocks = require('./shared-blocks-specs');

const PLUGIN_ROOT = path.join(__dirname, '..');
const PREFLIGHT_HEADING = '## Pre-flight: Model Recommendation';

const MODELS = {
  standard: {
    gate: 'Sonnet or Opus',
    recommendation: 'Sonnet or Opus at high effort',
    switch: 'run `/effort high` (and `/model sonnet` if on Haiku)',
  },
  'opus-1m': {
    gate: 'Opus (1M context)',
    recommendation: 'Opus (1M context) at high effort',
    switch: 'run `/model opus[1m]` and `/effort high`',
  },
};

function renderPreflight({ rationale, model = 'standard' }) {
  const m = MODELS[model];
  if (!m) throw new Error(`unknown pre-flight model variant: ${model}`);
  return `${PREFLIGHT_HEADING}

**Your current effort level is \`{{effort_level}}\`.** Skip this step silently if effort is \`high\`, \`xhigh\`, or \`max\` (the scale is \`low\` < \`medium\` < \`high\` < \`xhigh\` < \`max\`, so \`xhigh\` and \`max\` are already above \`high\`) AND you are ${m.gate}. Otherwise ask via \`AskUserQuestion\` (header "Model check"; options "Continue anyway" / "Cancel — I'll switch first"):

> "Do you want to switch? ${rationale}
>
> Recommended: ${m.recommendation}.
>
> To switch: cancel, ${m.switch}, then re-invoke this skill."

If the user selects "Cancel — I'll switch first": output the switching commands and stop. Do not proceed with the skill. Ask once per conversation: a skill invoked by another skill skips this step when the recommendation was already shown. In a non-interactive run (\`--noninteractive\`, \`GROUNDWORK_RUNNER_MODE=true\`, or \`GROUNDWORK_BATCH_MODE=true\`), skip the prompt and continue on the current model.`;
}

// Step 0 is a numbered run of canonical items. A skill may keep its own items
// before it (the batch skills' explicit `--project` item, work-on's resume gate);
// only the canonical run is generated.
const STEP0_ITEMS = ['**Monorepo check:**', '**CWD mismatch check', '**Check `{{specs_dir}}/`:**', 'Proceed with the resolved project context'];

function renderStep0Items({ cwdCheck = true, specsCheck = false, proceed = true, proceedExtra = '', start = 1 } = {}) {
  const lines = [];
  let n = start;
  const open = (label, body) => { lines.push(`${n}. **${label}**${body}`); };
  open('Monorepo check:', ' Does `.groundwork.yml` exist at the repo root?');
  lines.push(
    '   - If yes → Is `{{project_name}}` non-empty?',
    '     - If empty → Invoke `Skill(skill="groundwork:select-project")` to select a project, then restart this skill.',
    '     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.',
    '   - If no → Continue (single-project repo).',
  );
  if (cwdCheck) {
    n += 1;
    open('CWD mismatch check (monorepo only):', ' skip it when the project was just selected or the invocation carried an explicit `--project`.');
    lines.push(
      "   - Compare CWD against the project paths in `.groundwork.yml`: the repo root or the selected project's path → fine, proceed; no project's path → proceed without warning (shared directory).",
      '   - A different project\'s path → with `--noninteractive`, keep the selected project and continue; otherwise warn via `AskUserQuestion`:',
      '     > "You\'re working from `<cwd>` (inside **[cwd-project]**), but the selected Groundwork project is **[selected-project]** (`[selected-project-path]/`). What would you like to do?"',
      '     > - "Switch to [cwd-project]"',
      '     > - "Stay with [selected-project]"',
      '     If the user switches, invoke `Skill(skill="groundwork:select-project")`.',
    );
  }
  if (specsCheck) {
    n += 1;
    open('Check `{{specs_dir}}/`:', ' Does a specs directory exist?');
    lines.push(
      '   - If yes → Proceed normally.',
      '   - If no → Ask the user: "Is this a single-project repo or a monorepo with multiple projects?"',
      '     - **Single project** → Proceed normally (specs will be created at `{{specs_dir}}/`).',
      '     - **Monorepo** → Invoke `Skill(skill="groundwork:setup-repo")` to create `.groundwork.yml`, then continue.',
    );
  }
  if (proceed) {
    n += 1;
    lines.push(`${n}. Proceed with the resolved project context.${proceedExtra ? ` ${proceedExtra}` : ''}`);
  }
  return lines.join('\n');
}

// The user-facing manual-merge snippet. 'fenced' for a top-level message,
// 'indented' for embedding inside another fenced block.
function renderManualMerge({ indent = '', style = 'fenced' } = {}) {
  const pad = (line) => (line === '' ? '' : indent + line);
  const commands = ['cd <project_root>', 'git checkout <base_branch>', 'git merge --no-ff <branch>',
    'git worktree remove <worktree_path>', 'git branch -d <branch>'];
  const lead = 'When ready to merge (commit any uncommitted validation fixes inside the worktree first — the fixer never commits):';
  if (style === 'indented') {
    return [pad(lead), '', ...commands.map((line) => `${indent}    ${line}`)].join('\n');
  }
  return [lead, ...['```bash', ...commands, '```'].map(pad)].join('\n');
}

// Which skills carry which block, with the per-skill parameters that are the
// only legitimate difference between copies.
const preflight = (rationale, model) => ({ rationale, model });
// The auto-split check a producing skill runs (thresholds: shared-blocks-specs.js).
const autoSplitCaller = (kind, intro, note) => ({ form: 'caller', kind, intro, note });
const USAGE = {
  'build-unplanned': {
    preflight: preflight('Feature development benefits from consistent multi-domain reasoning.'),
    step0: {},
    manualMerge: [{ indent: '    ', style: 'indented' }, {}],
  },
  'check-specs-alignment': {
    preflight: preflight('Drift detection and categorization across implementation and specs benefits from consistent reasoning.'),
    step0: {},
    specDetection: {},
  },
  'create-tasks': {
    preflight: preflight('Task granularity judgment and vertical slicing decisions determine execution success.', 'opus-1m'),
    step0: {},
    taskFormat: {},
    specDetection: {},
  },
  'implement-task': {
    preflight: preflight('Implementation benefits from consistent multi-domain reasoning.'),
    step0: { cwdCheck: false },
    executorTask: { indent: '  ' },
  },
  'task-validation-loop': {
    preflight: preflight('Fix loop management across 3 validation agents benefits from consistent reasoning.'),
    step0: {},
    specDetection: {},
  },
  'just-do-it-swarming': {
    preflight: preflight('Team orchestration with worktree coordination across agents benefits from consistent reasoning.'),
    step0: {},
    specDetection: {},
  },
  'swarm-debug': {
    preflight: preflight('Hypothesis generation quality determines whether the entire swarm investigates the right space.', 'opus-1m'),
  },
  'source-ux-design-from-code': {
    preflight: preflight('Design token and pattern change categorization benefits from consistent reasoning.'),
    step0: {},
    specDetection: {},
  },
  debug: {
    preflight: preflight('Falsifiable hypothesis formation and resisting the temptation to jump to fixes benefit from deeper reasoning.', 'opus-1m'),
  },
  'work-on': {
    preflight: preflight('Task execution benefits from consistent multi-domain reasoning.'),
    step0: { start: 3, proceed: false },
    manualMerge: [{ indent: '    ', style: 'indented' }, {}],
  },
  'source-architecture-from-code': {
    preflight: preflight('Architecture impact analysis from session changes benefits from consistent reasoning.'),
    step0: {},
    specDetection: {},
    autoSplit: autoSplitCaller(
      'architecture',
      'After applying changes to the single-file architecture doc, check whether it should be split',
      'include in the session summary: "The architecture doc was automatically split into directory format at `{{specs_dir}}/architecture/`."',
    ),
  },
  'understanding-feature-requests': {
    preflight: preflight('Contradiction detection in feature requirements benefits from consistent reasoning.'),
  },
  'swarm-design-architecture': {
    preflight: preflight('Adversarial prompt design and cross-decision conflict synthesis benefit from deeper reasoning.', 'opus-1m'),
    step0: {},
  },
  'design-architecture': {
    preflight: preflight('Cross-decision conflict detection and trade-off synthesis across NFRs benefit from deeper reasoning.', 'opus-1m'),
    step0: { specsCheck: true, proceed: false },
    specDetection: { paths: ['{{specs_dir}}/product_specs.md', '{{specs_dir}}/product_specs/'] },
    autoSplit: autoSplitCaller(
      'architecture',
      'After writing the architecture document, check whether it should be split',
      'note in your confirmation: "The architecture doc has been split into directory format at `{{specs_dir}}/architecture/` for easier navigation."',
    ),
  },
  'review-pr': {
    preflight: preflight('Multi-agent orchestration and deduplication judgment across the reviewer agents benefits from consistent reasoning.'),
  },
  'plan-task': {
    preflight: preflight('Planning benefits from consistent multi-domain reasoning.'),
    step0: {},
    specDetection: { lead: 'For each', indent: '   ' },
    planConstraints: [
      { kind: 'task', id: '<task-id>', indent: '  ' },
      { kind: 'feature', id: '<feature-id>', indent: '  ' },
    ],
  },
  'design-product': {
    preflight: preflight('Cross-spec contradiction detection across PRD, architecture, and design system benefits from deeper reasoning.', 'opus-1m'),
    step0: { specsCheck: true, proceed: false },
    specDetection: { lead: 'For each' },
    autoSplit: autoSplitCaller(
      'prd',
      'After committing to the single-file PRD, check whether it should be split',
      'note in your confirmation: "The PRD has been split into directory format at `{{specs_dir}}/product_specs/` for easier navigation."',
    ),
  },
  'source-product-specs-from-code': {
    preflight: preflight('Session change detection and EARS requirement update quality benefits from consistent reasoning.'),
    step0: {},
    specDetection: {},
    autoSplit: autoSplitCaller(
      'prd',
      'After applying changes to the single-file PRD, check whether it should be split',
      'include in the session summary: "The PRD was automatically split into directory format at `{{specs_dir}}/product_specs/`."',
    ),
  },
  'work-on-next-task': {
    preflight: preflight('Dependency resolution and task selection benefits from consistent reasoning.'),
    step0: {},
  },
  'just-do-it': {
    preflight: preflight('Batch orchestration with dependency ordering and failure handling benefits from consistent reasoning.'),
    step0: {},
    specDetection: {},
    planConstraints: { kind: 'task', id: 'TASK-NNN', indent: '' },
    executorTask: {},
  },
  validate: {
    preflight: preflight('Fix loop management and domain spillover judgment across the reviewer agents benefits from consistent reasoning.'),
    step0: {},
  },
  'ux-design': {
    preflight: preflight('Creative and analytical synthesis — resisting generic defaults requires active judgment.', 'opus-1m'),
    step0: { specsCheck: true, proceed: false },
  },
  'improve-codebase-architecture': {
    step0: {
      proceedExtra: 'The survey reads and reports only inside the resolved project root; all `{{specs_dir}}/` paths resolve to the correct location.',
    },
  },
  'split-architecture': { step0: { cwdCheck: false }, autoSplit: { form: 'split', kind: 'architecture' } },
  'split-specs': { step0: { cwdCheck: false }, autoSplit: { form: 'split', kind: 'prd' } },
};

// The generated Pre-flight region: its heading up to the next level-1/2 heading.
function preflightRegion(lines) {
  const start = lines.indexOf(PREFLIGHT_HEADING);
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !/^#{1,2} /.test(lines[end])) end += 1;
  while (end > start + 1 && lines[end - 1].trim() === '') end -= 1;
  return { start, end };
}

// The generated Step 0 region: the consecutive canonical numbered items.
function step0Region(lines) {
  const start = lines.findIndex((l) => /^\d+\. \*\*Monorepo check:\*\*/.test(l));
  if (start === -1) return null;
  let end = start;
  for (let k = start; k < lines.length; k++) {
    const item = lines[k].match(/^\d+\. (.*)$/);
    if (item) {
      if (!STEP0_ITEMS.some((label) => item[1].startsWith(label))) break;
    } else if (/^#/.test(lines[k]) || (lines[k].trim() !== '' && !/^[\s>]/.test(lines[k]))) {
      break;
    }
    end = k + 1;
  }
  // The blank line that separates the run from what follows is not part of it.
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return { start, end };
}

// Each manual-merge site: its lead-in line through the branch deletion.
function manualMergeRegions(lines) {
  const regions = [];
  for (let k = 0; k < lines.length; k++) {
    if (!/(?:When ready to merge \(commit|After validation passes.*merge manually from the project root)/.test(lines[k])) continue;
    let end = -1;
    for (let j = k + 1; j < lines.length; j++) {
      if (/^\s*git branch -d /.test(lines[j])) {
        // A fenced snippet ends with its closing fence; an indented one does not.
        end = j + (lines[j + 1] !== undefined && /^\s*```/.test(lines[j + 1]) ? 2 : 1);
        break;
      }
    }
    if (end === -1) throw new Error(`manual-merge snippet at line ${k + 1} has no branch deletion`);
    regions.push({ start: k, end });
    k = end - 1;
  }
  return regions;
}

function skillPath(name) {
  return path.join(PLUGIN_ROOT, 'skills', name, 'SKILL.md');
}

// Each shared block: where its sites are in a skill and how each site renders.
// A block whose value in USAGE is an array holds one parameter set per site.
const BLOCKS = {
  preflight: {
    sites: (lines) => [preflightRegion(lines)],
    render: (p) => renderPreflight(p),
  },
  step0: {
    sites: (lines) => [step0Region(lines)],
    render: (p) => renderStep0Items(p),
    // Whatever follows the run (a heading, the skill's own prose) needs a
    // blank line between it and the last item.
    blankAfter: true,
  },
  manualMerge: {
    sites: (lines) => manualMergeRegions(lines),
    render: (p) => renderManualMerge(p),
  },
  taskFormat: {
    sites: (lines) => [specBlocks.taskFormatRegion(lines)],
    render: () => specBlocks.renderTaskFormat(),
  },
  specDetection: {
    sites: (lines) => [specBlocks.specDetectionRegion(lines)],
    render: (p) => specBlocks.renderSpecDetection(p),
  },
  autoSplit: {
    sites: (lines, p) => (p.form === 'caller'
      ? [specBlocks.autoSplitCallerRegion(lines)]
      : [specBlocks.autoSplitSummaryRegion(lines), specBlocks.autoSplitThresholdsRegion(lines)]),
    siteCount: (p) => (p.form === 'caller' ? 1 : 2),
    render: (p, index) => {
      if (p.form === 'caller') return specBlocks.renderAutoSplitCaller(p);
      return index === 0 ? specBlocks.renderAutoSplitSummary(p) : specBlocks.renderAutoSplitThresholds(p);
    },
  },
  planConstraints: {
    sites: (lines) => specBlocks.planConstraintsRegions(lines),
    render: (p) => specBlocks.renderPlanConstraints(p),
  },
  executorTask: {
    sites: (lines) => [specBlocks.executorTaskRegion(lines)],
    render: (p) => specBlocks.renderExecutorTask(p),
  },
};

// Returns the skill text with its generated sites replaced, or null when the
// text already matches.
function renderSkill(name, params, text) {
  const lines = text.split('\n');
  let changed = false;
  for (const [block, blockParams] of Object.entries(params)) {
    const definition = BLOCKS[block];
    if (!definition) throw new Error(`${name}: unknown shared block "${block}"`);
    const perSite = Array.isArray(blockParams);
    const paramSets = perSite ? blockParams : [blockParams];
    const expected = definition.siteCount ? definition.siteCount(blockParams) : paramSets.length;
    const sites = definition.sites(lines, paramSets[0]).map((site, index) => {
      if (site) return site;
      throw new Error(`${name}: ${block}: site ${index + 1} not found`);
    });
    if (sites.length !== expected) {
      throw new Error(`${name}: ${block}: expected ${expected} site(s), found ${sites.length}`);
    }
    // Replace from the last site backwards so earlier indices stay valid.
    for (let k = sites.length - 1; k >= 0; k--) {
      const { start, end } = sites[k];
      // An array of parameter sets gives one per site; a single set covers them all.
      const rendered = definition.render(perSite ? paramSets[k] : blockParams, k).split('\n');
      if (lines.slice(start, end).join('\n') !== rendered.join('\n')) {
        lines.splice(start, end - start, ...rendered);
        changed = true;
      }
      if (definition.blankAfter) {
        const after = start + rendered.length;
        if (after < lines.length && lines[after].trim() !== '') {
          lines.splice(after, 0, '');
          changed = true;
        }
      }
    }
  }
  return changed ? lines.join('\n') : null;
}

function sync({ write = false } = {}) {
  // Render every skill before writing any, so a bad USAGE entry cannot leave
  // the corpus half re-rendered.
  const pending = [];
  const problems = [];
  for (const [name, params] of Object.entries(USAGE)) {
    try {
      const text = fs.readFileSync(skillPath(name), 'utf8');
      const next = renderSkill(name, params, text);
      if (next !== null) pending.push({ name, next });
    } catch (error) {
      problems.push(error.message);
    }
  }
  if (problems.length > 0) throw new Error(problems.join('\n'));
  const written = [];
  if (write) {
    for (const { name, next } of pending) {
      fs.writeFileSync(skillPath(name), next);
      written.push(name);
    }
  }
  return { drifted: pending.map(({ name }) => name), written };
}

if (require.main === module) {
  const write = !process.argv.includes('--check');
  const { drifted, written } = sync({ write });
  if (drifted.length === 0) {
    console.log('Shared blocks: every listed skill matches lib/sync-shared-blocks.js');
  } else if (write) {
    console.log(`Shared blocks: re-rendered in ${written.length} skill(s): ${written.join(', ')}`);
  } else {
    console.error(`Shared blocks drifted from lib/sync-shared-blocks.js in: ${drifted.join(', ')}`);
    console.error('Run: node lib/sync-shared-blocks.js');
    process.exit(1);
  }
}

module.exports = {
  USAGE, PREFLIGHT_HEADING, STEP0_ITEMS,
  renderPreflight, renderStep0Items, renderManualMerge,
  preflightRegion, step0Region, manualMergeRegions, renderSkill, sync,
};
