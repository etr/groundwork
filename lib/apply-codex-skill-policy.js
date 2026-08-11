#!/usr/bin/env node
'use strict';

const VALIDATION_POLICY = `## Codex Validation Policy

- Do not rerun the full reviewer suite after the comprehensive first pass.
- After a fixer pass, rerun only reviewers that returned \`request-changes\` or whose owned files/domains changed. Carry every other approval forward.
- Before every reviewer or fixer spawn, set \`fork_turns="none"\`. The prompt must contain only the task definition, changed paths/diff stat, relevant spec paths, test paths, findings-file paths, and unresolved finding IDs.
- Terra at medium effort is the default coordinator. Escalate the coordinator to Sol/high only for conflicting security, architecture, or requirement findings.
`;

const VALIDATION_STATE_POLICY = `## Codex Validation Continuity

- Preserve each finding's original global ID during focused rechecks. Classify that ID as \`resolved\`, \`persists\`, or \`regressed\`; use a lightweight fingerprint only for unmatched new findings.
- Before a focused re-review, provide prior findings, the structured fixer result, files_touched, and scoped post-fix evidence. Do not replay conversation history or run an unrelated full reviewer suite.
- Create \`fixer_result_file\` for each fixer pass inside \`findings_dir\`, pass its path and requested global finding IDs to the fixer, then validate it before re-review with \`node <skill-directory>/scripts/validate-fixer-result.js --file "<fixer_result_file>" --finding-ids "<global-id,...>"\`. Treat an invalid file as a fixer failure.
- Use notification-driven long waits for reviewer and fixer completion. Do not poll at a fixed interval.
- The runtime context resolver reports read-only agent concurrency. Recommend the opt-in configuration with the recommended twelve slots when capacity is below it. Do not modify \`~/.codex/config.toml\`.
- Use Terra/high for routine validation leaves. Security remains Sol/high. Escalate only a critical, cross-cutting, or security-sensitive fix batch to \`gpt-5.6-sol\` at \`high\` effort for an elevated fixer batch.
`;

const VALIDATION_FIXER_AGENT_POLICY = `## Codex Execution Contract

Before any behavioral fix, explicitly load the \`groundwork-test-driven-development\` skill and follow its RED/GREEN/REFACTOR workflow. Do not assume that skill is preloaded.

The caller supplies \`fixer_result_file: <path>\` and the requested global finding IDs. Before returning, write this JSON object to that exact file and validate it with \`node <agent-directory>/scripts/validate-fixer-result.js --file "<fixer_result_file>" --finding-ids "<global-id,...>"\`:

\`{ "status": "fixed" | "partial" | "failure", "files_touched": ["..."], "findings_fixed": ["global-id"], "findings_skipped": [{ "id": "global-id", "reason": "..." }] }\`

For \`failure\`, write \`{ "status": "failure", "reason": "..." }\`. The result file is the authoritative handoff; keep the final RESULT line consistent with it.
`;

const WORK_ON_PHASE_POLICY = `### Step 3.5: Codex Phase Isolation

Do not pause for a manual context clear. Planning and implementation agents must be spawned with \`fork_turns="none"\`, and their prompts must pass paths rather than prior conversation history.

## Step 4: Validate

Run validation through a fresh validation coordinator so implementation history is not replayed:

1. Spawn a default subagent with \`fork_turns="none"\`, model \`gpt-5.6-terra\` at \`medium\` effort, and description \`Validate [TASK-NNN]\`.
2. Prompt it with only \`worktree_path\`, \`task_id\`, \`base_branch\`, and: "Follow the \`groundwork-validate\` skill completely. Return its final Validation result line and iteration count."
3. Wait for that fresh validation coordinator once; do not run reviewer polling in this root context.
4. Parse its result:
   - \`Validation PASSED (...)\` -> proceed to Step 5.
   - \`Validation INCOMPLETE (...)\` or an unparseable result -> report failure and stop.
`;

const DEPLOYMENT_MONITORING_POLICY = `## Codex Deployment Monitoring

When a rollout or CI/deployment check requires waiting:

- Spawn one default monitor subagent with \`fork_turns="none"\`, model \`gpt-5.6-luna\` at \`low\` effort. Give it the working directory, exact read-only command, terminal success/failure states, and a wall-clock deadline.
- Run one long-lived native watch command (for example \`gh run watch <id> --exit-status --interval 30\` or \`kubectl rollout status ... --timeout=...\`) instead of issuing a new status command every model turn.
- Batch independent status reads into the monitor's initial or terminal check. Return only state transitions, the terminal result, and bounded failure logs.
- The root waits for the monitor once. It must not repeat deployment polls or ingest unchanged status output.
`;

const ORCHESTRATION_MODEL_POLICY = `## Codex Orchestration Model

Use Terra/medium for routine orchestration. Escalate to Sol/high only for cross-cutting, security-sensitive, or high-risk decisions.
`;

const ORCHESTRATION_PREFLIGHT_END = {
  'build-unplanned': '## Step 0: Resolve Project Context',
  'implement-task': '## Step 0: Resolve Project Context',
  'just-do-it': '## Workflow',
  'plan-task': '## Step 0: Resolve Project Context',
  'review-pr': '## Step 1: Parse PR Identifier',
  'task-validation-loop': '## Step 0: Resolve Project Context',
  validate: '## Hard Rule',
  'work-on': '## Plan Mode Handling',
  'work-on-next-task': '## Workflow',
};

function applySwarmingPolicy(text) {
  const sourceModel = '`model: "sol"`';
  const sourceHeader = `**Model:** Teammates spawn with ${sourceModel} for extended context.`;
  const occurrences = text.split(sourceModel).length - 1;
  if (occurrences !== 3 || !text.includes(sourceHeader)) {
    throw new Error('Codex swarming model policy source anchors changed');
  }

  const routineModel = '`model: "gpt-5.6-terra"` and `reasoning_effort: "high"`';
  const header = `**Model:** Spawn routine teammates with ${routineModel}. Escalate only cross-cutting, security-sensitive, or high-risk teammates to \`model: "gpt-5.6-sol"\` at \`reasoning_effort: "high"\`.`;
  return text
    .replace(sourceHeader, header)
    .replaceAll(sourceModel, routineModel);
}

function prepend(section, text) {
  return `${section}\n${text}`;
}

function replaceSection(text, startHeading, endHeading, replacement) {
  const start = text.indexOf(startHeading);
  const end = text.indexOf(endHeading, start + startHeading.length);
  if (start === -1 || end === -1) {
    throw new Error(`Codex policy anchor missing: ${startHeading} -> ${endHeading}`);
  }
  return `${text.slice(0, start)}${replacement}\n\n${endHeading}\n\n${text.slice(end + endHeading.length).replace(/^\n+/, '')}`;
}

function applyValidatePolicy(text) {
  const targetedRule = 'Always re-launch the code-simplifier and quality-reviewer. For the other agents, re-launch ONLY agents that returned `request-changes` in the previous iteration.';
  if (!text.includes(targetedRule)) {
    throw new Error('Codex validation policy source anchors changed');
  }

  return prepend(
    `${VALIDATION_POLICY}\n${VALIDATION_STATE_POLICY}`,
    text.replace(
      targetedRule,
      'Re-launch ONLY agents that returned `request-changes` in the previous iteration or whose owned files/domains were changed by the fixer. Code-quality and code-simplifier are impacted only when the fixer touched source code they own.'
    )
  );
}

function applyAgentPolicy(agent, text) {
  if (agent !== 'validation-fixer') return text;
  const falsePreloadClaim = 'You fix validation findings surfaced by reviewer agents. The `test-driven-development` skill is preloaded into your context — you do NOT need to call `Skill()` to load it. Follow the skill instructions directly.';
  if (!text.includes(falsePreloadClaim)) {
    throw new Error('Codex validation-fixer policy source anchor changed');
  }
  const transformed = text.replace(
    falsePreloadClaim,
    'You fix validation findings surfaced by reviewer agents. Follow the execution contract above before applying any behavioral fix.'
  ).replace(
    /Do NOT spawn sub(?:agents|-tasks) — you have all skills preloaded/,
    'Do NOT spawn sub-tasks — complete this task with the explicitly loaded skills'
  );
  const headingMatch = transformed.match(/(^|\n)(# [^\n]*)/);
  if (!headingMatch) {
    throw new Error('Codex validation-fixer heading source anchor changed');
  }
  const headingStart = headingMatch.index + headingMatch[1].length;
  const headingEnd = headingStart + headingMatch[2].length;
  return `${transformed.slice(0, headingEnd)}\n\n${VALIDATION_FIXER_AGENT_POLICY}\n${transformed.slice(headingEnd + 1)}`;
}

function applyWorkOnPolicy(text) {
  return replaceSection(
    text,
    '### Step 3.5: Optional Context Clear Pause (Interactive Only)',
    '## Step 5: Merge',
    WORK_ON_PHASE_POLICY
  );
}

function applyOrchestrationModelPolicy(skill, text) {
  const nextHeading = ORCHESTRATION_PREFLIGHT_END[skill];
  if (!nextHeading) return text;
  return replaceSection(
    text,
    '## Pre-flight: Model Recommendation',
    nextHeading,
    ORCHESTRATION_MODEL_POLICY
  );
}

function applyPolicy(skill, text) {
  let result = text;
  if (skill === 'validate') result = applyValidatePolicy(result);
  if (skill === 'work-on') result = applyWorkOnPolicy(result);
  if (skill === 'just-do-it-swarming') result = applySwarmingPolicy(result);
  result = applyOrchestrationModelPolicy(skill, result);
  if (['debug', 'ship', 'staged-rollout'].includes(skill)) {
    result = prepend(DEPLOYMENT_MONITORING_POLICY, result);
  }
  return result;
}

function parseArgs(argv) {
  for (const [flag, kind] of [['--skill', 'skill'], ['--agent', 'agent']]) {
    const index = argv.indexOf(flag);
    if (index !== -1 && argv[index + 1]) return { kind, name: argv[index + 1] };
  }
  throw new Error('Usage: apply-codex-skill-policy.js --skill NAME | --agent NAME');
}

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const { kind, name } = parseArgs(process.argv.slice(2));
      process.stdout.write(kind === 'skill' ? applyPolicy(name, input) : applyAgentPolicy(name, input));
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  });
}

module.exports = { applyAgentPolicy, applyPolicy };
