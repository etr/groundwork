---
name: execute-task
description: skill to "execute a task", "work on task N", or "implement TASK-NNN" - orchestrates worktree isolation, TDD implementation, validation, and merge.
requires: task-planning, task-implementation, validation-loop
user-invocable: false
---

# Execute Task Skill

Thin orchestrator that delegates to `task-planning`, `task-implementation`, and `validation-loop` skills for the three phases of task execution.

## Token Discipline

This skill orchestrates long multi-agent workflows. Every turn re-reads the full context window, so unnecessary turns are expensive.

1. **No narration turns.** Do not output text-only turns like "Let me load the task" or "Now I'll launch the plan agent." Combine text with a tool call in the same turn, or skip the text entirely.
2. **Batch tool calls.** When multiple tool calls are independent, issue them all in one turn.
3. **No waiting updates.** Do not output "Waiting for results..." turns. Wait silently until results arrive.
4. **Keep context lean.** Do not read file contents you won't use directly. Pass file paths to subagents and let them read in their own context windows.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high` or higher AND you are Sonnet or Opus.
If effort is below `high`, you MUST show the recommendation prompt — regardless of model.
If you are not Sonnet or Opus, you MUST show the recommendation prompt — regardless of effort level.

Otherwise → use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Task execution benefits from consistent multi-domain reasoning.\n\nRecommended: Sonnet or Opus at high effort.\n\nTo switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke.",
    "header": "Effort check",
    "options": [
      { "label": "Continue anyway" },
      { "label": "Cancel — I'll switch first" }
    ],
    "multiSelect": false
  }]
}
```

If the user selects "Cancel — I'll switch first": output the switching commands and stop. Do not proceed with the skill.

## Plan Mode Handling

1. Execute Steps 0-2 below as normal (they are read-only — planning produces a plan file).
2. After Step 2 produces the plan file, write the plan mode output:

   ```markdown
   ## Task: [TASK-NNN] [Title]

   ### Execution Context
   **Working Directory:** .worktrees/TASK-NNN
   **Branch:** task/TASK-NNN
   **Base Branch:** [current branch]

   ## Implementation Plan
   **IMPORTANT: DO NOT just execute the plan below.** Re-invoke `groundwork:execute-task` which will use the saved plan. Set:
   - `GROUNDWORK_EXECUTE_SKIP_TO_STEP_SEVEN=true`
   - `GROUNDWORK_EXECUTE_PLAN_FILE=<absolute path to plan file>`
   Then invoke `groundwork:execute-task` with the same task ID.
   ```

3. Call `ExitPlanMode()`

## Step 0: Resolve Context

1. **Check skip flag:** If session context contains `GROUNDWORK_EXECUTE_SKIP_TO_STEP_SEVEN=true`, set `plan_file_path = $GROUNDWORK_EXECUTE_PLAN_FILE` and skip directly to Step 3 (Implementation). Do NOT read the plan file's contents into this orchestrator's context — the task-implementation skill will pass the path to the executor agent.

2. **Monorepo check:** Does `.groundwork.yml` exist at the repo root?
   - If yes → Is `{{project_name}}` non-empty?
     - If empty → Invoke `Skill(skill="groundwork:project-selector")` to select a project, then restart this skill.
     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.
   - If no → Continue (single-project repo).
3. **CWD mismatch check (monorepo only):**
   - Skip if not in monorepo mode or if the project was just selected above.
   - If CWD is the repo root → fine, proceed.
   - Check which project's path CWD falls inside (compare against all projects in `.groundwork.yml`).
   - If CWD is inside the selected project's path → fine, proceed.
   - If CWD is inside a different project's path → warn via `AskUserQuestion`:
     > "You're working from `<cwd>` (inside **[cwd-project]**), but the selected Groundwork project is **[selected-project]** (`[selected-project-path]/`). What would you like to do?"
     > - "Switch to [cwd-project]"
     > - "Stay with [selected-project]"
     If the user switches, invoke `Skill(skill="groundwork:project-selector")`.
   - If CWD doesn't match any project → proceed without warning (shared directory).

## Step 1: Parse Task Identifier

Parse the task identifier from the argument:

- **Numeric** (e.g., `4`): Interpret as `TASK-004` (zero-padded to 3 digits)
- **Full format** (e.g., `TASK-004`): Use as-is
- **No argument**: Invoke `groundwork:next-task` skill to determine the next workable task, then use that ID. If next-task returns nothing workable, report and stop.

**Error:** Invalid format → "Please specify a task number, e.g. `/groundwork:work-on 4` or `/groundwork:work-on TASK-004`"

### Batch Mode Detection

If session context contains `GROUNDWORK_BATCH_MODE=true`, batch mode is active. In batch mode:
- All `AskUserQuestion` calls are skipped
- On completion or failure, output a structured result line (Step 7)

## Step 2: Plan → `task-planning`

Call `Skill(skill="groundwork:task-planning")` with the task ID from Step 1 in the conversation context.

**Parse the output:**
- `RESULT: PLANNED | plan_file_path=<path> | identifier=<id> | branch_prefix=<prefix>` → Save `plan_file_path`, `identifier`, `branch_prefix`. Proceed.
- `RESULT: FAILURE | ...` → Report failure. In batch mode output `RESULT: FAILURE | [TASK-NNN] <reason>` and stop. In interactive mode, report the failure and stop.

### Step 2.5: Confirm Start (Interactive Only)

**Batch mode (GROUNDWORK_BATCH_MODE=true):** Skip to Step 3.

**Interactive mode:** Use `AskUserQuestion`:

> "[TASK-NNN] [Title] — plan ready. Proceed to implementation?"
> - Option 1: "Yes, begin implementation"
> - Option 2: "Stop here — I'll review the plan first"

**If "Stop here":** Print the plan file path and resume instructions, then STOP:

    Plan saved to: <plan_file_path>
    
    To resume implementation later:
    /groundwork:implement-task <task-number>

## Step 3: Implement → `task-implementation`

Call `Skill(skill="groundwork:task-implementation")` with `task_id` and `plan_file_path` in the conversation context.

**Parse the output:**
- `RESULT: IMPLEMENTED | worktree_path=<path> | branch=<branch> | base_branch=<bb>` → Save values. Proceed.
- `RESULT: FAILURE | ...` → Report failure. In batch mode output `RESULT: FAILURE | [TASK-NNN] <reason>` and stop. In interactive mode, report and stop.

### Step 3.5: Optional Context Clear Pause (Interactive Only)

**Skip this step entirely if `GROUNDWORK_BATCH_MODE=true`** — proceed directly to Step 4.

In interactive mode, the orchestrator's context now holds the plan summary and the executor result. Validation runs 9 reviewer agents and may iterate through a fix loop, which compounds context further. Offer the user a chance to stop here so they can clear context before validation begins.

Use `AskUserQuestion` to ask:

> "Implementation complete for [TASK-NNN]. Validation runs 9 reviewer agents next and can compound context. Clear context before validation?"
> - Option 1: "Continue to validation now"
> - Option 2: "Stop here — I'll clear and resume manually"

**If "Continue to validation now":** Proceed to Step 4.

**If "Stop here":** Print the resume instructions below and STOP. Do NOT call validation-loop. Do NOT proceed to Steps 4, 5, 6, or 7.

    ## Paused before validation

    Implementation is committed in:
    - **Worktree:** `<worktree_path>`
    - **Branch:** `<branch>`
    - **Base branch:** `<base_branch>`

    To resume validation in a clean context:

    1. Run `/clear` to clear Claude Code context
    2. `cd <worktree_path>`
    3. Run `/groundwork:validate`

    After validation passes, merge manually from the project root:

        cd <project_root>
        git checkout <base_branch>
        git merge --no-ff <branch>
        git worktree remove <worktree_path>
        git branch -d <branch>

    Then mark **TASK-NNN** as `Complete` in the tasks file.

This is a hard stop. The user explicitly chose to take over the rest of the workflow.

## Step 4: Validate

**Call the validation-loop skill directly.** Do NOT wrap this in a subagent — this skill runs in the main conversation, which CAN spawn the 9 validation subagents it needs.

1. `cd` into the worktree path from Step 3
2. Call: `Skill(skill='groundwork:validation-loop')`
3. The validation-loop skill will run 9 verification agents in parallel and fix issues autonomously.

**After validation-loop completes:**
- All agents approved → Proceed to Step 5
- Validation failed → Report failure; in batch mode output `RESULT: FAILURE | [TASK-NNN] Validation failed: ...` and stop
- Stuck on recurring issue → Report the stuck finding and stop

## Step 5: Merge

**From the project root** (NOT the worktree), handle merge:

**Determine merge action:**

| Condition | Behavior |
|-----------|----------|
| `GROUNDWORK_BATCH_MODE=true` | Auto-merge immediately |
| `GROUNDWORK_AUTO_MERGE` env var is `true` | Auto-merge immediately |
| Otherwise | Prompt user for decision |

**If prompting user:**

Use `AskUserQuestion` to ask:

> "Implementation and validation complete for [TASK-NNN]. Would you like me to merge this into [base-branch] now?"
> - Option 1: "Yes, merge now"
> - Option 2: "No, I'll merge manually later"

**Wait for user response before proceeding.**

**If merging:**

1. Ensure you are in the project root (cd out of worktree if needed)
2. Checkout base branch: `git checkout <base-branch>`
3. Merge: `git merge --no-ff <branch> -m "Merge <branch>: [Task Title]"`
4. If success: Remove worktree and delete branch:
   ```bash
   git worktree remove .worktrees/TASK-NNN
   git branch -d <branch>
   ```
5. If conflicts: Report conflicts and keep worktree for manual resolution

**If not merging or conflicts occurred:**

Report worktree location and manual merge instructions:

```markdown
## Implementation Complete in Worktree

**Location:** .worktrees/TASK-NNN
**Branch:** task/TASK-NNN

When ready to merge:
```bash
git checkout [base-branch]
git merge --no-ff <branch>
git worktree remove .worktrees/TASK-NNN
git branch -d <branch>
```

To continue working:
```bash
cd .worktrees/TASK-NNN
```
```

## Step 6: Complete Task

After successful merge or user acknowledgment:

1. **Update status** — Change task file to `**Status:** Complete` and update the status table in `{{specs_dir}}/tasks/_index.md` or `{{specs_dir}}/tasks.md` (change the task's row to `Complete`)

## Step 7: Report

**Batch mode (GROUNDWORK_BATCH_MODE=true):** Output the structured result as your final line:
```
RESULT: SUCCESS | [TASK-NNN] [Task Title] - [one-line summary of what was done]
```
If the task failed at any step, output:
```
RESULT: FAILURE | [TASK-NNN] [reason for failure]
```

**Interactive mode:** Output exactly one line:

```
Done: [TASK-NNN] merged → <base>. Validation passed in N iter(s).
```

If the merge did not happen, replace `merged → <base>` with `pending at <worktree_path>`.

---

## Reference

### Task Status Values
- `**Status:** Not Started`
- `**Status:** In Progress`
- `**Status:** Complete`
- `**Status:** Blocked`

### Dependency Handling
Task is blocked if `Blocked by:` lists any task not Complete.

### Final Checklist
Before marking complete, verify ALL:
- [ ] Working in worktree (`.worktrees/TASK-NNN`)
- [ ] Plan agent was used (not your own plan)
- [ ] TDD was followed
- [ ] All acceptance criteria verified
- [ ] validation-loop returned PASS (via direct Skill call)
- [ ] All validation fixes were applied by the validation-fixer subagent — zero `Edit`/`Write`/`NotebookEdit` calls and zero file-mutating `Bash` calls (`sed -i`, `awk -i`, `tee`, `>`, `>>`, etc.) by this orchestrator during the validation phase. If you fixed anything yourself instead of dispatching to validation-fixer, that is a violation of the validation-loop hard rule and the task is NOT complete.
- [ ] Merge completed or user acknowledged worktree location

If any unchecked: task is NOT complete.
