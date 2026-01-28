---
name: task
description: Work on a specific task by number. Usage /task 4 or /task TASK-004
argument-hint: "[task-number]"
allowed-tools: ["Read", "Edit", "Bash", "Glob", "Grep", "Write"]
---

# Work on Specific Task

Execute a specific task from `specs/tasks.md` by task number.

## Usage
- `/task 4` - Work on TASK-004
- `/task TASK-004` - Work on TASK-004
- `/task` (no argument) - Same as `/next-task`

## Workflow

### Step 1: Parse Task Identifier

Parse the task identifier from the argument:
- If numeric (e.g., `4`), interpret as `TASK-004`
- If full format (e.g., `TASK-004`), use as-is
- If no argument provided, fall back to `/next-task` behavior (find first unblocked not-started task)

### Step 2: Load Project Context

Read the following files to understand the full project context:

1. **`specs/product_specs.md`** - PRD with EARS requirements
2. **`specs/architecture.md`** - Architecture decisions and component design
3. **`specs/tasks.md`** - Task list with statuses and dependencies

**If files are missing:**
- Report which files exist and which are missing
- Suggest commands to create missing files:
  - PRD missing: "Run `/product-design` to create the PRD"
  - Architecture missing: "Run `/architecture` to create the architecture"
  - Tasks missing: "Run `/tasks` to generate the task list"

### Step 3: Find the Specified Task

Locate the specified task in `specs/tasks.md`:
- Search for `### TASK-NNN:` pattern matching the requested task number
- Extract task details: title, milestone, component, goal, action items, acceptance criteria

**Error Handling:**
- Task not found: "TASK-NNN not found in specs/tasks.md"
- Invalid format: "Please specify a task number, e.g., `/task 4` or `/task TASK-004`"

### Step 4: Validate Task is Workable

Check the task's current state:

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

### Step 5: Present Task Summary

Present the same summary format as `/next-task`:

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

1. **Update status** - Edit `specs/tasks.md` to change task status to `**Status:** In Progress`
2. **Complete action items** - Work through each action item systematically
3. **Verify acceptance criteria** - Ensure each criterion is met before marking complete
4. **Run relevant tests** - If tests exist, run them to verify implementation

### Step 7: Complete Task

1. **Update status** - Edit `specs/tasks.md` to change task status to `**Status:** Complete`
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

Would you like to continue with the next task? (Run `/next-task` or `/task N`)
```
