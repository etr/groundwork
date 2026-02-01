---
name: next-task
description: Use when user invokes `/next-task` or asks to work on the next task, continue with tasks, or wants to know what to do next
---

# Next Task Skill

Executes the next uncompleted task from `specs/tasks.md` with full project context loaded.

## Workflow

### Step 1: Load Project Context

Read the following specs to understand the full project context. Each spec may exist as either a single file or a directory:

1. **Product specs** - PRD with EARS requirements
   - Single file: `specs/product_specs.md`
   - Directory: `specs/product_specs/` (aggregated in sorted order)

2. **Architecture** - Architecture decisions and component design
   - Single file: `specs/architecture.md`
   - Directory: `specs/architecture/` (aggregated in sorted order)

3. **Tasks** - Task list with statuses and dependencies
   - Single file: `specs/tasks.md`
   - Directory: `specs/tasks/` (aggregated in sorted order)

**Detection:** Check for file first (takes precedence), then directory. When reading a directory, aggregate all `.md` files recursively with `_index.md` first, then numerically-prefixed files, then alphabetically.

**If specs are missing:**
- Report which specs exist and which are missing
- Suggest commands to create missing specs:
  - PRD missing: "Run `/product-design` to create the PRD"
  - Architecture missing: "Run `/architecture` to create the architecture"
  - Tasks missing: "Run `/tasks` to generate the task list"

### Step 2: Find Next Task

Parse `specs/tasks.md` to find the next task to work on:

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
   > Which would you like to work on? (or use `/task N` to select a specific task)"

   Wait for user selection before proceeding.

5. **If unambiguous:** Select the first unblocked, not-started task

**Edge cases:**
- **All tasks complete:** Congratulate the user, suggest running `/sync-specs` to update docs or consider next phase
- **Only blocked tasks remain:** Report which tasks are blocked and by what, offer to override if user confirms

**Tip:** For direct task selection, use `/task N` to work on a specific task by number.

### Step 3: Present Task Summary

Before executing, present a summary including:

```markdown
## Next Task: [TASK-NNN] [Task Title]

**Milestone:** [Milestone name]
**Component:** [Component from architecture]
**Estimate:** [T-shirt size]

### Goal
[Task goal from tasks.md]

### Relevant Context

**From PRD:**
- [Relevant EARS requirements this task implements]

**From Architecture:**
- [Relevant architecture decisions/components]

### Action Items
- [ ] [Action item 1]
- [ ] [Action item 2]
- [ ] [Action item 3]

### Acceptance Criteria
- [Criterion 1]
- [Criterion 2]

Ready to begin?
```

Wait for user confirmation before proceeding.

### Step 4: Execute Task

1. **Update status** - Edit the appropriate tasks file to change task status to `**Status:** In Progress`
   - For single file: Edit `specs/tasks.md`
   - For directory: Find the file containing the task (e.g., `specs/tasks/M1-authentication/TASK-001.md`)
2. **Complete action items** - Work through each action item systematically
3. **Verify acceptance criteria** - Ensure each criterion is met before marking complete
4. **Run relevant tests** - If tests exist, run them to verify implementation

### Step 5: Complete Task

1. **Update status** - Edit the appropriate tasks file to change task status to `**Status:** Complete`
   - For single file: Edit `specs/tasks.md`
   - For directory: Edit the specific task file
2. **Report completion** - Summarize what was accomplished
3. **Offer to continue** - Ask if user wants to proceed to the next task

```markdown
## Completed: [TASK-NNN] [Task Title]

**What was done:**
- [Summary of changes made]
- [Files modified/created]

**Acceptance criteria verified:**
- [x] [Criterion 1] - [How verified]
- [x] [Criterion 2] - [How verified]

Would you like to continue with the next task?
```

## Task Status Values

When parsing and updating `specs/tasks.md`, use these status values:

- `**Status:** Not Started` - Task hasn't begun
- `**Status:** In Progress` - Currently being worked on
- `**Status:** Complete` - Task finished and verified
- `**Status:** Blocked` - Cannot proceed due to dependencies

## Dependency Handling

A task is blocked if its `Blocked by:` field lists any task that is not `Complete`.

When checking dependencies:
1. Parse the `Blocked by:` field for task IDs (e.g., `TASK-001, TASK-002`)
2. Look up each referenced task's status
3. Task is blocked if ANY dependency is not Complete

## Error Handling

| Situation | Response |
|-----------|----------|
| No `specs/` directory | "No specs directory found. Run `/product-design` to start defining your project." |
| Missing `tasks.md` only | "Tasks file not found. Run `/tasks` to generate tasks from your PRD and architecture." |
| No tasks in file | "No tasks found in specs/tasks.md. The file may need to be regenerated with `/tasks`." |
| All tasks complete | "All tasks complete! Consider running `/sync-specs` to update documentation or plan the next phase." |
| Only blocked tasks | "All remaining tasks are blocked. Blocked tasks: [list]. Would you like to override and work on one anyway?" |
| Parse error | "Could not parse tasks.md. Expected format: `### TASK-NNN: Title` with `**Status:**` field." |
