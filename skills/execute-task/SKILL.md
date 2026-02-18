---
name: execute-task
description: This skill should be used when the user asks to "execute a task", "work on task N", or "implement TASK-NNN" - orchestrates worktree isolation, TDD implementation, validation, and merge.
requires: implement-feature, validation-loop
user-invocable: false
---

# Execute Task Skill

## WORKFLOW

### Step 1: Parse Task Identifier

Parse the task identifier from the argument:

- **Numeric** (e.g., `4`): Interpret as `TASK-004` (zero-padded to 3 digits)
- **Full format** (e.g., `TASK-004`): Use as-is
- **No argument**: Invoke `groundwork:next-task` skill instead and stop here

**Error:** Invalid format → "Please specify a task number, e.g., `/groundwork:work-on 4` or `/groundwork:work-on TASK-004`"

### Batch Mode Detection

If session context contains `GROUNDWORK_BATCH_MODE=true`, batch mode is active. In batch mode:
- All `AskUserQuestion` prompts are skipped — proceed with the default/automatic choice
- On completion or failure, output a structured result line (see Step 9)

### Step 2: Load Task File

Read the tasks file from the worktree:
- Single file: `specs/tasks.md`
- Directory: `specs/tasks/` (aggregated in sorted order)

Search for `### TASK-NNN:` pattern.

**Error:** Task not found → "TASK-NNN not found in specs/tasks.md"

### Step 3: Validate Task is Workable

**If already complete:**

- **Batch mode (GROUNDWORK_BATCH_MODE=true):** Output `RESULT: SUCCESS | Already complete` and stop — do not re-execute.
- **Interactive mode:** Use `AskUserQuestion` to ask:

  > "TASK-NNN is already marked Complete. What would you like to do?"
  > - Option 1: "Work on it anyway (resets to In Progress)"
  > - Option 2: "Pick a different task"

  **Wait for user response before proceeding.**

**If blocked:**

- **Batch mode (GROUNDWORK_BATCH_MODE=true):** Output `RESULT: FAILURE | Blocked by [list of blocking task IDs]` and stop.
- **Interactive mode:** Use `AskUserQuestion` to ask:

  > "TASK-NNN is blocked by: [list]. What would you like to do?"
  > - Option 1: "Override and work on it anyway"
  > - Option 2: "Work on a blocking task first: [suggest first blocker]"

  **Wait for user response before proceeding.**

### Step 4: Load Project Context

Read from the worktree:
1. **Product specs** - `specs/product_specs.md` or `specs/product_specs/`
2. **Architecture** - `specs/architecture.md` or `specs/architecture/`
3. **Tasks** - `specs/tasks.md` or `specs/tasks/`

**If specs missing:** Report which are missing and suggest commands to create them.

### Step 5: Plan Implementation

**You MUST use the Plan agent. Do NOT create your own plan.**

Launch the Plan agent:

```
Task(
  subagent_type="Plan",
  prompt="Create implementation plan for TASK-NNN: [task title]

Task definition:
[goal, action items, acceptance criteria from task file]

Relevant product specs:
[extracted requirements]

Relevant architecture:
[extracted decisions]

REQUIREMENTS FOR THE PLAN:
1. All work happens in worktree .worktrees/TASK-NNN (not main workspace)
2. Must follow TDD: write test → implement → verify cycle
3. Plan covers implementation only — validation and merge are handled separately by the caller
",
  description="Plan TASK-NNN"
)
```

**Validate the plan:**
- [ ] Plan states work happens in worktree
- [ ] Plan includes TDD cycle

**If ANY unchecked:** Reject plan, state what's missing, re-invoke Plan agent.

After plan is validated, output:

```
✓ Plan agent completed, plan validated
```

**DO NOT proceed to Step 6 until the plan completed confirmation is output.**

### Step 6: Present Task Summary

Present summary to the user:

```markdown
## Task: [TASK-NNN] [Task Title]

**Milestone:** [name]
**Component:** [from architecture]

### Execution Context
**Working Directory:** .worktrees/TASK-NNN
**Branch:** task/TASK-NNN
**Merge Mode:** [auto-merge (env) | manual]

### Goal
[from task file]

### Action Items
- [ ] [item 1]
- [ ] [item 2]

### Acceptance Criteria
- [criterion 1]
- [criterion 2]
```

**Batch mode (GROUNDWORK_BATCH_MODE=true):** Skip the confirmation — proceed directly to Step 7.

**Interactive mode:** Use `AskUserQuestion` to ask:

> "Ready to begin implementation?"
> - Option 1: "Yes, begin"
> - Option 2: "No, let me review first"

**Wait for user response before proceeding.**

### Step 7: Implementation (task-executor Agent)

**If you are in plan mode:** Call `ExitPlanMode()` immediately. Do not explore files, do not read code, do not create plans. Wait for user approval then continue with Step 7.

1. **Update status** - Change task to `**Status:** In Progress`

2. **Dispatch to the task-executor agent** with a fresh context window. This agent has `implement-feature`, `use-git-worktree`, and `test-driven-development` skills preloaded — it does not need to call `Skill()` or spawn subagents.

**Build the Task prompt with ALL gathered context.** You MUST include actual values, not placeholders:

    Task(
      subagent_type="groundwork:task-executor:task-executor",
      description="Execute TASK-NNN",
      prompt="You are implementing a task that has already been fully planned.

    [If GROUNDWORK_BATCH_MODE=true in session: include the line below]
    [If interactive: omit this line]
    Do NOT use AskUserQuestion — proceed automatically.

    PROJECT ROOT: [absolute path to project root]

    TASK DEFINITION:
    - Identifier: [TASK-NNN]
    - Title: [Task Title]

    GOAL:
    [Goal from task file]

    ACTION ITEMS:
    [Bulleted list from task file]

    ACCEPTANCE CRITERIA:
    [Bulleted list from task file]

    IMPLEMENTATION PLAN:
    [Summary of validated plan from Step 5]

    INSTRUCTIONS:
    1. Follow your preloaded skills to create a worktree, implement with TDD, and commit.
    2. The task definition above provides all session context — do NOT re-ask the user for requirements.
    3. When complete, output your final line in EXACTLY this format:
       RESULT: IMPLEMENTED | <worktree_path> | <branch> | <base_branch>
       OR:
       RESULT: FAILURE | [one-line reason]

    IMPORTANT:
    - Do NOT run validation-loop or merge — the caller handles those
    - Do NOT use AskUserQuestion for merge decisions
    - Your LAST line of output MUST be the RESULT line
    "
    )

**After the subagent returns**, parse the result:
- `RESULT: IMPLEMENTED | <path> | <branch> | <base-branch>` — Save these values, proceed to Step 7.5
- `RESULT: FAILURE | ...` — Report failure; in batch mode output `RESULT: FAILURE | [TASK-NNN] ...` and stop
- No parseable RESULT line — Report: "Implementation subagent did not return a structured result. Check worktree status manually."

### Step 7.5: Validation (Direct Skill Call)

**Call the validation-loop skill directly.** Do NOT wrap this in a subagent — this skill runs in the main conversation, which CAN spawn the 8 validation subagents it needs.

1. `cd` into the worktree path from Step 7
2. Call: `Skill(skill='groundwork:validation-loop')`
3. The validation-loop skill will run 8 verification agents in parallel and fix issues autonomously.

**After validation-loop completes:**
- All agents approved → Proceed to Step 7.7
- Validation failed → Report failure; in batch mode output `RESULT: FAILURE | [TASK-NNN] Validation failed: ...` and stop
- Stuck on recurring issue → Report the stuck finding and stop

### Step 7.7: Merge

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

### Step 8: Complete Task

After successful merge or user acknowledgment:

1. **Update status** - Change task to `**Status:** Complete`

### Step 9: Complete and Report

**Batch mode (GROUNDWORK_BATCH_MODE=true):** Output the structured result as your final line:
```
RESULT: SUCCESS | [TASK-NNN] [Task Title] - [one-line summary of what was done]
```
If the task failed at any step, output:
```
RESULT: FAILURE | [TASK-NNN] [reason for failure]
```

**Interactive mode:** Present the completion summary:

```markdown
## Completed: [TASK-NNN] [Task Title]

**What was done:**
- [Summary from implement-feature]

**Acceptance criteria verified:**
- [x] [Criterion] - [How verified]

**Validation:** Passed ([N] iteration(s))

**Worktree status:** [Merged | Pending at .worktrees/TASK-NNN]

Continue with `/groundwork:work-on-next-task` or `/groundwork:work-on N`
```

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
- [ ] Merge completed or user acknowledged worktree location

If any unchecked: task is NOT complete.
