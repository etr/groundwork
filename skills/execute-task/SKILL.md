---
name: execute-task
description: Use when executing a specific task - loads context, presents summary, executes work items, and completes the task
---

# Execute Task Skill

Core execution logic for working on a specific task. This skill is invoked by both `/execute-task` and `/next-task`.

## Workflow

### Step 1: Parse Task Identifier

Parse the task identifier from the argument:

- **Numeric** (e.g., `4`): Interpret as `TASK-004` (zero-padded to 3 digits)
- **Full format** (e.g., `TASK-004`): Use as-is
- **No argument**: Invoke `groundwork:next-task` skill instead and stop here

**Error Handling:**
- Invalid format: "Please specify a task number, e.g., `/execute-task 4` or `/execute-task TASK-004`"

### Step 2: Load Tasks File

Read the tasks file to locate the specified task:
- Single file: `specs/tasks.md`
- Directory: `specs/tasks/` (aggregated in sorted order)

Search for `### TASK-NNN:` pattern matching the requested task identifier.

**Error Handling:**
- Task not found: "TASK-NNN not found in specs/tasks.md"

### Step 3: Validate Task is Workable

Check the task's current state before proceeding:

**If already complete:**
> "TASK-NNN is already marked Complete. Would you like to:
> 1. Work on it anyway (this will reset status to In Progress)
> 2. Pick a different task"

**If blocked:**
> "TASK-NNN is blocked by: [list of incomplete dependencies]
> Would you like to:
> 1. Override and work on it anyway (dependencies will still need completing)
> 2. Work on a blocking task first: [suggest first blocker]"

Wait for user confirmation before proceeding with blocked or completed tasks.

### Step 4: Load Project Context

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

### Step 5: Present Task Summary

Present a summary including:

```markdown
## Task: [TASK-NNN] [Task Title]

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

### Step 6: Execute Task

1. **Update status** - Edit the appropriate tasks file to change task status to `**Status:** In Progress`
   - For single file: Edit `specs/tasks.md`
   - For directory: Find the file containing the task (e.g., `specs/tasks/M1-authentication/TASK-001.md`)
2. **Invoke TDD skill** - Use the `groundwork:test-driven-development` skill for all implementation work
3. **Complete action items** - Work through each action item using TDD methodology:
   - Write failing test first
   - Implement minimal code to pass
   - Refactor while keeping tests green
4. **Demand Elegance** - For non-trivial changes, pause and ask "Is there a more elegant way?".
   - If a fix feels hacky: "Knowing everything I know now, implement the elegant solution".
   - Hacky solutions to complex problems are not elegant.
   - Over-engineered solutions to simple tasks are not elegant.
   - Write code that minimizes the cognitive load of those of read it.
   - Challenge your own work before presenting it.
   - Don't be lazy. No temporary fixes. All code is production code.
4. **Verify acceptance criteria** - Ensure each criterion is met before marking complete

### Step 7: Verify Implementation

Before marking the task complete, systematically verify all work:

1. **Action Items Checklist** - Review each action item from the task:
   - Confirm implementation exists
   - Run tests covering the action item
   - Verify behavior matches requirement

2. **Test Coverage** - Ensure all new code has tests:
   - All new functions/methods have tests
   - Edge cases and error scenarios covered
   - Tests pass and output is pristine

3. **Acceptance Criteria** - Verify each criterion:
   - Execute verification steps for each criterion
   - Document how each was verified

**If any verification fails:**
- Do not proceed to completion
- Report which items failed verification
- Continue working until all items pass

**Verification Output:**
```markdown
## Verification Results

### Action Items
- [x] [Action 1] - Implemented in `path/to/file.ts`, tested in `path/to/test.ts`
- [x] [Action 2] - Implemented in `path/to/file.ts`, tested in `path/to/test.ts`

### Test Results
- All tests pass: ✓
- Coverage: [percentage]%

### Acceptance Criteria
- [x] [Criterion 1] - Verified by [method]
- [x] [Criterion 2] - Verified by [method]

Ready to mark task complete.
```

### Step 8: Complete Task

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

Would you like to continue with the next task? (Run `/next-task` or `/execute-task N`)
```

## Task Status Values

When parsing and updating tasks, use these status values:

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
