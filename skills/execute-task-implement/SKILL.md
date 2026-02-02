---
name: execute-task-implement
description: Phase 2 of execute-task - Create worktree, execute plan with TDD, run validation-loop. REQUIRES execution mode.
---

# Execute Task: Implementation Phase

## MODE CHECK (FIRST)

**If you are in plan mode:** Call `ExitPlanMode()` immediately. Implementation requires execution mode. Wait for user approval, then restart this skill.

---

## GATE 1: Worktree Creation

**You MUST create the worktree before any implementation.**

1. Invoke: `Skill(skill="groundwork:use-git-worktree", args="TASK-NNN")`
2. Verify `pwd` shows `.worktrees/TASK-NNN`
3. Output confirmation:

```
GATE 1 PASSED: Worktree created at .worktrees/TASK-NNN
```

**DO NOT proceed until GATE 1 confirmation is output.**

Record merge mode: `GROUNDWORK_AUTO_MERGE=true` (batch) or not (interactive) for later.

---

## Step 1: Update Task Status

Change task status to `**Status:** In Progress` in the worktree's `specs/tasks.md`.

## Step 2: Execute with TDD

1. Invoke: `Skill(skill="groundwork:test-driven-development")`
2. For each action item: write failing test → implement → verify
3. Ask "Is there a more elegant way?" for non-trivial changes
4. Verify each acceptance criterion is met

## Step 3: Verify Implementation

Before proceeding, verify ALL:

1. **Action Items** - Each implemented and tested
2. **Test Coverage** - All new code has tests, all tests pass
3. **Acceptance Criteria** - Each verified

Output verification:

```markdown
## Pre-Validation Verification

### Action Items
- [x] [Action 1] - Implemented in `file.ts`, tested in `test.ts`

### Test Results
- All tests pass: YES/NO

### Acceptance Criteria
- [x] [Criterion 1] - Verified by [method]
```

**If any fail:** Do NOT proceed. Continue working until all pass.

---

## GATE 2: Validation Loop

**You MUST pass validation before completing.**

1. Invoke: `Skill(skill="groundwork:validation-loop")`
2. Wait for all agents to return PASS
3. Output confirmation:

```
GATE 2 PASSED: Validation loop completed, all agents approved
```

**DO NOT proceed until GATE 2 confirmation is output.**

---

## Proceed to Completion

Output:

```
Implementation and validation complete. Proceeding to finalization.
```

Then invoke: `Skill(skill="groundwork:execute-task-complete", args="TASK-NNN [auto-merge|manual]")`

Pass the merge mode determined in GATE 1.
