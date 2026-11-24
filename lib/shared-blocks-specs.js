/**
 * Shared blocks of the spec-authoring skills, rendered from one source by
 * lib/sync-shared-blocks.js: the task format (whose source is the tasks
 * template), the spec-detection rule, the auto-split thresholds, and the
 * parts of the dispatch prompts that plan-task and just-do-it, and
 * implement-task and just-do-it, share.
 */

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.join(__dirname, '..');
const TASKS_TEMPLATE = path.join(PLUGIN_ROOT, 'references', 'tasks', 'tasks-template.md');

// ---- Task format: references/tasks/tasks-template.md is the source ----

function renderTaskFormat() {
  const text = fs.readFileSync(TASKS_TEMPLATE, 'utf8');
  const at = text.indexOf('## Individual Task File Template');
  const block = at === -1 ? null : text.slice(at).match(/```markdown\n([\s\S]*?)\n```/);
  if (!block) throw new Error('references/tasks/tasks-template.md: individual task template not found');
  return block[1];
}

function taskFormatRegion(lines) {
  const start = lines.indexOf('### TASK-NNN: [Task Title]');
  if (start === -1) return null;
  let end = -1;
  for (let j = start + 1; j < lines.length; j++) {
    if (/^\*\*Status:\*\* Not Started \| In Progress \| Complete \| Blocked$/.test(lines[j])) { end = j + 1; break; }
  }
  if (end === -1) throw new Error('task format block has no Status line');
  return { start, end };
}

// ---- Spec detection: one file, then one directory, read in one order ----

function renderSpecDetection({ lead = 'Detection', indent = '', paths = null } = {}) {
  const subject = lead === 'For each' ? 'For each, check' : '**Detection:** Check';
  const where = paths ? ` (\`${paths[0]}\`, then \`${paths[1]}\`)` : '';
  return `${indent}${subject} for a single file first (it takes precedence), then a directory${where}. `
    + 'Read a directory as all its `.md` files recursively — `_index.md` first, then numerically-prefixed files, then alphabetically.';
}

function specDetectionRegion(lines) {
  const isSite = (line) => /^\*\*Detection:\*\* Check for|^\s*For each, check (for )?(a )?single file first/.test(line);
  const starts = lines.map((line, i) => (isSite(line) ? i : -1)).filter((i) => i !== -1);
  if (starts.length !== 1) throw new Error(`expected exactly one spec-detection line, found ${starts.length}`);
  return { start: starts[0], end: starts[0] + 1 };
}

// ---- Auto-split: the thresholds, stated once ----

const SPLIT_DOCS = {
  prd: {
    label: 'PRD', file: 'product_specs.md', dir: 'product_specs/', splitSkill: 'split-specs',
    thing: 'features', thingLabel: 'Feature', pattern: '`### \\d+\\.\\d+`', sections: 'feature sections',
    threshold: 15, callers: ['design-product', 'source-product-specs-from-code'],
  },
  architecture: {
    label: 'architecture doc', file: 'architecture.md', dir: 'architecture/', splitSkill: 'split-architecture',
    thing: 'decision records', thingLabel: 'Decision record', pattern: '`### DR-\\d+`', sections: 'sections',
    threshold: 10, callers: ['design-architecture', 'source-architecture-from-code'],
  },
};
const SPLIT_LINE_THRESHOLD = 500;

// The check a producing skill runs after writing a single-file document.
function renderAutoSplitCaller({ kind, intro, note }) {
  const d = SPLIT_DOCS[kind];
  return [
    `**Skip this step if the ${d.label} is already in directory mode.**`,
    '',
    `${intro}:`,
    '',
    `1. Count lines: \`wc -l {{specs_dir}}/${d.file}\``,
    `2. Count ${d.thing}: number of ${d.pattern} headings in the file`,
    '',
    `If **lines >= ${SPLIT_LINE_THRESHOLD}** OR **${d.thing} >= ${d.threshold}**:`,
    `- Invoke \`Skill(skill="groundwork:${d.splitSkill}")\` — this runs automatically with no user input needed.`,
    `- After the split completes, ${note}`,
    '',
    'If neither threshold is crossed, continue silently.',
  ].join('\n');
}

function autoSplitCallerRegion(lines) {
  const heading = lines.findIndex((line) => /^## Step \d+a: Auto-Split Check/.test(line));
  if (heading === -1) return null;
  const end = lines.indexOf('If neither threshold is crossed, continue silently.', heading);
  if (end === -1) throw new Error('auto-split check has no closing line');
  return { start: heading + 2, end: end + 1 };
}

function renderAutoSplitSummary({ kind }) {
  const d = SPLIT_DOCS[kind];
  return `- **Automatically** by \`${d.callers[0]}\` and \`${d.callers[1]}\` when the single-file ${d.label} crosses `
    + `**${SPLIT_LINE_THRESHOLD} lines** or **${d.threshold} ${d.thing}** (${d.sections} matching ${d.pattern})`;
}

function renderAutoSplitThresholds({ kind }) {
  const d = SPLIT_DOCS[kind];
  return [
    `- **Line count:** \`wc -l\` on \`{{specs_dir}}/${d.file}\` >= ${SPLIT_LINE_THRESHOLD}`,
    `- **${d.thingLabel} count:** Number of ${d.pattern} headings >= ${d.threshold}`,
  ].join('\n');
}

function autoSplitSummaryRegion(lines) {
  const start = lines.findIndex((line) => line.startsWith('- **Automatically** by `'));
  if (start === -1) return null;
  return { start, end: start + 1 };
}

function autoSplitThresholdsRegion(lines) {
  const start = lines.findIndex((line) => line.startsWith('- **Line count:** `wc -l`'));
  if (start === -1) return null;
  if (!/^- \*\*.+ count:\*\* Number of `### /.test(lines[start + 1] || '')) {
    throw new Error('auto-split thresholds: the second bullet is missing');
  }
  return { start, end: start + 2 };
}

// ---- Dispatch prompts: the parts that drifted between plan-task / just-do-it
// and between implement-task / just-do-it ----

// The constraints every plan-agent prompt carries (the plan-task wording,
// which just-do-it's copy had drifted from).
function renderPlanConstraints({ kind, id, indent = '' }) {
  const seams = kind === 'feature'
    ? 'Tests are planned at the highest existing seam that reaches each behavior — the plan names those seams, so the implementer never has to ask'
    : "Tests target the task's recorded Test Seams. If the task records none, or a recorded seam cannot reach the behavior, plan tests at the highest existing seam that reaches it — the plan states this choice so the implementer never has to ask";
  return [
    `1. Work happens in an isolated git worktree — the plan must instruct the implementer to resolve it with \`node \${CLAUDE_PLUGIN_ROOT}/lib/worktree-identity.js ${id}\` and use the returned \`path\` and \`branch\` verbatim (never hand-derived \`.worktrees/${id}\` paths)`,
    '2. Implementation must follow TDD — write failing tests first, then make them pass',
    `3. ${seams}`,
    '4. Plan covers implementation only — validation and merge are handled separately by the caller',
    '5. If a design system is present, the plan must reference design tokens, colors, and component patterns from it',
  ].map((line) => indent + line).join('\n');
}

// Every constraint list in the skill, in document order (plan-task has two prompts).
function planConstraintsRegions(lines) {
  const regions = [];
  for (let k = 0; k < lines.length; k++) {
    if (!/^\s*1\. (?:Work happens|All work happens)/.test(lines[k])) continue;
    let end = -1;
    for (let j = k + 1; j < lines.length; j++) {
      if (/^\s*\d+\. If a design system is present/.test(lines[j])) { end = j + 1; break; }
      if (end === -1 && /^\s*\d+\. Plan covers implementation only/.test(lines[j])) end = j + 1;
    }
    if (end === -1) throw new Error(`plan constraints at line ${k + 1} have no closing item`);
    regions.push({ start: k, end });
    k = end - 1;
  }
  return regions;
}

// The task block of an executor prompt: what to read, and the seam rule.
function renderExecutorTask({ indent = '' } = {}) {
  return [
    "Read the '### TASK-NNN:' section from tasks_path for goal, action items,",
    'acceptance criteria, and test seams (when recorded). Tests target the',
    'recorded seams; when none are recorded or a recorded seam cannot reach the',
    'behavior, follow the seam rule in your TDD skill (highest existing seam,',
    'then record the choice). Do not ask the caller for task details.',
  ].map((line) => indent + line).join('\n');
}

function executorTaskRegion(lines) {
  const start = lines.findIndex((line) => /^\s*Read the '### TASK-NNN:' section from tasks_path/.test(line));
  if (start === -1) return null;
  const end = lines.findIndex((line, j) => j > start && /Do not ask the caller for task details\./.test(line));
  if (end === -1) throw new Error('executor task block has no closing line');
  return { start, end: end + 1 };
}

module.exports = {
  SPLIT_DOCS, SPLIT_LINE_THRESHOLD,
  renderTaskFormat, taskFormatRegion,
  renderSpecDetection, specDetectionRegion,
  renderAutoSplitCaller, autoSplitCallerRegion,
  renderAutoSplitSummary, autoSplitSummaryRegion,
  renderAutoSplitThresholds, autoSplitThresholdsRegion,
  renderPlanConstraints, planConstraintsRegions,
  renderExecutorTask, executorTaskRegion,
};
