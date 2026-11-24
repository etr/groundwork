---
name: finalize-task
description: Use when a task worktree has passed validation - commits, merges, and cleans up, or prepares runner-owned commits and publication. Optional flag - --on-unrelated-failure ignore-and-merge allows merging a tree validated PASSED-WITH-WAIVERS (default stop-and-ask refuses it).
argument-hint: "[task-id] [--project name] [--on-unrelated-failure stop-and-ask|expand-and-fix|ignore-and-merge]"
allowed-tools: ["Read", "Edit", "Bash", "Glob", "Grep", "AskUserQuestion"]
---

<!-- The pull-request body shape in step 5a follows Dex Horthy's "show-me" pattern (HumanLayer), via github.com/mattpocock/skills. -->

# Finalize Task

Finalize one validated task. Use judgment for commit and merge messages. Preserve the worktree and branch whenever state is ambiguous.

## Inputs

Accept a task ID, optional `--project <name>`, and optional `--on-unrelated-failure <mode>` (`stop-and-ask`, `expand-and-fix`, or `ignore-and-merge`; default `stop-and-ask` when absent). `ignore-and-merge` is the only mode that changes finalization behavior here: it authorizes merging a tree whose terminal validation result was `Validation PASSED-WITH-WAIVERS` (see item 4 below). An invalid mode value → stop with a usage error.

When invoked by the external runner, treat its exact `project_root`, `worktree_path`, `branch`, `base_branch`, `base_head`, and `validated_head` values as authoritative. Missing or inconsistent runner inputs are a failure.

When invoked manually from the task worktree:

1. Resolve `--project` directly from the repository's `.groundwork.yml`; do not depend on or change persisted project selection.
2. Derive the current registered worktree and checked-out task branch.
3. Derive the primary worktree and its checked-out base branch.
4. Treat the current task HEAD as `validated_head`. If validation did not just pass for this exact tree and working state, stop and ask the user to run `validate` first. A `Validation PASSED-WITH-WAIVERS` outcome counts as a pass **only** when this invocation carried `--on-unrelated-failure ignore-and-merge` and the terminal validation session's coordinator-owned record contains at least one waiver receipt (failed gate, evidence, causal assessment, path attribution outside the project root, authorizing flag — see `${CLAUDE_PLUGIN_ROOT}/references/validation-session-protocol.md`); otherwise it is not a pass: stop and ask. Exception — resume entry: when a resume gate (`node ${CLAUDE_PLUGIN_ROOT}/lib/task-resume.js check <task-id>`) classified this task as `resume_at: finalize`, its terminal validated session already covers this exact tree; proceed (see `${CLAUDE_PLUGIN_ROOT}/references/task-resume-protocol.md`).

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

**Decide the integration path before anything else (manual mode only).** Take the pull-request path in 5a — instead of merging — only when the user asked for it in this invocation, or the repository's stated policy (its `CLAUDE.md`/`AGENTS.md`, or a standing instruction from the user) names pull requests as the integration path. Every other invocation merges directly, below.

In runner mode:

1. Reconfirm the primary worktree is clean, the task worktree contains only the permitted bookkeeping change, and the base branch is still at the head recorded in step 1.
2. Choose a concise merge message containing the task ID and actual title or outcome. When this finalization accepted a `PASSED-WITH-WAIVERS` validation, the merge body must name each waived gate as waived (never as passed). When validation repaired an unrelated failure under `expand-and-fix`, mention the incidental fix.
3. Return the versioned JSON `RESULT: READY_TO_MERGE` receipt with the exact runner token, task identity, bookkeeping commit proposal when needed, and expressive outward merge subject/body. Do not merge outward, remove the worktree, or delete the branch; the runner verifies and commits the prepared tree before performing those operations.

When invoked manually, merge with `--no-ff`, then continue to cleanup below. If an unexpected conflict occurs, abort it when safe and return `RESULT: NEEDS_INPUT`. Do not resolve it on the base branch because the resolution would not have been validated.

A merge rejected by branch protection is not, by itself, permission to open a pull request — pushing a branch and opening a PR publish work outward. Interactive: stop and ask. Unattended (`GROUNDWORK_BATCH_MODE=true`): return `RESULT: NEEDS_INPUT | reason=direct merge rejected; pull-request integration is not authorized` and leave the worktree and branch untouched.

### 5a. The pull-request path

Taken only as decided at the top of step 5 (never in runner mode, where the runner owns publication). Push the task branch, open (or update) the PR against the base branch instead of merging, and write its body in this shape:

```markdown
## Summary
<the smallest visual that makes the change clear — pseudocode for logic,
a call tree for control flow, a component/file tree for structure,
or a diff matched to the topic; one short paragraph at most>

## Evidence
- **Before:** <screenshot / output / failing test run>
  **After:** <screenshot / output / passing test run>
<Test runs are the default; screenshots when the change is visual>

## Merge Danger
**Door:** <one-way or two-way — can this be walked back cheaply?>
**Blast radius:** <one phrase — what breaks if this is wrong>
```

State the confirmed root-cause or decision in the body when one exists (from the debug journal or a decision record), so the reviewer starts from the answer. Use the project's domain vocabulary from `{{specs_dir}}/glossary.md` when it exists. The merge/PR message rules above (waived gates named as waived, incidental fixes mentioned) still apply to the body.

This path ends with the PR open, not with a merge: skip step 6, keep the worktree and the branch until the PR merges, and report `RESULT: NEEDS_INPUT | reason=pull request <URL> awaiting review and merge; worktree and branch preserved`.

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
