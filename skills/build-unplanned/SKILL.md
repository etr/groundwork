---
name: build-unplanned
description: Build a feature from a description with worktree isolation and TDD. Optional flag - --on-unrelated-failure stop-and-ask|expand-and-fix|ignore-and-merge - how validation treats gate failures unrelated to the active project (default stop-and-ask).
argument-hint: "[feature-description] [--on-unrelated-failure stop-and-ask|expand-and-fix|ignore-and-merge]"
allowed-tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Task", "Skill", "AskUserQuestion"]
disable-model-invocation: true
---

# Build Unplanned Feature

Thin orchestrator for ad-hoc feature development without existing task definitions. Delegates to `plan-task` (blurb mode), `implement-task`, and `validate`.

## Token Discipline

This skill orchestrates long multi-agent workflows. Every turn re-reads the full context window, so unnecessary turns are expensive.

1. **No narration turns.** Do not output text-only turns like "Let me understand your feature" or "Now I'll dispatch implementation." Combine text with a tool call in the same turn, or skip the text entirely.
2. **Batch tool calls.** When multiple tool calls are independent, issue them all in one turn.
3. **No waiting updates.** Do not output "Waiting for results..." turns. Wait silently until results arrive.
4. **Keep context lean.** Do not read file contents you won't use directly. Pass file paths to subagents and let them read in their own context windows.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.** Skip this step silently if effort is `high`, `xhigh`, or `max` (the scale is `low` < `medium` < `high` < `xhigh` < `max`, so `xhigh` and `max` are already above `high`) AND you are Sonnet or Opus. Otherwise ask via `AskUserQuestion` (header "Model check"; options "Continue anyway" / "Cancel — I'll switch first"):

> "Do you want to switch? Feature development benefits from consistent multi-domain reasoning.
>
> Recommended: Sonnet or Opus at high effort.
>
> To switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke this skill."

If the user selects "Cancel — I'll switch first": output the switching commands and stop. Do not proceed with the skill. Ask once per conversation: a skill invoked by another skill skips this step when the recommendation was already shown. In a non-interactive run (`--noninteractive`, `GROUNDWORK_RUNNER_MODE=true`, or `GROUNDWORK_BATCH_MODE=true`), skip the prompt and continue on the current model.

## Step 0: Resolve Project Context

1. **Monorepo check:** Does `.groundwork.yml` exist at the repo root?
   - If yes → Is `{{project_name}}` non-empty?
     - If empty → Invoke `Skill(skill="groundwork:select-project")` to select a project, then restart this skill.
     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.
   - If no → Continue (single-project repo).
2. **CWD mismatch check (monorepo only):** skip it when the project was just selected or the invocation carried an explicit `--project`.
   - Compare CWD against the project paths in `.groundwork.yml`: the repo root or the selected project's path → fine, proceed; no project's path → proceed without warning (shared directory).
   - A different project's path → with `--noninteractive`, keep the selected project and continue; otherwise warn via `AskUserQuestion`:
     > "You're working from `<cwd>` (inside **[cwd-project]**), but the selected Groundwork project is **[selected-project]** (`[selected-project-path]/`). What would you like to do?"
     > - "Switch to [cwd-project]"
     > - "Stay with [selected-project]"
     If the user switches, invoke `Skill(skill="groundwork:select-project")`.
3. Proceed with the resolved project context.

## Step 1: Parse Feature Description

- **Argument provided:** Use the argument text as the feature blurb.
- **No argument:** Use `AskUserQuestion` to ask:
  > "What feature would you like to build? Describe it briefly."

## Step 2: Plan → `plan-task`

Call `Skill(skill="groundwork:plan-task")` with the blurb from Step 1 in the conversation context. Do NOT pass a task_id — this triggers blurb/feature mode in plan-task, which will:
- Load existing specs (if any)
- Call `understanding-feature-requests` for requirement clarification
- Generate a `FEATURE-<slug>` identifier
- Spawn a Plan agent and persist the plan

**Parse the output:**
- `RESULT: PLANNED | plan_file_path=<path> | identifier=<id> | branch_prefix=<prefix>` → Save `plan_file_path`, `identifier`, `branch_prefix`. Proceed.
- `RESULT: FAILURE | ...` → Report the failure to the user and stop.

### Step 2.5: Confirm Start

Use `AskUserQuestion`:

> "[identifier] — plan ready. Proceed to implementation?"
> - Option 1: "Yes, begin implementation"
> - Option 2: "Stop here — I'll review the plan first"

**If "Stop here":** Print the plan file path and stop:

    Plan saved to: <plan_file_path>
    
    To resume implementation later:
    /groundwork:implement-task <plan_file_path>

## Step 3: Implement → `implement-task`

Call `Skill(skill="groundwork:implement-task")` with `plan_file_path` in the conversation context. Do NOT pass a task_id.

**Parse the output:**
- `RESULT: IMPLEMENTED | worktree_path=<path> | branch=<branch> | base_branch=<bb>` → Save values. Proceed.
- `RESULT: FAILURE | ...` → Report failure to the user and stop.

### Step 3.5: Optional Context Clear Pause

Use `AskUserQuestion`:

> "Implementation complete for [identifier]. Validation runs the reviewer agents next and can compound context. Clear context before validation?"
> - Option 1: "Continue to validation now"
> - Option 2: "Stop here — I'll clear and resume manually"

**If "Continue to validation now":** Proceed to Step 4.

**If "Stop here":** Print resume instructions and STOP:

    ## Paused before validation

    Implementation is committed in:
    - **Worktree:** `<worktree_path>`
    - **Branch:** `<branch>`
    - **Base branch:** `<base_branch>`

    To resume validation in a clean context:

    1. Run `/clear` to clear Claude Code context
    2. `cd <worktree_path>`
    3. Run `/groundwork:validate`

    When ready to merge (commit any uncommitted validation fixes inside the worktree first — the fixer never commits):

        cd <project_root>
        git checkout <base_branch>
        git merge --no-ff <branch>
        git worktree remove <worktree_path>
        git branch -d <branch>

## Step 4: Validate

1. `cd` into the worktree path from Step 3
2. Call: `Skill(skill="groundwork:validate")`. When the invocation carried `--on-unrelated-failure <mode>` other than the default, include the flag in that call's arguments: `--on-unrelated-failure <mode>`
3. The validate skill will run its reviewer agents in parallel and fix issues autonomously.

**After validate completes:**
- All agents approved → Proceed to Step 5
- `Validation PASSED-WITH-WAIVERS (...)` (only possible with `--on-unrelated-failure ignore-and-merge`) → Proceed to Step 5, relaying the waived-gate lines into the Step 5 merge question; never present a waived gate as passed
- Validation failed → Report failure and worktree location for investigation, stop
- Stuck on recurring issue → Report the stuck finding and stop

## Step 5: Merge Decision

**From the project root** (NOT the worktree), handle merge:

Use `AskUserQuestion` to ask:

> "Implementation and validation complete for [identifier]. Would you like me to merge this into [base-branch] now?"
> - Option 1: "Yes, merge now"
> - Option 2: "No, I'll merge manually later"

**Wait for user response before proceeding.**

**If merging:** Follow `${CLAUDE_PLUGIN_ROOT}/references/task-merge-sequence.md` with the worktree path, branch, and base branch recorded in Step 3: commit the validation repairs on the feature branch first (the fixer never commits), merge from the project root with `--no-ff`, then remove the worktree and delete the branch. On a conflict, abort, keep the worktree, and report as below.

**If not merging or conflicts occurred:**

```markdown
## Implementation Complete in Worktree

**Location:** `<worktree_path>`
**Branch:** `<branch>`

When ready to merge (commit any uncommitted validation fixes inside the worktree first — the fixer never commits):
```bash
cd <project_root>
git checkout <base_branch>
git merge --no-ff <branch>
git worktree remove <worktree_path>
git branch -d <branch>
```

To continue working:
```bash
cd <worktree_path>
```
```

## Step 6: Report

Output implementation summary:

```markdown
## Feature Complete: [identifier]

**What was done:**
- [summary]

**Validation:** Passed ([N] iteration(s))

**Worktree status:** [Merged to <branch> | Pending at `<worktree_path>`]
```

Output the final result line:

```
RESULT: SUCCESS | [one-line summary]
```

---

## Reference

### Branch Naming

Branch and worktree names come from the shared worktree-identity helper (`node ${CLAUDE_PLUGIN_ROOT}/lib/worktree-identity.js <identifier>`), used verbatim. It names both planned tasks and ad-hoc features the same way: `task/<identifier>` in a single-project repo, `task/<project>/<identifier>` in a monorepo — so `task/TASK-NNN` for a planned task and `task/FEATURE-<slug>` for an ad-hoc feature.

### Standalone Usage

This skill is designed for standalone use when:
- No product specs exist
- No task definitions exist
- Quick prototyping is needed
- Ad-hoc feature requests come in

For planned work with existing specs, use `groundwork:work-on` instead.
