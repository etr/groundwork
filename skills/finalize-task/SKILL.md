---
name: finalize-task
description: Use when a task worktree has passed validation - manually commits, merges, and cleans up, or prepares runner-owned commits and publication
argument-hint: "[task-id] [--project name]"
allowed-tools: ["Read", "Edit", "Bash", "Glob", "Grep"]
---

# Finalize Task

Finalize one validated task. Use judgment for commit and merge messages. Preserve the worktree and branch whenever state is ambiguous.

## Inputs

Accept a task ID and optional `--project <name>`.

When invoked by the external runner, treat its exact `project_root`, `worktree_path`, `branch`, `base_branch`, `base_head`, and `validated_head` values as authoritative. Missing or inconsistent runner inputs are a failure.

When invoked manually from the task worktree:

1. Resolve `--project` directly from the repository's `.groundwork.yml`; do not depend on or change persisted project selection.
2. Derive the current registered worktree and checked-out task branch.
3. Derive the primary worktree and its checked-out base branch.
4. Treat the current task HEAD as `validated_head`. If validation did not just pass for this exact tree and working state, stop and ask the user to run `validate` first.

## Workflow

### 1. Verify state

Before changing anything:

1. Confirm the task path is a registered worktree for exactly the task branch.
2. Confirm the primary worktree is on the base branch and clean.
3. Confirm the task branch HEAD equals `validated_head`.
4. Record the base branch's current head.
5. Inspect staged, unstaged, and untracked task-worktree changes without discarding any.

Never reset, stash, rebase, force-delete, or silently switch either worktree to another branch.

### 2. Complete task bookkeeping

Within the selected project's task files:

1. Change only this task's status to `Complete`.
2. Update its status-table row when an index exists.
3. Leave unrelated tasks unchanged.

### 3. Commit remaining validated work

Inspect the actual remaining diff. Include validation fixes and task bookkeeping belonging to this task.

- In runner mode, validation has already been sealed by the runner. Only task-status bookkeeping may remain; reject any other changed path. Do not stage or commit it. Return it to the runner with `action: "commit"` and propose `<task-id>: Mark task complete` plus an explanatory body. Use `action: "none"` only when no bookkeeping change remains.
- Outside runner mode, commit bookkeeping changes on the task branch as `<task-id>: Mark task complete`.
- In manual mode, describe any validated remaining change in the subject.
- Do not create an empty commit.
- Require a clean task worktree afterward only in manual mode.

In runner mode, never ask a question. Return `RESULT: FAILURE` for missing information or unsafe state.

### 4. Integrate a moved base

Check whether the current base head is an ancestor of the task branch.

If it is not:

1. Merge the current base head into the task branch with `--no-ff --no-commit`.
2. Resolve conflicts only when the task definition and surrounding code make the resolution unambiguous.
3. Record whether the merge command reported conflicts, even when every conflict was resolved unambiguously.
4. In runner mode, do not run `git add` or create the merge commit. Leave the prepared merge for the runner and propose an expressive task-prefixed commit subject and body. Return `RESULT: BASE_INTEGRATED`, bind it to the exact integrated base head, and report `conflicts_resolved: true` only when the merge command reported conflicts. The runner owns the opt-in revalidation policy and invokes finalization again after sealing the integration.
5. Outside runner mode, commit the resolution and continue to prepare and merge the task into the base branch.

If resolution needs product, architecture, or ownership judgment, safely abort the integration when possible and return `RESULT: NEEDS_INPUT`.

### 5. Prepare the merge

In runner mode:

1. Reconfirm the primary worktree is clean, the task worktree contains only the permitted bookkeeping change, and the base branch is still at the head recorded in step 1.
2. Choose a concise merge message containing the task ID and actual title or outcome.
3. Return the versioned JSON `RESULT: READY_TO_MERGE` receipt with the exact runner token, task identity, bookkeeping commit proposal when needed, and expressive outward merge subject/body. Do not merge outward, remove the worktree, or delete the branch; the runner verifies and commits the prepared tree before performing those operations.

When invoked manually, merge with `--no-ff`, then continue to cleanup below. If an unexpected conflict occurs, abort it when safe and return `RESULT: NEEDS_INPUT`. Do not resolve it on the base branch because the resolution would not have been validated.

### 6. Verify and clean up

After a successful manual merge:

1. Confirm the task branch is an ancestor of the base branch.
2. Confirm the primary worktree is clean and record its merge commit.
3. Remove exactly the verified task worktree.
4. Delete exactly the verified task branch with safe deletion.

If the merge succeeded but cleanup fails, return `RESULT: CLEANUP_REQUIRED`; do not undo the merge.

## Result contract

Make the final line exactly one of:

```text
RESULT: FINALIZED | task_id=<id> | task_head=<sha> | merge_commit=<sha> | base_branch=<branch>
RESULT: NEEDS_INPUT | reason=<one-line reason>
RESULT: CLEANUP_REQUIRED | merge_commit=<sha> | worktree_path=<path> | branch=<branch> | reason=<one-line reason>
RESULT: FAILURE | reason=<one-line reason> | worktree_path=<path> | branch=<branch>
```

In runner mode, report only one of these compact JSON receipts or a failure result:

```text
RESULT: READY_TO_MERGE | {"v":1,"token":"<exact-runner-token>","task_id":"TASK-NNN","phase":"finalize","action":"commit","commit":{"subject":"TASK-NNN: Mark task complete","body":"<bookkeeping summary>"},"merge":{"subject":"Merge TASK-NNN: <actual outcome>","body":"<publication summary>"}}
RESULT: BASE_INTEGRATED | {"v":1,"token":"<exact-runner-token>","task_id":"TASK-NNN","phase":"finalize","action":"commit","base_head":"<full-integrated-base-sha>","conflicts_resolved":true,"commit":{"subject":"TASK-NNN: Integrate updated base branch","body":"<resolution summary>"}}
RESULT: REVALIDATE | {"v":1,"token":"<exact-runner-token>","task_id":"TASK-NNN","phase":"finalize","action":"commit","base_head":"<full-integrated-base-sha>","reason":"<why revalidation is required>","commit":{"subject":"TASK-NNN: Integrate updated base branch","body":"<resolution summary>"}}
```

For `READY_TO_MERGE`, use `action: "none"` and omit `commit` when the task worktree is clean. `BASE_INTEGRATED` always uses `action: "commit"`; `REVALIDATE` remains accepted only for compatibility with older skill exports. Report `FINALIZED` only after a manual merge is present, both remaining worktrees are clean, and cleanup succeeded.
