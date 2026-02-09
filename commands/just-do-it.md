---
name: groundwork:just-do-it
description: Execute all remaining tasks in sequence until completion. Usage /groundwork:just-do-it
allowed-tools: ["Read", "Bash", "Glob", "Grep", "Task", "AskUserQuestion"]
disable-model-invocation: true
---

# Just Do It - Batch Task Execution

Executes all remaining tasks in sequence until completion, stopping on first failure.

## Workflow

### Step 1: Load and Analyze Tasks

1. Read the tasks file to find all tasks:
   - Single file: `specs/tasks.md`
   - Directory: `specs/tasks/` (aggregated in sorted order)

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
- Branch: `task/TASK-NNN` created from current HEAD
- Working directory: `.worktrees/TASK-NNN`
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

### Step 3: Execute Loop (Subagent Dispatch)

Each task is dispatched to its own **Task subagent** with a fresh context window. This prevents context accumulation — the main loop holds only the task list and pass/fail results.

For each remaining task in dependency order:

1. **Read the task section** from `specs/tasks.md` (or aggregated from `specs/tasks/`) to extract the full task definition (goal, action items, acceptance criteria, dependencies).

2. **Announce start:** "Starting TASK-NNN: [Title]"

3. **Dispatch to a Task subagent:**

```
Task(
  subagent_type="general-purpose",
  description="Execute TASK-NNN",
  prompt="You are executing a task as part of an automated batch run.

DIRECTIVES:
GROUNDWORK_AUTO_MERGE=true
GROUNDWORK_BATCH_MODE=true

PROJECT ROOT: [absolute path to project root]

TASK DEFINITION:
[Paste the full task section from specs/tasks.md here]

INSTRUCTIONS:
1. Call Skill(skill='groundwork:execute-task', args='TASK-NNN')
2. The batch mode directives above tell execute-task to skip all user confirmations and auto-merge worktrees.
3. When execute-task completes, output your final line in EXACTLY this format:
   RESULT: SUCCESS | [one-line summary of what was done]
   OR:
   RESULT: FAILURE | [one-line reason for failure]

IMPORTANT:
- Do NOT use AskUserQuestion at any point
- Do NOT ask for confirmation — proceed automatically
- Your LAST line of output MUST be the RESULT line
"
)
```

4. **Parse the subagent result:**
   - Look for the last line matching `RESULT: SUCCESS | ...` or `RESULT: FAILURE | ...`
   - `SUCCESS` → Log the summary, continue to next task
   - `FAILURE` → STOP immediately
   - No parseable RESULT line → Treat as failure: `FAILURE | Subagent did not return structured result`

**On Failure:** Report the failed task, reason, tasks completed this session, and tasks remaining. Note that the failed task's worktree is preserved at `.worktrees/TASK-NNN` for investigation.

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
