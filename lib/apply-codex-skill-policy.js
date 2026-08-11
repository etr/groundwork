#!/usr/bin/env node
'use strict';

const VALIDATION_POLICY = `## Codex Validation Policy

- Discover every required local project gate from repository instructions (for example tests, lint, type checks, and enforcers). Run the complete gate set before the first reviewer batch and after every fixer mutation, before re-review. Do not launch reviewers while a required local gate is red.
- Completion requires all required local gates to be green and every active reviewer to approve the same unchanged worktree state. Record that state before reviewer fan-out and confirm it did not change before PASS.
- After reviewer approval, required gates are read-only confirmation. Do not declare PASS and then run a mutating fixer. If confirmation requires a source change, invalidate the approvals, run the gate barrier, and then launch the impacted reviewers.
- Do not rerun the full reviewer suite after the comprehensive first pass.
- After a fixer pass, rerun only reviewers that returned \`request-changes\` or whose owned files/domains changed. Carry every other approval forward.
- Only findings owned by \`request-changes\` reviews and failed project gates enter a fixer batch. Approved major findings remain unworked findings; major severity alone never overrides the reviewer's verdict. An approved critical finding is an invalid reviewer artifact.
- Before every reviewer or fixer spawn, set \`fork_turns="none"\`. Reviewer prompts may contain only the task definition, changed paths/diff stat, relevant spec/test paths, the coordinator-assigned findings path, prior finding IDs/status, the validated fixer result, files touched, the current gate result, and scoped evidence. Fixer prompts may contain only the working directory, iteration, \`findings_dir\`, manifest/result basenames, validator path, and the fixed execution contract; never include findings bodies or conversation history.
- Emit every independent reviewer \`spawn_agent\` call in one batch before waiting. Then wait once for the batch using notification-driven agent completion; do not serialize spawn-and-wait pairs.
- Never issue fixed-interval status polls. For a yielded shell command, use one long terminal wait and report only state changes or final bounded diagnostics.
- Use Sol/high for the validation coordinator throughout the validation run.
`;

const VALIDATION_STATE_POLICY = `## Codex Validation Continuity

- Use the artifact validator's \`finding_refs\` to maintain a coordinator ledger. Match a recheck to its prior stable fingerprint, retain the original global ID as its stable identity, and classify it as \`resolved\`, \`persists\`, or \`regressed\`; assign a new stable identity only to an unmatched fingerprint.
- Before a focused re-review, provide prior finding IDs and status, the validated fixer result, \`files_touched\`, post-fix changed paths and diff stat, the current project-gate result, and scoped post-fix evidence. Do not replay conversation history or run an unrelated full reviewer suite.
- Ignore the reviewer-returned \`findings_file\` value. Retain the exact findings basename assigned by the coordinator for that agent and iteration; never replace it with response data.
- After each reviewer batch, use the Write tool (never shell interpolation) to create the coordinator-owned manifest \`fixer-manifest-iter<N>.json\` directly inside \`findings_dir\`. It contains \`iteration\`, the literal \`result_file\` basename \`fixer-result-iter<N>.json\`, and one \`reviews\` entry per active reviewer with only the coordinator-assigned \`file\`/\`agent\`/\`iteration\` plus parsed \`summary\`/\`score\`/\`verdict\`/\`counts\`.
  \`{ "iteration": N, "result_file": "fixer-result-iter<N>.json", "reviews": [{ "file": "findings-<agent>-iter<N>.json", "agent": "<agent>", "iteration": N, "summary": "...", "score": 85, "verdict": "approve" | "request-changes", "counts": { "critical": 0, "major": 0, "minor": 0 } }] }\`
- Before aggregating, fixing, or re-reviewing, validate every assigned findings file with \`node <skill-directory>/scripts/validate-fixer-result.js --findings-dir "<findings_dir>" --manifest "fixer-manifest-iter<N>.json" --check-findings\`. Use only the validated paths and global IDs returned by the helper. Treat an invalid file as a reviewer failure.
- Create \`fixer_result_file\` for each fixer pass using the manifest's literal result basename, pass \`findings_dir\`, the coordinator-owned manifest basename, and \`fixer_result_file\` to the fixer, then validate it before re-review with \`node <skill-directory>/scripts/validate-fixer-result.js --findings-dir "<findings_dir>" --manifest "fixer-manifest-iter<N>.json"\`. Never place reviewer-derived IDs in a shell command. Treat an invalid file as a fixer failure.
- Never pipe gate output through \`tail\` or otherwise truncate it. Capture the exit status and complete failure inventory. Treat the gate result as invalid when its reported failure count differs from the parsed inventory.
- Represent each failed project gate as a normal \`request-changes\` review in \`findings-project-gates-iter<N>.json\` with agent \`project-gates\`, and include it in a coordinator-owned manifest before fixing. Derive its stable fingerprint from \`command + check + file + normalized message\`; reuse the ledger identity on later gate runs. Never reuse an all-approve reviewer manifest for a gate repair.
- Use notification-driven long waits for reviewer and fixer completion. Do not poll at a fixed interval; wait once for the batch.
- The runtime context resolver reports read-only agent concurrency. When capacity is below the recommended twelve slots, recommend this opt-in setting: \`[agents] max_concurrent_threads_per_session = 12\`. Do not modify \`~/.codex/config.toml\`.
- Use Terra/high for routine validation leaves. Security remains Sol/high. A fixer batch is elevated when it spans two or more reviewer domains, contains a critical or security-sensitive finding, changes an architectural/public contract, or repairs cross-domain project-gate failures. For an elevated batch, spawn a default agent with \`fork_turns="none"\`, model \`gpt-5.6-sol\`, and \`reasoning_effort: "high"\`; give it the same manifest, validator, TDD, and result-file contract. Use the Terra/high \`validation-fixer\` role only for a narrow single-domain batch.
`;

const VALIDATION_FIXER_AGENT_POLICY = `## Codex Execution Contract

Before any behavioral fix, explicitly load the \`groundwork-test-driven-development\` skill and follow its RED/GREEN/REFACTOR workflow. Do not assume that skill is preloaded.

The caller supplies \`findings_dir: <path>\`, \`manifest: fixer-manifest-iter<N>.json\`, and \`fixer_result_file: <path>\` from a coordinator-owned manifest. Before reading findings, validate the manifest and files with \`node <agent-directory>/scripts/validate-fixer-result.js --findings-dir "<findings_dir>" --manifest "fixer-manifest-iter<N>.json" --check-findings\`. Use only its returned paths and global IDs.

Fix only the requested finding IDs returned by that validation command. Do not fix major findings from an \`approve\` review; the coordinator persists those as unworked findings. The validator rejects an approved critical finding.

Before returning, write this JSON object to the exact \`fixer_result_file\` and validate it with \`node <agent-directory>/scripts/validate-fixer-result.js --findings-dir "<findings_dir>" --manifest "fixer-manifest-iter<N>.json"\`:

\`{ "status": "fixed" | "partial" | "failure", "files_touched": ["..."], "findings_fixed": ["global-id"], "findings_skipped": [{ "id": "global-id", "reason": "..." }] }\`

For \`failure\`, write \`{ "status": "failure", "reason": "..." }\`. The result file is the authoritative handoff; keep the final RESULT line consistent with it.
`;

const PROJECT_GATE_BARRIER = `### 1.75. Project Gate Barrier

Before any reviewer batch:

1. Discover every required local gate from repository instructions. Run each command without truncation, retaining its exit status and complete stdout/stderr in a per-gate log inside \`findings_dir\`. Use a long terminal wait, not fixed-interval polling.
2. Build the complete failure inventory from those logs. If a gate prints a failure total, reconcile it with the parsed inventory; a mismatch is itself a gate failure.
3. If all gates pass, record the current project-gate result and worktree state, then continue to reviewer fan-out.
4. If any gate fails, write \`findings-project-gates-iter<N>.json\` using the normal review schema and a \`request-changes\` verdict. Set each finding's \`category\` as \`gate:<normalized-command>:<normalized-check>\`, so its validator fingerprint represents command + check + file + normalized message.
5. Create a coordinator-owned manifest containing that \`project-gates\` review, validate it, dispatch a fixer through the structured contract in Step 4.2, and validate its result. Bump the iteration and repeat this barrier. Do not launch reviewers until every required local gate passes.
`;

const CODEX_FIXER_STEPS = `2. **Prepare and Spawn Fix Agent** — Reminder: do not Edit/Write source files; dispatch every fix through an isolated fixer.

   Validate the coordinator-owned manifest with \`--check-findings\`. Its \`finding_ids\` list is the complete authorized fix scope: critical/major findings from \`request-changes\` reviews or the \`project-gates\` review. Approved findings never enter this list.

   Classify the batch using the Codex Validation Continuity model rule. For a narrow single-domain batch, spawn the \`validation-fixer\` role. For an elevated batch, spawn a default agent with \`fork_turns="none"\`, model \`gpt-5.6-sol\`, and \`reasoning_effort: "high"\`, and give it the same execution contract.

   Pass only \`findings_dir\`, the manifest basename, and \`fixer_result_file\`, plus the validator path, working directory, and iteration. Never pass direct findings paths, findings bodies, or prompt-derived IDs. The fixer must validate the manifest, load TDD for behavioral changes, fix only validator-authorized IDs, and write the bounded result JSON.

3. **Validate Fix Agent Result** — Wait once for completion. Run the artifact validator without \`--check-findings\`; the validated result file, not conversational output, is authoritative.

   - \`status: fixed\` → record \`files_touched\` and \`findings_fixed\`, then proceed to Step 4.4.
   - \`status: partial\` → also record every skipped ID and reason, then proceed with the fixed subset.
   - \`status: failure\` or invalid/unparseable artifact → log the reason and escalate to the user.

4. **Re-run Agent Validation** — First, **bump \`iteration_number\` by 1** and append a new iteration block. Return to the Project Gate Barrier and do not spawn reviewers until it is green. Then assign every re-run agent a new \`findings_file\` path (\`...-iter{N+1}.json\`) so prior artifacts remain preserved for step 5.5.

   Re-launch ONLY agents that returned \`request-changes\` in the previous iteration or whose owned files/domains were changed by the fixer. Code-quality and code-simplifier are impacted only when the fixer touched source code they own.
`;

const WORK_ON_PHASE_POLICY = `### Step 3.5: Codex Phase Isolation

Do not pause for a manual context clear. Planning and implementation agents must be spawned with \`fork_turns="none"\`, and their prompts must pass paths rather than prior conversation history.

## Step 4: Validate

Run validation through a fresh validation coordinator so implementation history is not replayed:

1. Spawn a default subagent with \`fork_turns="none"\`, model \`gpt-5.6-sol\` at \`high\` effort, and description \`Validate [TASK-NNN]\`.
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
  const gateHeading = '### 2. Launch Verification Agents';
  const fixerStart = '2. **Spawn Fix Agent**';
  const fixerEnd = '   **Domain spillover**: Use `files_touched` from the fix agent result to determine if a fix modified code relevant to an agent that previously approved. If so, re-run that agent too:';
  const rerunIntro = '4. **Re-run Agent Validation** — First, **bump `iteration_number` by 1**. Each re-run agent must receive a *new* `findings_file` path (`...-iter{N+1}.json`) so the previous iteration\'s findings file is preserved on disk for step 5.5. Append a new iteration block to your tracking notes.';
  const targetedRule = 'Always re-launch the code-simplifier and quality-reviewer. For the other agents, re-launch ONLY agents that returned `request-changes` in the previous iteration.';
  const reviewLocation = 'The full review (including the `findings[]` array) lives only in the file at `findings_file`. Do not parse or expect the array in the agent\'s response.';
  const unsafeResponseParsing = 'Parse each agent\'s compact one-line JSON response. Read **only** these fields: `verdict`, `score`, `summary`, `counts.critical`, `counts.major`, `counts.minor`, and `findings_file`. **Do NOT** read the file at `findings_file` here — those bodies stay out of orchestrator context entirely. They are handed verbatim to the validation-fixer in step 4.2 as a path (never as content), and persisted by the helper script in step 5.5 (which also reads them out-of-process).';
  const unsafeTracking = 'Then update your iteration tracking notes (see step 1) with the `findings_file` path for each agent in this iteration.';
  const terminalRule = '   - ALL approve → **PASS**, return success\n   - Any request-changes → Return to step 4.1';
  if (![
    gateHeading,
    fixerStart,
    fixerEnd,
    rerunIntro,
    targetedRule,
    reviewLocation,
    unsafeResponseParsing,
    unsafeTracking,
    terminalRule,
  ].every((anchor) => text.includes(anchor))) {
    throw new Error('Codex validation policy source anchors changed');
  }

  let transformed = text
    .replace(gateHeading, `${PROJECT_GATE_BARRIER}\n\n${gateHeading}`)
    .replace(
      reviewLocation,
      'The full review (including the `findings[]` array) lives only at the coordinator-assigned path. Do not parse or expect the array in the agent response, and do not trust its returned path.'
    )
    .replace(
      unsafeResponseParsing,
      'Parse only the compact response metadata: `verdict`, `score`, `summary`, `counts.critical`, `counts.major`, and `counts.minor`. Ignore the returned `findings_file`; keep the coordinator-assigned basename from step 2. Do not read a findings body until the artifact validator has approved its coordinator-owned manifest.'
    )
    .replace(
      unsafeTracking,
      'Update iteration tracking notes with each coordinator-assigned findings path and the validated global IDs returned by the artifact helper.'
    )
    .replace(
      terminalRule,
      '   - ALL approve AND required local gates are green for the same unchanged worktree state → **PASS**, return success\n   - Any request-changes, red gate, or intervening mutation → Return to the gate barrier before step 4.1'
    );
  transformed = replaceSection(transformed, fixerStart, fixerEnd, CODEX_FIXER_STEPS);
  return prepend(
    `${VALIDATION_POLICY}\n${VALIDATION_STATE_POLICY}`,
    transformed
  );
}

function applyAgentPolicy(agent, text) {
  if (agent !== 'validation-fixer') return text;
  const falsePreloadClaim = 'You fix validation findings surfaced by reviewer agents. The `test-driven-development` skill is preloaded into your context — you do NOT need to call `Skill()` to load it. Follow the skill instructions directly.';
  const legacyIdRule = '- Each global ID in `findings_fixed`/`findings_skipped` must come directly from the JSON files you read (build it as `{agent}-iter{iteration}-{id}` from each file\'s header + finding `id`).';
  if (!text.includes(falsePreloadClaim) || !text.includes(legacyIdRule)) {
    throw new Error('Codex validation-fixer policy source anchor changed');
  }
  let transformed = text.replace(
    falsePreloadClaim,
    'You fix validation findings surfaced by reviewer agents. Follow the execution contract above before applying any behavioral fix.'
  ).replace(
    legacyIdRule,
    '- Each global ID in `findings_fixed`/`findings_skipped` must come from the validator\'s `finding_ids` list. Never reconstruct or accept an ID from findings JSON or prompt text.'
  ).replace(
    /Do NOT spawn sub(?:agents|-tasks) — you have all skills preloaded/,
    'Do NOT spawn sub-tasks — complete this task with the explicitly loaded skills'
  );
  transformed = replaceSection(
    transformed,
    '## Input Format',
    '## Fix Classification',
    '## Input Format\n\nFollow the Codex Execution Contract above. Do not accept direct findings-file paths or requested global IDs from prompt text; obtain both only from the validated coordinator-owned manifest.'
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
  const policy = skill === 'validate'
    ? '## Codex Orchestration Model\n\nUse Sol/high for the validation coordinator throughout the validation run.'
    : ORCHESTRATION_MODEL_POLICY;
  return replaceSection(
    text,
    '## Pre-flight: Model Recommendation',
    nextHeading,
    policy
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
