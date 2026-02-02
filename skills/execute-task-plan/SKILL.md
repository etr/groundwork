---
name: execute-task-plan
description: Phase 1 of execute-task - Parse task ID, load context from main workspace, call Plan agent, validate plan, present summary for approval
---

# Execute Task: Planning Phase

This skill runs in the **main workspace** (not a worktree). Planning is read-only.

## Step 1: Parse Task Identifier

Parse the task identifier from the argument:

- **Numeric** (e.g., `4`): Interpret as `TASK-004` (zero-padded to 3 digits)
- **Full format** (e.g., `TASK-004`): Use as-is
- **No argument**: Invoke `groundwork:next-task` skill instead and STOP

**Error:** Invalid format → "Please specify a task number, e.g., `/execute-task 4`"

## Step 2: Load Task File

Read the tasks file:
- Single file: `specs/tasks.md`
- Directory: `specs/tasks/` (aggregated in sorted order)

Search for `### TASK-NNN:` pattern.

**Error:** Task not found → "TASK-NNN not found in specs/tasks.md" and STOP

## Step 3: Validate Task is Workable

**If already complete:**
> "TASK-NNN is already marked Complete. Would you like to:
> 1. Work on it anyway (resets to In Progress)
> 2. Pick a different task"

**If blocked:**
> "TASK-NNN is blocked by: [list]
> Would you like to:
> 1. Override and work on it anyway
> 2. Work on a blocking task first: [suggest first blocker]"

Wait for user confirmation before proceeding.

## Step 4: Load Project Context

Read from main workspace:
1. **Product specs** - `specs/product_specs.md` or `specs/product_specs/`
2. **Architecture** - `specs/architecture.md` or `specs/architecture/`

**If specs missing:** Report which are missing and suggest commands to create them.

## Step 5: Call Plan Agent

**You MUST use the Plan agent. Do NOT create your own plan.**

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
1. Implementation happens in worktree .worktrees/TASK-NNN (via use-git-worktree skill)
2. Must follow TDD: write test → implement → verify cycle (via test-driven-development skill)
3. Must end with validation-loop skill invocation
",
  description="Plan TASK-NNN"
)
```

## Step 6: Validate Plan

The plan MUST include these elements. Check each:

- [ ] Plan states work happens in worktree (uses `use-git-worktree` skill)
- [ ] Plan includes TDD cycle (uses `test-driven-development` skill)
- [ ] Plan ends with `validation-loop` skill

**If ANY unchecked:** Reject plan, state what's missing, re-invoke Plan agent.

## Step 7: Present Summary

Present summary and wait for user confirmation:

```markdown
## Task: [TASK-NNN] [Task Title]

**Milestone:** [name]
**Component:** [from architecture]

### Goal
[from task file]

### Action Items
- [ ] [item 1]
- [ ] [item 2]

### Acceptance Criteria
- [criterion 1]
- [criterion 2]

### Plan Summary
[Brief summary of the validated plan]

---

**Ready to implement?** Reply "yes" to proceed.

When approved, I will invoke `execute-task-implement` to:
1. Create worktree at `.worktrees/TASK-NNN`
2. Execute the plan using TDD
3. Run validation-loop
```

## STOP HERE

**Do NOT proceed to implementation.** Wait for user approval.

When user approves, output:

```
Proceeding to implementation phase.
```

Then invoke: `Skill(skill="groundwork:execute-task-implement", args="TASK-NNN")`
