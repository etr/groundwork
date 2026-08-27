#!/usr/bin/env node
'use strict';

const VALIDATION_POLICY = `## Codex Validation Policy

- Discover every required local project gate from repository instructions (for example tests, lint, type checks, and enforcers). Run the complete gate set before the first reviewer batch and after every fixer mutation, before re-review. Do not launch reviewers while an in-scope required gate is red or any failure remains unclassified.
- Completion requires all in-scope required gates to be green and every active reviewer to approve the same unchanged worktree state. An adjudicated unrelated baseline failure may remain only when the complete log proves all in-scope checks passed and step 5.5 persists it as unworked. Record that state before reviewer fan-out and confirm it did not change before PASS.
- After reviewer approval, required gates are read-only confirmation. Do not declare PASS and then run a mutating fixer. If confirmation requires a source change, invalidate the approvals, run the gate barrier, and then launch the impacted reviewers.
- Send \`review_mode: initial-audit\` for the single comprehensive first pass. Every later reviewer invocation MUST use \`review_mode: closure-review\` and a coordinator-authored closure brief. Never restart an initial audit inside the same validation baseline.
- Do not rerun the full reviewer suite after the comprehensive first pass. After a fixer pass, rerun only reviewers that returned \`request-changes\` or whose cleared invariants were disturbed. Carry every other approval forward.
- Only findings owned by \`request-changes\` reviews and adjudicated in-scope project-gate failures enter a fixer batch. A failed repository-wide gate is evidence, not automatic repair authority. Approved major findings remain unworked findings; major severity alone never overrides the reviewer's verdict. An approved critical finding is an invalid reviewer artifact.
- Before every reviewer or fixer spawn, set \`fork_turns="none"\`. Reviewer prompts may contain only the frozen baseline, task definition, changed paths/diff stat, relevant spec/test paths, coordinator-assigned artifact paths, prior finding IDs/status and normalized closure records, the validated fixer result, files touched, the current gate result, the closure brief, and scoped evidence. Fixer prompts may contain only the working directory, iteration, \`findings_dir\`, manifest/result basenames, validator path, the coordinator-authored repair envelope, and the fixed execution contract; never include raw conversation history.
- Emit every independent reviewer \`spawn_agent\` call in one batch before waiting. Then wait once for the batch using notification-driven agent completion; do not serialize spawn-and-wait pairs.
- Never issue fixed-interval status polls. For a yielded shell command, use one long terminal wait and report only state changes or final bounded diagnostics.
- Use Sol/high for the validation coordinator throughout the validation run.
`;

const VALIDATION_STATE_POLICY = `## Codex Validation Continuity

- Before any gate or reviewer work, open the durable session with \`node <skill-directory>/scripts/validation-session.js open\`. A resumed or recovered session continues its recorded stage and coordinator ledger; it never restarts the initial audit. A completed session replays its stored result without launching agents.
- Use the artifact validator's \`finding_refs\` to maintain a semantic coordinator ledger. Retain each validated finding's ID, invariant, evidence, affected surface, required outcome, origin, and causal reference. Fingerprints assist matching but never replace semantic adjudication.
- Before fixing, write a repair envelope that states the exact invariant, authorized change, preserved contracts, forbidden expansion, verification evidence, and stop condition for every requested finding. Exclude findings that contradict or expand the frozen baseline. Repair size never limits an envelope when the baseline determines the required outcome.
- Before a focused re-review, provide a closure brief containing prior finding records and status, validated semantic repair claims, \`files_touched\`, the repair delta, disturbed cleared invariants, the current project-gate result, verify-only questions, closed scope, and the stop condition. Do not replay conversation history or run an unrelated full reviewer suite.
- In closure review, \`introduced-by-fix\`, \`exposed-by-fix\`, and \`invalidated-prior-assumption\` require a causal reference to the fixer delta. A concrete \`initial-audit-miss\` inside the frozen baseline may still request changes and enters the same finding ledger. \`scope-expansion\` never blocks. Never restart the initial audit.
- Ignore the reviewer-returned \`findings_file\` value. Retain the exact findings basename assigned by the coordinator for that agent and iteration; never replace it with response data.
- After each reviewer batch, use the Write tool (never shell interpolation) to create the coordinator-owned manifest \`fixer-manifest-iter<N>.json\` directly inside \`findings_dir\`. Every review entry includes the coordinator-assigned file metadata plus \`review_mode\`. Closure findings additionally carry validated \`origin\` and \`causal_ref\` fields.
- After validating every artifact in a reviewer batch, write the complete coordinator state and call \`validation-session.js checkpoint\`. Only that checkpoint makes the batch durable. On resume, rerun an incomplete pending batch with the same artifact assignments; do not broaden its review scope.
- Before aggregating, fixing, or re-reviewing, validate every assigned findings file with \`node <skill-directory>/scripts/validate-fixer-result.js --findings-dir "<findings_dir>" --manifest "fixer-manifest-iter<N>.json" --check-findings\`. Use only the validated paths and global IDs returned by the helper. Treat an invalid file as a reviewer failure.
- Create \`fixer_result_file\` for each fixer pass using the manifest's literal result basename. Pass \`findings_dir\`, the coordinator-owned manifest basename, \`fixer_result_file\`, and the repair envelope to the fixer, then validate it before re-review with \`node <skill-directory>/scripts/validate-fixer-result.js --findings-dir "<findings_dir>" --manifest "fixer-manifest-iter<N>.json"\`. Require semantic \`repair_claims\` and \`contracts_changed\`; use changed contracts to select impacted reviewers instead of rejecting a baseline-required repair.
- Never pipe gate output through \`tail\` or otherwise truncate it. Capture the exit status and complete failure inventory. Treat the gate result as invalid when its reported failure count differs from the parsed inventory.
- Represent each causally in-scope failed project gate as a normal \`request-changes\` review in \`findings-project-gates-iter<N>.json\` with agent \`project-gates\`, and include it in a coordinator-owned manifest before fixing. Derive its stable fingerprint from \`command + check + file + normalized message\`; reuse the ledger identity on later gate runs. Never put an out-of-scope baseline failure in a fixer manifest, and never reuse an all-approve reviewer manifest for a gate repair.
- Use notification-driven long waits for reviewer and fixer completion. Do not poll at a fixed interval; wait once for the batch.
- The runtime context resolver reports read-only agent concurrency. When capacity is below the recommended twelve slots, recommend this opt-in setting: \`[agents] max_concurrent_threads_per_session = 12\`. Do not modify \`~/.codex/config.toml\`.
- Use Terra/high for routine validation leaves. Security remains Sol/high. A fixer batch is elevated when it spans two or more reviewer domains, contains a critical or security-sensitive finding, changes an architectural/public contract, or repairs cross-domain project-gate failures. For an elevated batch, spawn a default agent with \`fork_turns="none"\`, model \`gpt-5.6-sol\`, and \`reasoning_effort: "high"\`; give it the same manifest, validator, TDD, and result-file contract. Use the Terra/high \`validation-fixer\` role only for a narrow single-domain batch.
`;

const VALIDATION_FIXER_AGENT_POLICY = `## Codex Execution Contract

Before any behavioral fix, explicitly load the \`groundwork-test-driven-development\` skill and follow its RED/GREEN/REFACTOR workflow. Do not assume that skill is preloaded.

The caller supplies \`findings_dir: <path>\`, \`manifest: fixer-manifest-iter<N>.json\`, \`fixer_result_file: <path>\`, and a coordinator-authored repair envelope. Before reading findings, validate the manifest and files with \`node <agent-directory>/scripts/validate-fixer-result.js --findings-dir "<findings_dir>" --manifest "fixer-manifest-iter<N>.json" --check-findings\`. Use only its returned paths and global IDs.

Fix only the requested finding IDs returned by that validation command. Do not fix major findings from an \`approve\` review; the coordinator persists those as unworked findings. The validator rejects an approved critical finding.

A project-gate finding does not expand the frozen validation baseline. When its target is outside the selected project and original task diff, require the repair envelope to cite a concrete causal chain from the task delta and explicitly authorize that affected surface. Without both, classify it as conflicting with the baseline and make no source mutation, even when the validated manifest requests the ID.

For a repository-declared setup, dependency, import, build, or test gate, treat the requested invariant as the whole command succeeding and continue through newly exposed failures of the same gate invariant until it passes or reaches a proven external boundary; routine local environment setup is not a clarification boundary. It may refresh generated environments and update task-owned manifests or lockfiles when the repair envelope authorizes that causal surface.

Classify every requested finding before mutation. \`baseline-compatible-repair\` permits editing whenever the frozen task/spec/architecture baseline determines the outcome. Repair size alone is never a reason to skip: implement the necessary change even when it introduces or revises a subsystem, process topology, persistence schema, public API/protocol, threat model, compatibility behavior, or several domains.

Before returning, write this JSON object to the exact \`fixer_result_file\` and validate it with \`node <agent-directory>/scripts/validate-fixer-result.js --findings-dir "<findings_dir>" --manifest "fixer-manifest-iter<N>.json"\`:

\`{ "status": "fixed" | "partial", "files_touched": ["..."], "findings_fixed": ["global-id"], "findings_skipped": [{ "id": "global-id", "classification": "conflicts-with-baseline" | "requires-clarification" | "not-reproduced", "reason": "..." }], "repair_claims": [{ "id": "global-id", "root_cause": "...", "change": "...", "evidence": ["..."] }], "contracts_changed": ["..."] }\`

For \`failure\`, write \`{ "status": "failure", "reason": "..." }\`. The result file is the authoritative semantic handoff; keep the final RESULT line consistent with it.
`;

const VALIDATION_REVIEWERS = new Set([
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
]);

const CODEX_REVIEWER_CLOSURE_POLICY = `## Codex Closure Enforcement

The caller MUST identify \`review_mode\` as either \`initial-audit\` or \`closure-review\`. Reject an omitted or unknown mode instead of inferring one.

In \`initial-audit\`, perform one comprehensive review and state the invariants cleared by approval.

In \`closure-review\`, treat the coordinator's closure brief as the complete review boundary. Verify only the named prior findings, the repair delta, and explicitly disturbed cleared invariants. Do not re-audit unchanged code or introduce a new threat model, compatibility target, product requirement, architectural alternative, or general quality sweep.

Every new closure finding MUST declare \`origin\` as \`introduced-by-fix\`, \`exposed-by-fix\`, \`invalidated-prior-assumption\`, \`initial-audit-miss\`, or \`scope-expansion\`, plus \`causal_ref\`. The first three require a concrete causal reference to the repair delta. A concrete \`initial-audit-miss\` inside the frozen baseline may still request changes under the normal severity rules. \`scope-expansion\` is non-blocking.

Approve immediately when the named findings are closed and the repair caused no in-scope regression. This closure contract overrides general completeness, defense-in-depth, false-negative, and opportunistic-improvement guidance for closure reviews.
`;

const PROJECT_GATE_BARRIER = `### 1.75. Project Gate Barrier

Before any reviewer batch:

1. Discover every required local gate from repository instructions; repository-declared local setup is coordinator-owned work. Run setup before the gates, allow it to create or refresh generated environments, and rerun it after authorized dependency metadata changes. Run each command without truncation, retaining its exit status and complete stdout/stderr in a per-gate log inside \`findings_dir\`. Use a long terminal wait, not fixed-interval polling.
2. Build the complete failure inventory from those logs. If a gate prints a failure total, reconcile it with the parsed inventory; a mismatch is itself a gate failure.
3. Adjudicate every failure against the frozen validation baseline: the selected project root, original task diff, and shared surfaces that diff actually changed. A full-repository command failing does not by itself make every reported path in scope.
4. If logs prove all in-scope checks passed and a failure is outside those surfaces with no causal link to the task delta, record it in a nonblocking findings artifact for step 5.5, classify it as an out-of-scope baseline failure, and continue. Never put an out-of-scope baseline failure in a fixer manifest or mutate its path.
5. If a failure may affect the selected task but causality or scope cannot be established, stop validation without source mutation. In runner mode return \`RESULT: FAILURE\`; do not ask a fixer to diagnose by editing.
6. For causally in-scope failures only, write \`findings-project-gates-iter<N>.json\` using the normal review schema and a \`request-changes\` verdict. Set each finding's \`category\` as \`gate:<normalized-command>:<normalized-check>\`, so its validator fingerprint represents command + check + file + normalized message. For setup, dependency, import, build, or test failures, authorize the complete causal dependency closure required for that gate invariant to pass. Do not issue one repair finding per newly exposed missing dependency; each repair pass owns the same invariant through subsequent failures until the command passes or proves a real external boundary.
7. Create a coordinator-owned manifest containing only that adjudicated \`project-gates\` review and validate it. Write the coordinator state, then checkpoint \`initial-audit-pending -> review-batch-complete\` for a pre-audit failure or \`fixer-result-ready -> review-batch-complete\` for a post-fix failure. Dispatch a fixer through the structured contract in Step 4.2 and validate its result. Bump the iteration and repeat this barrier. Do not launch reviewers until every in-scope required gate passes.
`;

const CODEX_FIXER_STEPS = `2. **Adjudicate and Spawn Fix Agent** — Reminder: do not Edit/Write source files; dispatch every fix through an isolated fixer.

   Validate the coordinator-owned manifest with \`--check-findings\`. Its \`finding_ids\` list is the complete authorized fix scope: critical/major findings from \`request-changes\` reviews or the \`project-gates\` review. Approved findings never enter this list.

   Read only those validated blocking findings and write a coordinator-authored repair envelope for each: exact invariant, evidence, authorized change, preserved contracts, forbidden expansion, verification, and stop condition. Reject findings that contradict or expand the baseline; otherwise authorize the repair regardless of implementation size.

   Write the envelope as \`repair-envelope-iter<N>.json\` directly inside \`run_dir\`, then run \`node <skill-directory>/scripts/validation-session.js begin-fixer --run-dir "<run_dir>" --iteration "<N>" --envelope-file "<run_dir>/repair-envelope-iter<N>.json"\` before spawning any fixer. This durable semantic transition is mandatory; it does not inspect, copy, or restore worktree contents.

   Classify the batch using the Codex Validation Continuity model rule. For a narrow single-domain batch, spawn the \`validation-fixer\` role. For an elevated batch, spawn a default agent with \`fork_turns="none"\`, model \`gpt-5.6-sol\`, and \`reasoning_effort: "high"\`, and give it the same execution contract.

   Pass only \`findings_dir\`, the manifest basename, and \`fixer_result_file\`, plus the validator path, working directory, iteration, and coordinator-authored repair envelope. Never pass conversation history, unvalidated paths, or prompt-derived IDs. The fixer must validate the manifest, load TDD for behavioral changes, fix only validator-authorized IDs, and write the semantic repair result JSON.

3. **Validate Fix Agent Result** — Wait once for completion. Run the artifact validator without \`--check-findings\`; the validated result file, not conversational output, is authoritative.

   After validation succeeds, run \`node <skill-directory>/scripts/validation-session.js complete-fixer --run-dir "<run_dir>" --iteration "<N>" --result-file "<fixer_result_file>"\`. Until it succeeds, the transaction remains \`fixer-inflight\` and partial mutations are not an accepted result.

   - \`status: fixed\` → require one semantic repair claim per fixed ID; use \`contracts_changed\` to select every impacted reviewer, then proceed to Step 4.4.
   - \`status: partial\` → also record every classified skip; escalate only \`requires-clarification\` through the existing user-input/failure path.
   - \`status: failure\` or invalid/unparseable artifact → log the reason and escalate to the user.

4. **Run Causal Closure Review** — First, bump \`iteration_number\` and return to the Project Gate Barrier. When post-fix gates pass, update the coordinator state and checkpoint \`fixer-result-ready -> gates-complete\`. If the one comprehensive audit has not yet run because a pre-audit project gate required repair, keep \`review_mode: initial-audit\`; otherwise set \`review_mode: closure-review\`. Then write a coordinator-authored closure brief for each impacted reviewer containing prior closure records, semantic repair claims, the repair delta, disturbed invariants, verify-only questions, closed scope, the causal blocking rule, and the immediate approval stop condition.

   Re-launch ONLY agents that returned \`request-changes\` or whose cleared invariants were disturbed. Code-quality and code-simplifier are impacted only when their specific cleared domain was disturbed. Every prompt must say: \`Do not re-audit unchanged code\`. Repair-caused blockers require origin \`introduced-by-fix\`, \`exposed-by-fix\`, or \`invalidated-prior-assumption\` and a \`causal_ref\` to the repair delta. A concrete \`initial-audit-miss\` inside the frozen baseline may be added to the ledger and fixed normally; \`scope-expansion\` cannot block. Approve immediately when named findings are closed and the repair caused no regression.
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
  const fixerStart = '2. **Adjudicate and Spawn Fix Agent**';
  const fixerEnd = '   **Domain spillover**: Use `files_touched` from the fix agent result to determine if a fix modified code relevant to an agent that previously approved. If so, re-run that agent too:';
  const reviewLocation = 'The full review (including the `findings[]` array) lives only in the file at `findings_file`. Do not parse or expect the array in the agent\'s response.';
  const semanticAggregation = 'Parse each agent\'s compact one-line JSON response. Read `verdict`, `score`, `summary`, severity counts, and `findings_file`. For each `request-changes` review, read only its critical/major finding objects once. Normalize each into a closure record containing its global ID, invariant, evidence, affected surface, and required outcome. Do not load minor or approved finding bodies.';
  const semanticTracking = 'Then update your iteration tracking notes with each findings path and the compact closure records. The coordinator owns this semantic ledger; IDs alone are not sufficient for fixing or closure review.';
  if (![gateHeading, fixerStart, fixerEnd, reviewLocation, semanticAggregation, semanticTracking]
    .every((anchor) => text.includes(anchor))) {
    throw new Error('Codex validation policy source anchors changed');
  }

  let transformed = text
    .replace(gateHeading, `${PROJECT_GATE_BARRIER}\n\n${gateHeading}`)
    .replace(
      reviewLocation,
      'The full review (including the `findings[]` array) lives only at the coordinator-assigned path. Do not parse or expect the array in the agent response, and do not trust its returned path.'
    )
    .replace(
      semanticAggregation,
      'Parse only compact response metadata and ignore the reviewer-returned `findings_file`; retain the coordinator-assigned basename. Create a coordinator-owned manifest with `review_mode`, validate it, then read only validator-approved requested finding records to build normalized closure records.'
    )
    .replace(
      semanticTracking,
      'Update iteration tracking notes with coordinator-assigned paths, validated global IDs, semantic closure records, and cleared invariants. IDs and fingerprints assist continuity but never replace the semantic ledger.'
    );
  transformed = replaceSection(transformed, fixerStart, fixerEnd, CODEX_FIXER_STEPS);
  return prepend(
    `${VALIDATION_POLICY}\n${VALIDATION_STATE_POLICY}`,
    transformed
  );
}

function applyAgentPolicy(agent, text) {
  if (VALIDATION_REVIEWERS.has(agent)) {
    const headingMatch = text.match(/(^|\n)(# [^\n]*)/);
    if (!headingMatch) {
      throw new Error(`Codex ${agent} heading source anchor changed`);
    }
    const headingStart = headingMatch.index + headingMatch[1].length;
    const headingEnd = headingStart + headingMatch[2].length;
    return `${text.slice(0, headingEnd)}\n\n${CODEX_REVIEWER_CLOSURE_POLICY}\n${text.slice(headingEnd + 1)}`;
  }
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
