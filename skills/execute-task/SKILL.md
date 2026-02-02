---
name: execute-task
description: Use when executing a specific task - REQUIRES worktree isolation (mandatory), TDD methodology (mandatory), and validation-loop completion (mandatory). No exceptions.
---

# Execute Task Skill

## MODE CHECK (FIRST)

**If you are in plan mode:** Call `ExitPlanMode()` immediately. Do not explore files, do not read code, do not create plans. Wait for user approval, then restart this skill from Step 1.

## MANDATORY GATES

These gates MUST be passed in order. Each gate requires you to output a confirmation block before proceeding.

### GATE 1: Worktree Isolation
- **Tool:** `Skill(skill="groundwork:use-git-worktree", args="TASK-NNN")`
- **Required output:** `✓ GATE 1: Worktree created at .worktrees/TASK-NNN`
- **BLOCK:** Do not read task files or project specs until this gate is passed

### GATE 2: Plan Agent
- **Tool:** `Task(subagent_type="Plan", prompt="[task context]", description="Plan TASK-NNN")`
- **Required output:** `✓ GATE 2: Plan agent completed, plan validated`
- **BLOCK:** Do NOT create your own plan. You MUST use the Task tool with subagent_type="Plan"

### GATE 3: Validation Loop
- **Tool:** `Skill(skill="groundwork:validation-loop")`
- **Required output:** `✓ GATE 3: Validation loop passed`
- **BLOCK:** Do not mark task complete until this gate is passed

---

## WORKFLOW

### Step 1: Parse Task Identifier

Parse the task identifier from the argument:

- **Numeric** (e.g., `4`): Interpret as `TASK-004` (zero-padded to 3 digits)
- **Full format** (e.g., `TASK-004`): Use as-is
- **No argument**: Invoke `groundwork:next-task` skill instead and stop here

**Error:** Invalid format → "Please specify a task number, e.g., `/execute-task 4` or `/execute-task TASK-004`"

### Step 2: Create Worktree → GATE 1

**You MUST pass GATE 1 before proceeding.**

1. Invoke: `Skill(skill="groundwork:use-git-worktree", args="TASK-NNN")`
2. Verify `pwd` shows `.worktrees/TASK-NNN`
3. Output the gate confirmation:

```
✓ GATE 1: Worktree created at .worktrees/TASK-NNN
```

**Merge mode:** Record whether `GROUNDWORK_AUTO_MERGE=true` (batch mode) or not (interactive mode) for Step 12.

**DO NOT proceed to Step 3 until GATE 1 confirmation is output.**

### Step 3: Load Task File

Read the tasks file from the worktree:
- Single file: `specs/tasks.md`
- Directory: `specs/tasks/` (aggregated in sorted order)

Search for `### TASK-NNN:` pattern.

**Error:** Task not found → "TASK-NNN not found in specs/tasks.md"

### Step 4: Validate Task is Workable

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

### Step 5: Load Project Context

Read from the worktree:
1. **Product specs** - `specs/product_specs.md` or `specs/product_specs/`
2. **Architecture** - `specs/architecture.md` or `specs/architecture/`
3. **Tasks** - `specs/tasks.md` or `specs/tasks/`

**If specs missing:** Report which are missing and suggest commands to create them.

### Step 6: Plan Implementation → GATE 2

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
✓ GATE 2: Plan agent completed, plan validated
```

**DO NOT proceed to Step 7 until GATE 2 confirmation is output.**

### Step 7: Present Task Summary

Present summary and wait for user confirmation:

```markdown
## Task: [TASK-NNN] [Task Title]

**Milestone:** [name]
**Component:** [from architecture]

### Execution Context
**Working Directory:** .worktrees/TASK-NNN
**Branch:** task/TASK-NNN
**Merge Mode:** [auto-merge | manual]

### Goal
[from task file]

### Action Items
- [ ] [item 1]
- [ ] [item 2]

### Acceptance Criteria
- [criterion 1]
- [criterion 2]

Ready to begin?
```

### Step 8: Execute Task

1. **Update status** - Change task to `**Status:** In Progress`
2. **Invoke TDD skill** - `Skill(skill="groundwork:test-driven-development")`
3. **Complete action items** - Write failing test → implement → verify for each
4. **Demand elegance** - Ask "Is there a more elegant way?" for non-trivial changes
5. **Verify acceptance criteria** - Each must be met

### Step 9: Verify Implementation

Verify all work before proceeding:

1. **Action Items** - Each implemented and tested
2. **Test Coverage** - All new code has tests, all pass
3. **Acceptance Criteria** - Each verified

Output verification results:

```markdown
## Verification Results

### Action Items
- [x] [Action 1] - Implemented in `file.ts`, tested in `test.ts`

### Test Results
- All tests pass: ✓

### Acceptance Criteria
- [x] [Criterion 1] - Verified by [method]
```

**If any fail:** Do not proceed. Continue working.

### Step 10: Multi-Agent Verification → GATE 3

Invoke: `Skill(skill="groundwork:validation-loop")`

This runs 4 verification agents in parallel with autonomous fix-and-retry.

After validation passes, output:

```
✓ GATE 3: Validation loop passed
```

**DO NOT proceed to Step 11 until GATE 3 confirmation is output.**

### Step 11: Complete Task

1. **Update status** - Change task to `**Status:** Complete`
2. **Report completion**
3. **Proceed to worktree finalization**

### Step 12: Worktree Finalization

Ensure all changes are committed: `git status --porcelain`

**Auto-merge mode:**
1. Return to original repository
2. Checkout base branch
3. Merge: `git merge --no-ff task/TASK-NNN -m "Merge task/TASK-NNN: [Title]"`
4. If success: Remove worktree, delete branch
5. If conflicts: Report and keep worktree

**Manual mode:**
Report worktree location and merge instructions:

```markdown
## Task Complete in Worktree

**Location:** .worktrees/TASK-NNN
**Branch:** task/TASK-NNN

When ready to merge:
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
- [Summary]

**Acceptance criteria verified:**
- [x] [Criterion] - [How verified]

**Worktree status:** [Merged | Pending at .worktrees/TASK-NNN]

Continue with `/next-task` or `/execute-task N`
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
- [ ] GATE 1 confirmation was output
- [ ] Plan agent was used (not your own plan)
- [ ] GATE 2 confirmation was output
- [ ] TDD was followed
- [ ] All acceptance criteria verified
- [ ] validation-loop returned PASS
- [ ] GATE 3 confirmation was output

If any unchecked: task is NOT complete.
