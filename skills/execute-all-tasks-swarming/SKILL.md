---
name: execute-all-tasks-swarming
description: This skill should be used when executing all remaining tasks using agent teams for context isolation - each task runs in a separate teammate session that can spawn its own subagents
requires:
user-invocable: false
---

# Swarming Batch Task Execution

Executes all remaining tasks using **agent teams** for context isolation. Each task runs in a separate teammate session with its own context window. Teammates are full Claude Code sessions that can spawn subagents (Plan, task-executor, 9 validators), solving the context accumulation problem of inline batch execution.

**When to use this vs `/groundwork:just-do-it`:**
- Use **this** (`/groundwork:just-do-it-swarming`) for large batches (>5 tasks) where context accumulation is a concern
- Use **`/groundwork:just-do-it`** for small batches or when agent teams are not available

**Requirement:** Agent teams must be enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` in settings.json `env` section).

**Model:** Teammates spawn with `model: "opus"` for extended context.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high` or higher AND you are Sonnet or Opus.
If effort is below `high`, you MUST show the recommendation prompt — regardless of model.
If you are not Sonnet or Opus, you MUST show the recommendation prompt - regardless of effort level.

Otherwise → use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Do you want to switch? Team orchestration with worktree coordination across agents benefits from consistent reasoning.\n\nTo switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke this skill.",
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
     - If empty → Invoke `Skill(skill="groundwork:project-selector")` to select a project, then restart this skill.
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
     If the user switches, invoke `Skill(skill="groundwork:project-selector")`.
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

## Swarming Batch Execution Summary

**Mode:** Agent Teams (swarming)
**Total tasks:** X
**Already complete:** Y
**Remaining:** Z

### Context Isolation

Each task runs in a **separate teammate session** with its own context window:
- Teammates are full Claude Code sessions with the complete system prompt
- Each teammate can spawn subagents (Plan, task-executor, 9 validation agents)
- Context is fully isolated between tasks — no accumulation in the lead's conversation
- Changes merged after each task completes

### Worktree Isolation

Each task also executes in an isolated git worktree:
- Branch: `task/TASK-NNN` created from current HEAD
- Working directory: `.worktrees/TASK-NNN`
- Changes merged automatically after each task completes successfully
- Worktrees cleaned up after successful merge

### Execution Order
1. TASK-NNN: [Title]
2. TASK-NNN: [Title]
...

### Blocked Tasks (will execute after dependencies complete)
- TASK-NNN: [Title] (blocked by TASK-XXX)

**Ask for confirmation before proceeding.**

If user declines, stop and suggest alternatives:
- `/groundwork:just-do-it` for inline execution (no agent teams required)
- `/groundwork:work-on N` to work on a specific task
- `/groundwork:work-on-next-task` to work on just the next available task

### Step 2.5: Validate Agent Teams Enabled

Before creating the team, verify agent teams are available by checking if the team creation tools are accessible.

**If agent teams are not enabled:**

> "Agent teams are required for swarming mode but are not enabled. To enable them, add this to your settings.json:
>
> ```json
> {
>   "env": {
>     "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
>   }
> }
> ```
>
> Alternatively, use `/groundwork:just-do-it` for inline batch execution (no agent teams required)."

Stop here if not enabled.

### Step 2.7: Load Execute-Task Workflow

Before spawning any teammates, load the execute-task skill content so it can be embedded in each teammate's prompt:

1. **Find the skill file:** Use Glob to find `**/execute-task/SKILL.md` within the groundwork plugin directory.
2. **Read the file:** Use the Read tool to read the entire file.
3. **Extract the body:** Skip the YAML frontmatter (the `---` delimited block at the top of the file) and keep everything after it. This is the execute-task workflow content.
4. **Store as `EXECUTE_TASK_WORKFLOW`:** Hold this content for use in the teammate spawn prompts below.

**CRITICAL: Embed the workflow VERBATIM.** Do not summarize, condense, rewrite, or adapt the workflow text. The teammate needs the full, unmodified workflow to follow it step-by-step. Summarization loses gate conditions (e.g. mandatory validation before merge) that prevent broken tasks from being merged.

### Step 3: Create Team and Execute

Determine execution mode from the user's argument or request:
- **Sequential (default):** One task at a time, each in its own teammate session. Clean context per task.
- **Parallel (if `--parallel` argument or user requests it):** Independent tasks execute simultaneously in separate teammates.

#### Sequential Mode (Default)

Create an agent team. Then for each remaining task in dependency order:

1. **Read the task section** from `{{specs_dir}}/tasks.md` (or aggregated from `{{specs_dir}}/tasks/`) to extract the full task definition (goal, action items, acceptance criteria, dependencies).

2. **Announce start:** "Starting TASK-NNN: [Title] (teammate session)"

3. **Update task status** to `**Status:** In Progress` in the tasks file.

4. **Spawn a teammate** with `model: "opus"` to execute the task. The teammate's spawn prompt must include:

   ```
   You are executing a single task as part of an automated batch run.

   GROUNDWORK_BATCH_MODE=true — do NOT use AskUserQuestion. Proceed automatically.

   PROJECT ROOT: [absolute path to project root]
   SPECS DIR: {{specs_dir}}

   TASK IDENTIFIER: TASK-NNN
   TASK TITLE: [Title]

   TASK DEFINITION:
   [Full task section from tasks file: goal, action items, acceptance criteria, dependencies]

   EXECUTE-TASK WORKFLOW:
   [EXECUTE_TASK_WORKFLOW loaded in Step 2.7]

   INSTRUCTIONS:
   1. Follow the EXECUTE-TASK WORKFLOW above starting from Step 1 (Parse Task Identifier).
      - Skip Step 0 (context already resolved by the lead).
      - TASK IDENTIFIER and TASK DEFINITION are provided above — use them directly.
      - GROUNDWORK_BATCH_MODE is true — auto-proceed all confirmations.
   2. When all the steps of the workflow are complete, report:
      - Success: "TASK-NNN: SUCCESS — [one-line summary]"
        Include validation results per agent:
        VALIDATION: code-quality=[N] test-quality=[N] security=[N] spec-alignment=[N] architecture=[N] simplification=[N] housekeeping=[N] performance=[N] design-consistency=[N]
        (where [N] is the number of iterations each agent required to pass)
      - Failure: "TASK-NNN: FAILURE — [one-line reason]"
   ```

5. **Wait for teammate to complete.** Monitor via the shared task list.

6. **Collect result** from the teammate's completion message.

7. **Verify workflow compliance:** Parse the teammate's completion message for validation evidence.
   - Look for the `VALIDATION:` line with per-agent iteration counts (e.g., `code-quality=2 test-quality=1 ...`).
   - If the validation line is **present**: proceed to step 8.
   - If the validation line is **missing**: send the teammate a correction via `SendMessage`:
     > "Your completion report is missing the VALIDATION line with per-agent iteration counts. Run the validation loop (Step 7.5 of the execute-task workflow) and report back with:
     > VALIDATION: code-quality=[N] test-quality=[N] security=[N] spec-alignment=[N] architecture=[N] simplification=[N] housekeeping=[N] performance=[N] design-consistency=[N]"
   - Wait for the teammate to respond and re-collect the result.
   - If the teammate's second response still lacks the validation line: mark the task as failed with reason "Teammate did not complete validation".

8. **Update task status:**
   - Success → `**Status:** Complete` in the tasks file
   - Failure → STOP immediately (see failure handling below)

9. **Shut down the teammate** before spawning the next one. This ensures each task gets a completely clean context.

10. **Log result:** "Completed TASK-NNN: [Title] — [one-line summary]"

**On Failure:** Report the failed task, reason, tasks completed this session, and tasks remaining. Note that the failed task's worktree is preserved at `.worktrees/TASK-NNN` for investigation. Clean up the team.

#### Parallel Mode (`--parallel`)

1. **Build dependency groups:** Partition tasks into levels based on the dependency graph. Level 0 = tasks with no dependencies. Level 1 = tasks whose dependencies are all in Level 0. Etc.

2. **Process one level at a time:**

   For each dependency level:

   a. Determine the independent tasks in this level that are not yet complete.

   b. **Cap concurrency:** Spawn at most **5 teammates** simultaneously (to control token cost). If more tasks than the cap, queue the rest.

   c. **Spawn teammates** for each task in the level, each with `model: "opus"` and the same spawn prompt as sequential mode.

   d. **Wait for all teammates in this level to complete.** As teammates finish, collect results. If any task fails, stop spawning new teammates but let running teammates finish.

   e. **Verify workflow compliance** for each teammate before shutting it down:
      - Parse the teammate's completion message for the `VALIDATION:` line with per-agent iteration counts.
      - If **present**: update task status to Complete.
      - If **missing**: send the teammate a correction via `SendMessage`:
        > "Your completion report is missing the VALIDATION line with per-agent iteration counts. Run the validation loop (Step 7.5 of the execute-task workflow) and report back with:
        > VALIDATION: code-quality=[N] test-quality=[N] security=[N] spec-alignment=[N] architecture=[N] simplification=[N] housekeeping=[N] performance=[N] design-consistency=[N]"
      - Wait for the teammate to respond and re-check.
      - If the teammate's second response still lacks the validation line: mark the task as failed with reason "Teammate did not complete validation".

   f. **Shut down all teammates** in this level before proceeding to the next.

3. **Continue to next dependency level** only after all tasks in the current level are complete.

**On Failure in Parallel Mode:** Report the failed task(s). If multiple tasks in the same level fail, report all of them. Stop processing further levels. Clean up the team.

### Step 4: Completion Report

Clean up the agent team, then report:

```markdown
## Swarming Batch Execution Complete

**Mode:** Agent Teams (swarming)

**Session Summary:**
- Tasks completed: X
- Total tasks complete: Y/Z
- All worktrees merged and cleaned up
- Agent team cleaned up

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

### Context Isolation Summary
- Teammate sessions spawned: X
- Each task ran in its own context window
- Lead context remained clean throughout execution

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
| Single task remaining | Execute normally (still uses a teammate for context isolation) |
| Agent teams not enabled | Report error and suggest enabling or using `/groundwork:just-do-it` |
| Teammate crashes/hangs | Report failure for that task, preserve worktree, clean up team, stop batch |
| Merge conflict in teammate | Teammate reports failure, lead stops batch and reports the conflict |
