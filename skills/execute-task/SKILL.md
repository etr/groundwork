---
name: execute-task
description: Use when executing a specific task - REQUIRES worktree isolation (mandatory), TDD methodology (mandatory), and validation-loop completion (mandatory). No exceptions.
---

# Execute Task Skill

## WORKFLOW

### Step 0: Record auto-merge state

**Merge mode:** Record whether `GROUNDWORK_AUTO_MERGE=true` (batch mode) or not (interactive mode) for Step 10.

### Step 1: Parse Task Identifier

Parse the task identifier from the argument:

- **Numeric** (e.g., `4`): Interpret as `TASK-004` (zero-padded to 3 digits)
- **Full format** (e.g., `TASK-004`): Use as-is
- **No argument**: Invoke `groundwork:next-task` skill instead and stop here

**Error:** Invalid format → "Please specify a task number, e.g., `/groundwork:work-on 4` or `/groundwork:work-on TASK-004`"

### Step 2: Load Task File

Read the tasks file from the worktree:
- Single file: `specs/tasks.md`
- Directory: `specs/tasks/` (aggregated in sorted order)

Search for `### TASK-NNN:` pattern.

**Error:** Task not found → "TASK-NNN not found in specs/tasks.md"

### Step 3: Validate Task is Workable

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

### Step 7: Prepare For Execution

**If you are in plan mode:** Call `ExitPlanMode()` immediately. Do not explore files, do not read code, do not create plans. Wait for user approval then keep going with Step 7.

1. **Isolate the change** - Invoke: `Skill(skill="groundwork:use-git-worktree", args="TASK-NNN")`
2. **Check worktree** - Verify `pwd` shows `.worktrees/TASK-NNN`
3. **Update status** - Change task to `**Status:** In Progress`


### Step 8: Execute the Task

**Invoke implementation** - `Skill(skill="groundwork:implement-feature")`
    - Action items and acceptance criteria are available in session context from Step 6

### Step 9: Complete Task

After `implement-feature` returns successfully:

1. **Update status** - Change task to `**Status:** Complete`

### Step 10: Worktree Finalization

Ensure all changes are committed: `git status --porcelain`

**Auto-merge mode:**
1. Return to original repository
2. Checkout base branch
3. Merge: `git merge --no-ff task/TASK-NNN -m "Merge task/TASK-NNN: [Title]"`
4. If success: Remove worktree, delete branch
5. If conflicts: Report and keep worktree

**Manual mode - Ask the user:**

> "Would you like me to merge this feature into [base-branch] now?
> 1. Yes, merge now
> 2. No, I'll merge manually later"

**If user chooses "Yes, merge now":**

1. Return to original repository
2. Checkout base branch
3. Merge: `git merge --no-ff feature/TASK-NNN -m "Merge feature/TASK-NNN: [Title]"`
4. If success: Remove worktree and delete branch
5. If conflicts: Report conflicts and keep worktree for manual resolution

**If user chooses "No" or merge has conflicts:**

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

### Step 11: Offer to Continue

```markdown
## Completed: [TASK-NNN] [Task Title]

**What was done:**
- [Summary]

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
