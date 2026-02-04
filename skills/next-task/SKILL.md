---
name: next-task
description: Use when user asks to work on the next task, continue with tasks, or wants to know what to do next
requires: execute-task
user-invocable: false
---

# Next Task Skill

Finds the next uncompleted task from `specs/tasks.md` and delegates execution to the `execute-task` skill.

## Workflow

### Step 1: Load Tasks

Read the tasks file to find available tasks:
- Single file: `specs/tasks.md`
- Directory: `specs/tasks/` (aggregated in sorted order)

**Detection:** Check for file first (takes precedence), then directory. When reading a directory, aggregate all `.md` files recursively with `_index.md` first, then numerically-prefixed files, then alphabetically.

### Step 2: Find Next Task

Parse the tasks to find the next task to work on:

1. Look for all tasks with `**Status:** Not Started`
2. Check dependencies - filter to unblocked tasks (no incomplete dependencies)
3. **Detect ambiguity:**
   - Let `candidates` = unblocked not-started tasks
   - Let `next_sequential` = lowest numbered candidate (e.g., TASK-004)
   - Let `completed_after` = any complete task with number > next_sequential

4. **If ambiguous (completed tasks exist after candidates):**
   Present options to user with context about the gap:

   > "Multiple tasks are available. Tasks 1,2,3,5 are complete.
   > - **TASK-004:** [Title] - Earlier in sequence, may have been skipped intentionally
   > - **TASK-006:** [Title] - Next sequential after completed work
   >
   > Which would you like to work on? (or use `/groundwork:work-on N` to select a specific task)"

   Wait for user selection before proceeding.

5. **If unambiguous:** Select the first unblocked, not-started task

**Dependency check:** A task is blocked if its `Blocked by:` field lists any task that is not `Complete`.

**Tip:** For direct task selection, use `/groundwork:work-on N` to work on a specific task by number.

### Step 3: Handle Edge Cases

| Situation | Response |
|-----------|----------|
| No `specs/` directory | "No specs directory found. Run `/groundwork:design-product` to start defining your project." |
| Missing tasks file | "Tasks file not found. Run `/groundwork:create-tasks` to generate tasks from your PRD and architecture." |
| No tasks in file | "No tasks found in specs/tasks.md. The file may need to be regenerated with `/groundwork:create-tasks`." |
| All tasks complete | "All tasks complete! Consider running `/groundwork:source-product-specs-from-code` to update documentation or plan the next phase." |
| Only blocked tasks | "All remaining tasks are blocked. Blocked tasks: [list]. Would you like to override and work on one anyway?" |
| Parse error | "Could not parse tasks.md. Expected format: `### TASK-NNN: Title` with `**Status:**` field." |

### Step 4: Delegate to Execute Task

Once a task is identified, invoke the `groundwork:execute-task` skill with the task identifier (e.g., `TASK-004`).

The execute-task skill will:
1. Load full project context (PRD, architecture, tasks)
2. Present the task summary
3. Execute the task
4. Complete the task and offer to continue
