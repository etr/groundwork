---
name: execute-task-complete
description: Phase 3 of execute-task - Mark task complete, finalize worktree, offer to continue
---

# Execute Task: Completion Phase

## Step 1: Mark Task Complete

Update task status to `**Status:** Complete` in the worktree's `specs/tasks.md`.

## Step 2: Commit All Changes

Ensure all changes are committed:

```bash
git status --porcelain
```

If uncommitted changes exist, commit them with message: `Complete TASK-NNN: [Task Title]`

## Step 3: Finalize Worktree

Parse merge mode from args: `auto-merge` or `manual`

### Auto-Merge Mode

1. Return to original repository: `cd` to parent of `.worktrees`
2. Checkout base branch
3. Merge: `git merge --no-ff task/TASK-NNN -m "Merge task/TASK-NNN: [Title]"`
4. If success:
   - Remove worktree: `git worktree remove .worktrees/TASK-NNN`
   - Delete branch: `git branch -d task/TASK-NNN`
5. If conflicts: Report and keep worktree for manual resolution

### Manual Mode

Output merge instructions:

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

## Step 4: Report Completion

```markdown
## Completed: [TASK-NNN] [Task Title]

**What was done:**
- [Summary of changes]

**Files modified:**
- [list key files]

**Acceptance criteria verified:**
- [x] [Criterion] - [How verified]

**Worktree status:** [Merged and cleaned up | Pending at .worktrees/TASK-NNN]
```

## Step 5: Offer to Continue

```markdown
---

**What's next?**
- `/next-task` - Work on the next available task
- `/execute-task N` - Work on a specific task
```
