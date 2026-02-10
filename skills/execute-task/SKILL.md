---
name: execute-task
description: Use when executing a specific task - REQUIRES worktree isolation (mandatory), TDD methodology (mandatory), and validation-loop completion (mandatory). No exceptions.
requires: implement-feature
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
3. Must end with groundwork:validation-loop invocation
",
  description="Plan TASK-NNN"
)
```

**Validate the plan:**
- [ ] Plan states work happens in worktree
- [ ] Plan includes TDD cycle
- [ ] Plan ends with validation-loop

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

### Step 7: Execute the Task (Subagent Dispatch)

**If you are in plan mode:** Call `ExitPlanMode()` immediately. Do not explore files, do not read code, do not create plans. Wait for user approval then continue with Step 7.

1. **Update status** - Change task to `**Status:** In Progress`

2. **Dispatch to a Task subagent** with a fresh context window. This prevents context drift from Steps 1-6.

**Build the Task prompt with ALL gathered context.** You MUST include actual values, not placeholders:

    Task(
      subagent_type="general-purpose",
      description="Execute TASK-NNN",
      prompt="You are implementing a task that has already been fully planned.

    DIRECTIVES:
    [If GROUNDWORK_BATCH_MODE=true in session: include both lines below]
    [If interactive: omit DIRECTIVES section entirely]
    GROUNDWORK_AUTO_MERGE=true
    GROUNDWORK_BATCH_MODE=true

    PROJECT ROOT: [absolute path to project root]

    TASK DEFINITION:
    - Identifier: [TASK-NNN]
    - Title: [Task Title]
    - Merge Mode: env

    GOAL:
    [Goal from task file]

    ACTION ITEMS:
    [Bulleted list from task file]

    ACCEPTANCE CRITERIA:
    [Bulleted list from task file]

    IMPLEMENTATION PLAN:
    [Summary of validated plan from Step 5]

    INSTRUCTIONS:
    1. Call Skill(skill='groundwork:implement-feature')
    2. The task definition above provides all session context — do NOT re-ask the user for requirements.
    3. For merge decisions (implement-feature Step 7), use AskUserQuestion to prompt the user (unless GROUNDWORK_BATCH_MODE is set, in which case auto-merge).
    4. When complete, output your final line in EXACTLY this format:
       RESULT: SUCCESS | [one-line summary]
       OR:
       RESULT: FAILURE | [one-line reason]

    IMPORTANT:
    - Your FIRST action MUST be calling Skill(skill='groundwork:implement-feature')
    - Do NOT implement anything yourself — the skill handles worktree, TDD, validation, and merge
    - Your LAST line of output MUST be the RESULT line
    "
    )

**After the subagent returns**, parse the result:
- `RESULT: SUCCESS | ...` — Proceed to Step 8
- `RESULT: FAILURE | ...` — Report failure; in batch mode output `RESULT: FAILURE | ...` and stop
- No parseable RESULT line — Report: "Implementation subagent did not return a structured result. Check worktree status manually."

### Step 8: Complete Task

After `implement-feature` returns successfully:

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
- [ ] validation-loop returned PASS

If any unchecked: task is NOT complete.
