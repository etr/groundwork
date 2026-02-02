---
name: execute-task
description: Use when executing a specific task - REQUIRES worktree isolation (mandatory), TDD methodology (mandatory), and validation-loop completion (mandatory). No exceptions.
---

# Execute Task Skill

Core execution logic for working on a specific task. This skill is invoked by both `/execute-task` and `/next-task`.

## The Non-Negotiable Rules

```
1. ALL task execution MUST use worktree isolation. No exceptions.
2. ALL implementation MUST follow TDD. No code before tests.
3. ALL tasks MUST complete validation-loop before marking done.
```

If you find yourself skipping any of these: STOP. You are violating the skill.

## Red Flags - STOP Immediately

If you find yourself doing any of these, you are violating this skill:

| Violation | What you should do instead |
|-----------|---------------------------|
| Working in main workspace directory | Create worktree first (Step 2) |
| Writing implementation code before tests | Follow TDD skill |
| Creating own plan instead of using Plan agent | Use Plan agent (Step 6) |
| Skipping validation-loop | Complete Step 10 before Step 11 |
| Marking task complete without all criteria verified | Finish Step 9 first |

## Workflow

### Step 1: Parse Task Identifier

Parse the task identifier from the argument:

- **Numeric** (e.g., `4`): Interpret as `TASK-004` (zero-padded to 3 digits)
- **Full format** (e.g., `TASK-004`): Use as-is
- **No argument**: Invoke `groundwork:next-task` skill instead and stop here

**Error Handling:**
- Invalid format: "Please specify a task number, e.g., `/execute-task 4` or `/execute-task TASK-004`"

### Step 2: Create Worktree Isolation (MANDATORY)

**STOP. This step is not optional.**

Before proceeding to Step 3:
- [ ] Worktree MUST be created via `groundwork:use-git-worktree`
- [ ] Working directory MUST be the worktree path
- [ ] If either is false: DO NOT PROCEED

Attempting to continue without worktree = skill violation.

**Why worktree isolation is mandatory:**
- Changes don't affect main workspace until merge
- Clean baseline for reproducible results
- Safe experimentation without impacting other work

**Pre-load required skills:**
Before proceeding, load these skills for reference:
- `groundwork:use-git-worktree` - Worktree creation and management
- `groundwork:validation-loop` - Multi-agent verification

**Determine merge mode:**
- **Batch mode** (`GROUNDWORK_AUTO_MERGE=true` from `/just-do-it`): Auto-merge after verification
- **Interactive mode** (all other invocations): Manual verification before merge

**Create the worktree:**
1. Invoke `groundwork:use-git-worktree` with the task ID
2. Record merge mode (auto or manual) for Step 12
3. Change working directory to the worktree path
4. Verify you are now in the worktree: `pwd` should show `.worktrees/TASK-NNN`
5. Only then continue with remaining steps

### Step 3: Load Tasks File

Read the tasks file to locate the specified task:
- Single file: `specs/tasks.md`
- Directory: `specs/tasks/` (aggregated in sorted order)

Search for `### TASK-NNN:` pattern matching the requested task identifier.

**Error Handling:**
- Task not found: "TASK-NNN not found in specs/tasks.md"

### Step 4: Validate Task is Workable

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

### Step 5: Load Project Context

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

### Step 6: Plan Implementation (MANDATORY - Use Plan Agent)

**STOP. You MUST use the Plan agent. Do NOT create your own plan.**

Before presenting the task summary, create an implementation plan using the Plan agent.

**Launch Plan agent with:**
- Task definition (goal, action items, acceptance criteria)
- Relevant product specs
- Relevant architecture decisions
- Available test patterns in codebase

**Plan Validation Checklist (ALL must be checked):**
- [ ] Plan states work happens in worktree (not main workspace)
- [ ] Plan includes TDD cycle (write test → implement → verify)
- [ ] Plan ends with `groundwork:validation-loop` invocation

**If ANY box is unchecked:**
1. REJECT the plan
2. State which requirements are missing
3. Re-invoke Plan agent with explicit instruction to include missing items
4. Repeat until all boxes checked

Do NOT proceed to Step 7 with an incomplete plan.

Store the approved plan for reference during execution.

### Step 7: Present Task Summary

Present a summary including:

```markdown
## Task: [TASK-NNN] [Task Title]

**Milestone:** [Milestone name]
**Component:** [Component from architecture]
**Estimate:** [T-shirt size]

### Execution Context
**Working Directory:** [Worktree path]
**Branch:** task/TASK-NNN
**Merge Mode:** [auto-merge | manual]

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

### Step 8: Execute Task

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
5. **Verify acceptance criteria** - Ensure each criterion is met before marking complete

### Step 9: Verify Implementation

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

### Step 10: Multi-Agent Verification

Invoke the `groundwork:validation-loop` skill to run autonomous verification.

This skill will:
- Launch all 4 verification agents in parallel
- Automatically fix any issues found
- Re-run validation until all agents approve
- Escalate to user only when stuck (same issue 3x)

**Do not proceed to Step 11 until validation-loop returns PASS.**

### Step 11: Complete Task

1. **Update status** - Edit the appropriate tasks file to change task status to `**Status:** Complete`
   - For single file: Edit `specs/tasks.md`
   - For directory: Edit the specific task file
2. **Report completion** - Summarize what was accomplished
3. **Proceed to worktree finalization**

### Step 12: Worktree Finalization

Before finalizing, ensure all changes are committed:
```bash
git status --porcelain
```

If uncommitted changes exist, commit them with an appropriate message.

**Based on merge preference:**

**Auto-merge mode:**
1. Return to original repository directory
2. Checkout the base branch
3. Merge the task branch with no-fast-forward:
   ```bash
   git merge --no-ff task/TASK-NNN -m "Merge task/TASK-NNN: [Task Title]"
   ```
4. If merge succeeds:
   - Remove the worktree: `git worktree remove <path>`
   - Delete the branch: `git branch -d task/TASK-NNN`
   - Report success
5. If merge conflicts:
   - Report the conflicting files
   - Provide resolution guidance
   - Keep worktree for investigation

**Manual verification mode:**
Report the worktree location and provide merge instructions:

```markdown
## Task Complete in Worktree

**Location:** .worktrees/TASK-NNN
**Branch:** task/TASK-NNN
**Base Branch:** [base branch name]

All changes committed. When ready to merge:
```bash
git checkout [base-branch]
git merge --no-ff task/TASK-NNN
git worktree remove .worktrees/TASK-NNN
git branch -d task/TASK-NNN
```
```

### Step 13: Offer to Continue

```markdown
## Completed: [TASK-NNN] [Task Title]

**What was done:**
- [Summary of changes made]
- [Files modified/created]

**Acceptance criteria verified:**
- [x] [Criterion 1] - [How verified]
- [x] [Criterion 2] - [How verified]

**Worktree status:** [Merged and cleaned up | Pending manual merge at .worktrees/TASK-NNN]

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

## Execution Checklist (Verify Before Completion)

Before marking any task complete, verify:

- [ ] Working in worktree (`.worktrees/TASK-NNN`)
- [ ] Plan agent was used and plan was approved
- [ ] TDD was followed (tests written before implementation)
- [ ] All acceptance criteria verified
- [ ] validation-loop returned PASS
- [ ] Task status updated in specs/tasks.md

If any unchecked: task is NOT complete. Continue working.
