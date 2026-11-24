---
name: groundwork-just-do-it
description: Execute all remaining tasks in sequence until completion. Optional flags - --project <name> pins the monorepo package for the whole run; --take-over resumes past a possibly-live prior session without asking; --on-unrelated-failure stop-and-ask|expand-and-fix|ignore-and-merge - how validation treats gate failures unrelated to the active project (default stop-and-ask).
---
## Portable Project Context

Before interpreting project-context placeholders in this workflow:

1. Resolve the directory containing this `SKILL.md`.
2. Run `node <skill-directory>/scripts/project-context-cli.js resolve --harness zcode` from the repository working directory.
3. Use the returned JSON values as the exact bindings for `{{project_name}}`, `{{project_root}}`, `{{specs_dir}}`, `{{plans_dir}}`, `{{debug_dir}}`, and `{{research_dir}}` everywhere below.
4. If `selection_required` is true, follow the `groundwork-select-project` workflow, then resolve again.


# Just Do It - Batch Task Execution

Executes all remaining tasks in sequence until completion, stopping on first failure.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.** Skip this step silently if effort is `high`, `xhigh`, or `max` (the scale is `low` < `medium` < `high` < `xhigh` < `max`, so `xhigh` and `max` are already above `high`). Otherwise ask via `Ask the user` (header "Model check"; options "Continue anyway" / "Cancel — I'll switch first"):

> "Do you want to switch? Batch orchestration with dependency ordering and failure handling benefits from consistent reasoning.
>
> Recommended: GLM with reasoning at max.
>
> To switch: cancel, raise the reasoning effort to max in the model settings (and switch to GLM in the model picker if you are on GLM-Flash), then re-invoke this skill."

If the user selects "Cancel — I'll switch first": output the switching commands and stop. Do not proceed with the skill. Ask once per conversation: a skill invoked by another skill skips this step when the recommendation was already shown. In a non-interactive run (`--noninteractive`, `GROUNDWORK_RUNNER_MODE=true`, or `GROUNDWORK_BATCH_MODE=true`), skip the prompt and continue on the current model.

## Workflow

### Sequential execution contract

Keep exactly one active task through planning, implementation, validation, finalization, merge, and cleanup. Do not plan, prepare, implement, or validate a later task until that sequence finishes. A blocked task stops the batch; it does not authorize an independent task detour. Same-task reviewers may run together. Parallel task implementation requires the explicitly invoked swarming workflow or explicit user authorization; “build everything” and “keep going” preserve sequential execution.

### Step 0: Resolve Project Context

0. **Explicit project argument (highest precedence):** If the invocation arguments include `--project <name>` and `<name>` is configured in `.groundwork.yml`, that project is authoritative for this entire run. If they include `--take-over`, remember it: it is forwarded to every resume-gate `check` invocation in this run (see Steps 1.5 and 3). If they include `--on-unrelated-failure <mode>` (`stop-and-ask`, `expand-and-fix`, or `ignore-and-merge`), remember it for this entire run: it is forwarded to every Phase C validate invocation and Phase D finalize-task invocation (see Phase C). An invalid mode value → stop the batch with a usage error. Resolve its root directly from `.groundwork.yml` (`<repo root>/<configured path>`); do not read or consult `{{project_name}}`.
   - Do NOT invoke `select-project` — it is interactive setup for a single session, so never run it when an explicit `--project` was provided — and do NOT persist or change the stored selection. Other sessions may be running concurrently on different packages and must not be disturbed by a global switch. (The CWD mismatch check below skips itself for an explicit `--project`.)
   - Substitute the resolved project's paths for the template vars everywhere below: `<project root>/specs` for `{{specs_dir}}` and `<project root>/.groundwork-plans` for `{{plans_dir}}`.
   - Thread the project explicitly through every downstream invocation instead of relying on the shared selection: pass `--project <name>` to validate and finalize-task, call the worktree helper as `node <skill-directory>/scripts/worktree-identity.js TASK-NNN --project <name>`, and prefix other lib calls with `GROUNDWORK_PROJECT=<name>`.
   - Then skip directly to Step 1.
1. **Monorepo check:** Does `.groundwork.yml` exist at the repo root?
   - If yes → Is `{{project_name}}` non-empty?
     - If empty → Follow the groundwork-select-project workflow steps to select a project, then restart this skill.
     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.
   - If no → Continue (single-project repo).
2. **CWD mismatch check (monorepo only):** skip it when the project was just selected or the invocation carried an explicit `--project`.
   - Compare CWD against the project paths in `.groundwork.yml`: the repo root or the selected project's path → fine, proceed; no project's path → proceed without warning (shared directory).
   - A different project's path → with `--noninteractive`, keep the selected project and continue; otherwise warn via `Ask the user`:
     > "You're working from `<cwd>` (inside **[cwd-project]**), but the selected Groundwork project is **[selected-project]** (`[selected-project-path]/`). What would you like to do?"
     > - "Switch to [cwd-project]"
     > - "Stay with [selected-project]"
     If the user switches, Follow the groundwork-select-project workflow steps.
3. Proceed with the resolved project context.

### Step 1: Load and Analyze Tasks

1. Read the tasks file to find all tasks:
   - Single file: `{{specs_dir}}/tasks.md`
   - Directory: `{{specs_dir}}/tasks/` (aggregated in sorted order)

2. Parse all tasks and extract:
   - Task ID (e.g., `TASK-001`)
   - Title
   - Status (`Not Started`, `In Progress`, `Complete`, `Blocked`)
   - Dependencies (`Blocked by:` field)

3. Build dependency graph and calculate execution order:
   - Topological sort respecting dependencies
   - Blocked tasks cannot execute until dependencies complete

**Detection:** Check for a single file first (it takes precedence), then a directory. Read a directory as all its `.md` files recursively — `_index.md` first, then numerically-prefixed files, then alphabetically.

### Step 1.5: Sweep Stale Worktrees and Gate the First Task

Killed runs leave worktrees behind. Before presenting the summary:

1. **Sweep:** `node <skill-directory>/scripts/task-resume.js sweep` (add `--project <name>` in monorepos). Remove every entry in `cleanable` automatically from the repo root (`git worktree remove <absolute path>` then `git branch -d <branch>`, exactly as the protocol specifies); list `needs_review` entries for the user without touching them.
2. **Gate the first remaining task:** `node <skill-directory>/scripts/task-resume.js check <TASK-NNN>` (same project flag; append `--take-over` when the invocation carried `--take-over`). It prints one JSON line classifying existing work-in-progress — `resume_at`, `skip_phases`, `live_owner`, `live_owner_reason`, and ready-to-run `actions`.

Follow `<skill-directory>/references/task-resume-protocol.md` exactly: the standdown rule applies whenever `live_owner` is not `none` (only `heartbeat-worker-alive` survives `--take-over`), and `conflict` stops the batch with the evidence surfaced.

### Step 2: Present Summary and Confirm

Present a summary to the user:

## Batch Task Execution Summary

**Total tasks:** X
**Already complete:** Y
**Remaining:** Z

### Worktree Isolation

Each task will execute in an isolated git worktree:
- Branch and working directory: resolved per task via the worktree-identity helper (`node <skill-directory>/scripts/worktree-identity.js TASK-NNN`) — project-qualified in monorepos (`task/<project>/TASK-NNN`, `<repo>/.worktrees/<project>-TASK-NNN`)
- Branch created from current HEAD
- Changes merged automatically after each task completes successfully
- Worktrees cleaned up after successful merge

This ensures each task starts from a clean baseline and changes are integrated incrementally.

### Execution Order
1. TASK-NNN: [Title]
2. TASK-NNN: [Title]
...

### In-Progress Tasks (resumed, not restarted)
- TASK-NNN: [Title] — In Progress, resuming at [plan|implement|validate|finalize] per the resume gate
(omit this section when the gate reports every remaining task `fresh`)

### Blocked Tasks (will execute after dependencies complete)
- TASK-NNN: [Title] (blocked by TASK-XXX)

**Ask for confirmation before proceeding only when the user has not already authorized the batch.**

If user declines, stop and suggest alternatives:
- `/groundwork-work-on N` to work on a specific task
- `/groundwork-work-on-next-task` to work on just the next available task

### Step 3: Execute Sequentially

For every harness, this coordinator conversation owns the phase transitions below. Hold only the task list and the active task's plan, implementation, validation, and finalization results. Honor any user-specified task range or stop boundary when selecting tasks and before advancing. The standalone external runner remains separately launchable from outside this skill.

For each remaining task in dependency order:

1. **Read the task section** from `{{specs_dir}}/tasks.md` (or aggregated from `{{specs_dir}}/tasks/`) to extract the full task definition (goal, action items, acceptance criteria, test seams, dependencies).

2. **Announce start:** "Starting TASK-NNN: [Title]"

3. **Run the resume gate:** `node <skill-directory>/scripts/task-resume.js check TASK-NNN` (add `--project <name>` in monorepos; append `--take-over` when the batch was invoked with it). Act on the one-line JSON exactly as `<skill-directory>/references/task-resume-protocol.md` specifies:
   - `live_owner_reason: heartbeat-worker-alive` → hard standdown (report and stop the batch; even `--take-over` cannot override a provably-live process). If the evidence includes a paste-ready `heartbeat-stop` command, offer it to the user — the owning session may be dead with its worker leaked.
   - `live_owner_reason: heartbeat-orphaned` → not a standdown: the heartbeat worker beats on but its owning session is provably dead; proceed with the classification (reclaiming revokes the orphan's capability and it exits on its next beat).
   - Other `live_owner` values → soft standdown: stop and ask unless `--take-over` was supplied, in which case proceed (the check already resolved it).
   - `resume_at: conflict` → surface the `evidence` and stop the batch; the worktree is preserved.
   - Skip every phase listed in `skip_phases`: when `plan.present` is true, reuse `plan.file` as `plan_file_path` instead of Phase A; when `validate` or beyond is done, jump straight to that phase.
   - `resume_at: done` → run the `clear-checkpoint` action, log the task complete, advance.
   - Run each `actions` command verbatim at its annotated moment. One `check` returns only the next action, so re-run it after each recorded phase to fetch the one after: on a fresh task it returns `record … --phase plan` (run it right after persisting the plan); that re-run returns `record … --phase implemented` (run it right after a successful Phase B); once Phase D lands, the last re-run returns `clear`.

4. **Keep task status changes inside the active task worktree.** Implementation records `In Progress`; validation/finalization record `Complete`. The batch does not premark queued tasks. (An interactive `work-on` run differs: there `implement-task` marks the task `In Progress` in the base catalog, which is what `work-on-next-task` reads to offer it for resume.)

#### Phase A: Plan

> **Plan TASK-NNN** — start with a fresh context window:
>
> Create implementation plan for TASK-NNN: [task title]
>
> Task definition:
> [goal, action items, acceptance criteria, test seams from task file]
>
> Relevant product specs:
> [extracted from {{specs_dir}}/product_specs.md or {{specs_dir}}/product_specs/]
>
> Relevant architecture:
> [extracted from {{specs_dir}}/architecture.md or {{specs_dir}}/architecture/]
>
> REQUIREMENTS FOR THE PLAN:
> 1. Work happens in an isolated git worktree — the plan must instruct the implementer to resolve it with `node <skill-directory>/scripts/worktree-identity.js TASK-NNN` and use the returned `path` and `branch` verbatim (never hand-derived `.worktrees/TASK-NNN` paths)
> 2. Implementation must follow TDD — write failing tests first, then make them pass
> 3. Tests target the task's recorded Test Seams. If the task records none, or a recorded seam cannot reach the behavior, plan tests at the highest existing seam that reaches it — the plan states this choice so the implementer never has to ask
> 4. Plan covers implementation only — validation and merge are handled separately by the caller
> 5. If a design system is present, the plan must reference design tokens, colors, and component patterns from it
>


If the plan does not mention worktree or TDD, reject it and re-invoke the Plan agent.

After validation, persist the plan to disk in the **same turn** as receiving the Plan agent's output:

1. `mkdir -p {{plans_dir}} && grep -qxF '.groundwork-plans/' .gitignore 2>/dev/null || printf '.groundwork-plans/\n' >> .gitignore`, then set `plan_file_path={{plans_dir}}/TASK-NNN-plan.md` (substitute the actual task ID; `{{plans_dir}}` is project-scoped, mirroring `{{specs_dir}}`). Re-running on the same task overwrites — intentional.
2. Use the `Write` tool to save the Plan agent's full output to `plan_file_path`, formatted as:
   ```markdown
   # Implementation Plan: TASK-NNN [Title]

   ## Context
   - Mode: task
   - Identifier: TASK-NNN
   - Branch prefix: task
   - Specs dir: {{specs_dir}}
   - Tasks path: {path to the tasks file}

   <verbatim Plan agent output>
   ```
   The `## Context` header is required: `implement-task` reads it to resolve the identifier, and the plan-check helper reads it to confirm the plan belongs to the selected project.
3. From this point on, refer only to `plan_file_path`. Do NOT re-quote the plan in subsequent turns.

#### Phase B: Implement

> Spawn the `task-executor` agent for **Implement TASK-NNN** in a fresh context window with this task:
>
> You are implementing a task as part of an automated batch run.
>
> PROJECT ROOT: [absolute path to project root]
> DESIGN SYSTEM PATH: [absolute path to {{specs_dir}}/design_system.md when it exists; otherwise `none` — the executor cannot resolve template variables itself]
>
> TASK:
> - task_id: [TASK-NNN]
> - tasks_path: [absolute path to {{specs_dir}}/tasks.md or {{specs_dir}}/tasks/]
>
> Read the '### TASK-NNN:' section from tasks_path for goal, action items,
> acceptance criteria, and test seams (when recorded). Tests target the
> recorded seams; when none are recorded or a recorded seam cannot reach the
> behavior, follow the seam rule in your TDD skill (highest existing seam,
> then record the choice). Do not ask the caller for task details.
>
> PLAN FILE: [plan_file_path]
> Read this file first with the Read tool — it contains the validated implementation plan.
>
> [When the resume gate returned resume_existing_worktree=true, include the three lines below verbatim, substituting the gate's values]
> WORKTREE PATH: [expected_worktree from the check result]
> TASK BRANCH: [expected_branch from the check result]
> RESUME EXISTING WORKTREE=true
>
> INSTRUCTIONS:
> 1. Follow your preloaded skills to create a worktree, implement with TDD, and commit.
> 2. Read the task section from tasks_path and the plan from PLAN FILE — they provide all session context.
> 3. Record this task as `**Status:** In Progress` in its task file inside the worktree — never in the base checkout — and include that bookkeeping in your commit.
> 4. Do NOT use Ask the user — proceed automatically.
> 5. When complete, output your final line in EXACTLY this format:
>    RESULT: IMPLEMENTED | <worktree_path> | <branch> | <base_branch>
>    OR:
>    RESULT: FAILURE | [one-line reason]
>
> Your LAST line of output MUST be the RESULT line.
>


Parse the result:
- `RESULT: IMPLEMENTED | <path> | <branch> | <base_branch>`, or the same three fields spelled `worktree_path=<path> | branch=<branch> | base_branch=<base_branch>` → Save these values, proceed to Phase C
- `RESULT: FAILURE | ...` → STOP immediately, report failure
- No parseable RESULT line → Treat as failure

#### Phase C: Validate

Run the shared validation state machine from the task worktree in noninteractive mode (`--noninteractive`):

```
the groundwork-validate workflow
```

If Step 0 item 0 resolved an explicit `--project <name>`, include it: `args="--project <name> --noninteractive"`. If the invocation carried `--on-unrelated-failure <mode>` other than the default, include it too: `args="--on-unrelated-failure <mode> --noninteractive"` (combine all present flags).

Parse its terminal line:

- `Validation PASSED (...)` → proceed to Phase D.
- `Validation PASSED-WITH-WAIVERS (...)` (only possible with `--on-unrelated-failure ignore-and-merge`) → proceed to Phase D. Relay the waived-gate lines into the per-task log line and the completion report; never present a waived gate as passed.
- `Validation INCOMPLETE (...)` or an unparseable result → stop the batch. Report the reason and preserved worktree.

Do not implement a separate reviewer/fixer loop here. The `validate` skill owns the frozen baseline, repair envelopes, causal closure reviews, unworked-finding persistence, and cleanup.

#### Phase D: Finalize

Invoke the shared finalizer from the validated task worktree:

```
the groundwork-finalize-task workflow
```

If Step 0 item 0 resolved an explicit `--project <name>`, include it: `args="[TASK-NNN] --project <name>"`. If the invocation carried `--on-unrelated-failure ignore-and-merge`, include that too: `args="[TASK-NNN] --on-unrelated-failure ignore-and-merge"` (combine all present flags) so the finalizer accepts a waived-pass validation state.

Require verified integration into the recorded base branch, complete task status, and cleanup of the merged task worktree/branch before advancing. The finalizer owns commits, status bookkeeping, merge ancestry checks, and cleanup; do not duplicate them here. Any incomplete or unparseable finalization result stops the batch and preserves its worktree.

5. **Log result:** "Completed TASK-NNN: [Title] — [one-line summary]"

**On Failure at any phase:** Report the failed task, phase, reason, tasks completed this session, and tasks remaining. Note that the failed task's worktree is preserved at its recorded `<worktree_path>` for investigation.

### Step 4: Completion Report

When all tasks complete successfully, report:

```markdown
## Batch Execution Complete

**Session Summary:**
- Tasks completed: X
- Total tasks complete: Y/Z
- All worktrees merged and cleaned up

### Completed Tasks
| Task | Title | Branch | Status |
|------|-------|--------|--------|
| TASK-001 | [Title] | task/TASK-001 | Merged |
| TASK-002 | [Title] | task/TASK-002 | Merged |
...

### Worktree Summary
- Worktrees created: X
- Successfully merged: X
- Cleaned up: X

### Next Steps
- Run `/groundwork-source-product-specs-from-code` to update specs with any implementation changes
- Plan next phase if milestone complete
- Review merged changes with `git log --oneline -10`
```

## Edge Cases

| Situation | Response |
|-----------|----------|
| No tasks file | "Tasks file not found. Run `/groundwork-create-tasks` to generate tasks." |
| No remaining tasks | "All tasks are already complete! Nothing to execute." |
| All remaining blocked | "All remaining tasks are blocked. Cannot proceed automatically." |
| Single task remaining | Execute normally (still confirm before starting) |
