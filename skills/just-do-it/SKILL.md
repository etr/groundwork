---
name: just-do-it
description: Execute all remaining tasks in sequence until completion. Usage /groundwork:just-do-it
allowed-tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Task", "AskUserQuestion", "Skill"]
disable-model-invocation: true
---

# Just Do It - Batch Task Execution

Executes all remaining tasks in sequence until completion, stopping on first failure.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high`, `xhigh`, or `max` (the scale is `low` < `medium` < `high` < `xhigh` < `max`, so `xhigh` and `max` are already above `high`) AND you are Sonnet or Opus.
If effort is `low` or `medium` (i.e. below `high`), you MUST show the recommendation prompt — regardless of model.
If you are not Sonnet or Opus, you MUST show the recommendation prompt - regardless of effort level.

Otherwise → use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Do you want to switch? Batch orchestration with dependency ordering and failure handling benefits from consistent reasoning.\n\nTo switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke this skill.",
    "header": "Recommended: Sonnet or Opus at high effort",
    "options": [
      { "label": "Continue" },
      { "label": "Cancel — I'll switch first" }
    ],
    "multiSelect": false
  }]
}
```

If the user selects "Cancel — I'll switch first": output the switching commands above and stop. Do not proceed with the skill.

## Workflow

### Step 0: Resolve Project Context

**Before loading tasks, ensure project context is resolved:**

1. **Monorepo check:** Does `.groundwork.yml` exist at the repo root?
   - If yes → Is `{{project_name}}` non-empty?
     - If empty → Invoke `Skill(skill="groundwork:select-project")` to select a project, then restart this skill.
     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.
   - If no → Continue (single-project repo).
2. **CWD mismatch check (monorepo only):**
   - Skip if not in monorepo mode or if the project was just selected in item 1 above.
   - If CWD is the repo root → fine, proceed.
   - Check which project's path CWD falls inside (compare against all projects in `.groundwork.yml`).
   - If CWD is inside the selected project's path → fine, proceed.
   - If CWD is inside a different project's path → warn via `AskUserQuestion`:
     > "You're working from `<cwd>` (inside **[cwd-project]**), but the selected Groundwork project is **[selected-project]** (`[selected-project-path]/`). What would you like to do?"
     > - "Switch to [cwd-project]"
     > - "Stay with [selected-project]"
     If the user switches, invoke `Skill(skill="groundwork:select-project")`.
   - If CWD doesn't match any project → proceed without warning (shared directory).
3. Proceed with the resolved project context. All `{{specs_dir}}/` paths will resolve to the correct location.

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

**Detection:** Check for file first (takes precedence), then directory.

### Step 2: Present Summary and Confirm

Present a summary to the user:

## Batch Task Execution Summary

**Total tasks:** X
**Already complete:** Y
**Remaining:** Z

### Worktree Isolation

Each task will execute in an isolated git worktree:
- Branch and working directory: resolved per task via the worktree-identity helper (`node ${CLAUDE_PLUGIN_ROOT}/lib/worktree-identity.js TASK-NNN`) — project-qualified in monorepos (`task/<project>/TASK-NNN`, `<repo>/.worktrees/<project>-TASK-NNN`)
- Branch created from current HEAD
- Changes merged automatically after each task completes successfully
- Worktrees cleaned up after successful merge

This ensures each task starts from a clean baseline and changes are integrated incrementally.

### Execution Order
1. TASK-NNN: [Title]
2. TASK-NNN: [Title]
...

### Blocked Tasks (will execute after dependencies complete)
- TASK-NNN: [Title] (blocked by TASK-XXX)

**Ask for confirmation before proceeding.**

If user declines, stop and suggest alternatives:
- `/groundwork:work-on N` to work on a specific task
- `/groundwork:work-on-next-task` to work on just the next available task

### Step 3: Execute Loop (Direct Orchestration)

Each task is executed through 5 phases orchestrated directly from this conversation. This avoids nested sub-tasks (sub-tasks cannot spawn other sub-tasks). The main loop holds only: task list + per-task plan summary, IMPLEMENTED result, validation verdicts, and merge result.

For each remaining task in dependency order:

1. **Read the task section** from `{{specs_dir}}/tasks.md` (or aggregated from `{{specs_dir}}/tasks/`) to extract the full task definition (goal, action items, acceptance criteria, dependencies).

2. **Announce start:** "Starting TASK-NNN: [Title]"

3. **Update task status** to `**Status:** In Progress` in the tasks file.

#### Phase A: Plan

```
Agent(
  subagent_type="Plan",
  description="Plan TASK-NNN",
  prompt="Create implementation plan for TASK-NNN: [task title]

Task definition:
[goal, action items, acceptance criteria from task file]

Relevant product specs:
[extracted from {{specs_dir}}/product_specs.md or {{specs_dir}}/product_specs/]

Relevant architecture:
[extracted from {{specs_dir}}/architecture.md or {{specs_dir}}/architecture/]

REQUIREMENTS FOR THE PLAN:
1. All work happens in the task worktree reported by the executor (not main workspace)
2. Must follow TDD: write test → implement → verify cycle
3. Plan covers implementation only — validation and merge are handled separately by the caller
"
)
```

If the plan does not mention worktree or TDD, reject it and re-invoke the Plan agent.

After validation, persist the plan to disk in the **same turn** as receiving the Plan agent's output:

1. `mkdir -p {{plans_dir}} && grep -qxF '.groundwork-plans/' .gitignore 2>/dev/null || printf '.groundwork-plans/\n' >> .gitignore`, then set `plan_file_path={{plans_dir}}/TASK-NNN-plan.md` (substitute the actual task ID; `{{plans_dir}}` is project-scoped, mirroring `{{specs_dir}}`). Re-running on the same task overwrites — intentional.
2. Use the `Write` tool to save the Plan agent's full output to `plan_file_path`, formatted as:
   ```markdown
   # Implementation Plan: TASK-NNN [Title]

   <verbatim Plan agent output>
   ```
3. From this point on, refer only to `plan_file_path`. Do NOT re-quote the plan in subsequent turns.

#### Phase B: Implement

```
Agent(
  subagent_type="groundwork:task-executor:task-executor",
  description="Implement TASK-NNN",
  prompt="You are implementing a task as part of an automated batch run.

PROJECT ROOT: [absolute path to project root]

TASK:
- task_id: [TASK-NNN]
- tasks_path: [absolute path to {{specs_dir}}/tasks.md or {{specs_dir}}/tasks/]

Read the '### TASK-NNN:' section from tasks_path for goal, action items,
and acceptance criteria. Do not ask the caller for task details.

PLAN FILE: [plan_file_path]
Read this file first with the Read tool — it contains the validated implementation plan.

INSTRUCTIONS:
1. Follow your preloaded skills to create a worktree, implement with TDD, and commit.
2. Read the task section from tasks_path and the plan from PLAN FILE — they provide all session context.
3. Do NOT use AskUserQuestion — proceed automatically.
4. When complete, output your final line in EXACTLY this format:
   RESULT: IMPLEMENTED | <worktree_path> | <branch> | <base_branch>
   OR:
   RESULT: FAILURE | [one-line reason]

Your LAST line of output MUST be the RESULT line.
"
)
```

Parse the result:
- `RESULT: IMPLEMENTED | <path> | <branch> | <base_branch>` → Save these values, proceed to Phase C
- `RESULT: FAILURE | ...` → STOP immediately, report failure
- No parseable RESULT line → Treat as failure

#### Phase C: Validate

Run the shared validation state machine from the task worktree in noninteractive mode (`--noninteractive`):

```
Skill(skill="groundwork:validate", args="--noninteractive")
```

Parse its terminal line:

- `Validation PASSED (...)` → proceed to Phase E.
- `Validation INCOMPLETE (...)` or an unparseable result → stop the batch. Report the reason and preserved worktree.

Do not implement a separate reviewer/fixer loop here. The `validate` skill owns the frozen baseline, repair envelopes, causal closure reviews, unworked-finding persistence, and cleanup.
#### Phase E: Merge

From the project root (NOT the worktree):

```bash
git checkout <base_branch>
git merge --no-ff <branch> -m "Merge <branch>: [Task Title]"
git worktree remove <worktree_path>
git branch -d <branch>
```

If merge conflicts occur, report them and preserve the worktree for investigation. STOP.

4. **Update task status** to `**Status:** Complete` in the tasks file.

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
- Run `/source-product-specs-from-code` to update specs with any implementation changes
- Plan next phase if milestone complete
- Review merged changes with `git log --oneline -10`
```

## Edge Cases

| Situation | Response |
|-----------|----------|
| No tasks file | "Tasks file not found. Run `/groundwork:create-tasks` to generate tasks." |
| No remaining tasks | "All tasks are already complete! Nothing to execute." |
| All remaining blocked | "All remaining tasks are blocked. Cannot proceed automatically." |
| Single task remaining | Execute normally (still confirm before starting) |
