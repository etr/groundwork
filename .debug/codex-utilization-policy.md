# Debug: Codex utilization policy export

## Status
Resolved

## User Expectations Checked
- Validation should run one comprehensive pass, then only impacted reviewers.
- Autonomous validation should have a hard cap.
- Review and implementation agents should not inherit the full root transcript.
- Codex phase boundaries should compact or otherwise isolate context automatically.
- Deployment monitoring should avoid repeated expensive root-context polls.

## Reproduction

### Commands Executed
```bash
node /Users/etr/.codex/skills/groundwork-debug/scripts/runtime-context-cli.js --harness codex
bash install-skills.sh --codex --project --force --source /Users/etr/progs/claude-groundwork/groundwork
sed -n '1,12p' .codex/agents/{researcher,task-executor,code-quality-reviewer}.toml
rg -n "Always re-launch|ONLY agents|max_validation|fork_turns|Context Clear|validation coordinator" \
  .codex/skills/groundwork-validate/SKILL.md \
  .codex/skills/groundwork-work-on/SKILL.md
```

The generated install was written under a fresh `mktemp -d` directory.

### Actual Output
```text
{"model":"gpt-5.6-sol","effort_level":"high",...}
researcher: model = "gpt-5.6-sol"; model_reasoning_effort = "max"
task-executor: no model override; model_reasoning_effort = "high"
code-quality-reviewer: model = "gpt-5.6-terra"; model_reasoning_effort = "high"
groundwork-validate: Always re-launch the code-simplifier and quality-reviewer.
groundwork-work-on: Optional Context Clear Pause (Interactive Only)
```

The generated custom-agent spawn instructions contain no `fork_turns` argument. The
generated `work-on` workflow explicitly runs validation in the main conversation.

### Expected Output
- Research defaults to Sol/high; routine review defaults to Luna/high.
- Task execution defaults to Terra/high rather than inheriting the root model.
- Every bounded agent gets `fork_turns="none"` plus paths/metadata in its prompt.
- Validation stops after three total iterations and reruns only requesting or impacted reviewers.
- `work-on` starts validation in a fresh coordinator context instead of asking for a manual clear.
- Deployment monitoring runs in a fresh Luna/low monitor using one long-lived watch command.

### Matches User Report?
Yes. Existing source guidance already limits prompt payloads and mostly targets validation reruns,
but the Codex export does not enforce fresh forks, lacks a global validation cap, keeps two blanket
reviewer reruns, and has no automatic phase isolation or monitoring policy.

## Hypotheses

### Confirmed
- [x] Model/effort export is a direct source mapping, not a Codex utilization policy.
- [x] `task-executor` inherits the root model, explaining Sol/high implementation runs.
- [x] `researcher` remains Sol/max.
- [x] Agent-call conversion does not request a fresh context.
- [x] Validation has a repeated-finding threshold, but no total iteration cap.
- [x] Validation is mostly targeted, but always reruns code quality and simplification.
- [x] The Codex `work-on` export offers only a manual clear and otherwise validates in the root.

### Eliminated
- [x] Every validation retry reruns the entire suite: false; the source already carries approved
  verdicts forward and reruns request-changing/domain-impacted reviewers.
- [x] Reviewer prompts inline the full diff/specs: false; the source passes paths and metadata.
- [x] Skills can invoke `/compact` as a normal tool: false in Codex CLI 0.147.0; `/compact` is a
  user/TUI operation and no compaction tool is exposed to skills. Automatic threshold compaction
  exists, but a skill cannot request it at a chosen phase boundary.

## Root Cause
**Verification level:** Verified

The converter translates syntax and Claude model names, but it does not apply Codex-specific
execution policy. Consequently native agent defaults, fork semantics, validation loop bounds,
and phase isolation remain implicit or inherit root-session behavior.

## Fix Direction
Add a tested Codex-only export policy: explicit per-role model/effort overrides, fresh agent forks,
a three-iteration targeted validation policy, fresh validation coordination, and isolated deployment
monitoring. Keep Claude-source workflows unchanged.

## Fix Applied
- Added a Codex-only skill policy transform; Claude source workflows remain unchanged.
- Set task execution to Terra/high and research to Sol/high.
- Set bounded routine reviewers to Luna/high; retained Terra/high for security, architecture,
  spec, cloud, and fixer roles.
- Set routine orchestration guidance to Terra/medium.
- Added `fork_turns="none"` to converted agent dispatches.
- Replaced the manual pre-validation clear pause with a fresh Terra/medium validation coordinator.
- Capped validation at three total iterations and removed blanket reviewer reruns.
- Added fresh Luna/low monitoring guidance using one long-lived native watch command.

## Verification
- RED: `node tests/install-config.test.js` — 37 passed, 5 failed on model policy, fresh forks,
  validation cap, phase isolation, and deployment monitoring.
- GREEN: `node tests/install-config.test.js` — 42 passed, 0 failed.
- Regression: `bash tests/run-tests.sh` — all test suites passed.
- Syntax/format gates: `bash -n`, `node --check`, and `git diff --check` passed.
- Generated-output inspection confirmed researcher=Sol/high, task-executor=Terra/high,
  routine code reviewer=Luna/high, security reviewer=Terra/high, and the new validation policies.
