---
name: just-do-it
description: Execute all remaining tasks in sequence until completion
allowed-tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Task", "AskUserQuestion"]
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

### Execution Order
1. TASK-NNN: [Title]
2. TASK-NNN: [Title]
...

### Blocked Tasks (will execute after dependencies complete)
- TASK-NNN: [Title] (blocked by TASK-XXX)

**Ask for confirmation before proceeding.**

If user declines, stop and suggest alternatives:
- `/execute-task N` to work on a specific task
- `/next-task` to work on just the next available task

### Step 3: Execute Loop

For each remaining task in dependency order:

1. **Announce start:** "Starting TASK-NNN: [Title]"
2. **Invoke execute-task skill:** `groundwork:execute-task` with the task ID
3. **Handle result:**
   - On success: Continue to next task
   - On failure: STOP immediately

**On Failure:** Report failed task, reason, tasks completed this session, and tasks remaining.

### Step 4: Completion Report

When all tasks complete successfully, report:
- Tasks completed this session
- Total tasks complete
- List of completed tasks
- Suggestions for next steps (`/sync-specs`, planning next phase)

## Edge Cases

| Situation | Response |
|-----------|----------|
| No tasks file | "Tasks file not found. Run `/tasks` to generate tasks." |
| No remaining tasks | "All tasks are already complete! Nothing to execute." |
| All remaining blocked | "All remaining tasks are blocked. Cannot proceed automatically." |
| Single task remaining | Execute normally (still confirm before starting) |
