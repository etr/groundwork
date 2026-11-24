# `use-git-worktree`

> **Tier:** library — invoked by the model when work needs isolating; the executor agent that `implement-task` dispatches follows it to create a task worktree · **Reads:** the worktree-identity helper's output, the current branch, `.gitignore`, the project's manifest and setup docs, the baseline test run · **Writes:** a task branch and a worktree under `.worktrees/` at the repo root; with your confirmation, a `.worktrees/` line in `.gitignore`; later, the merge, worktree removal, and branch deletion

## What it does

Creates an isolated git worktree for a task, sets the project up inside it, and runs the baseline tests before any work starts. The branch and the directory are not chosen by hand: both come from the shared worktree-identity helper, so interactive sessions and runner runs use the same location. The same skill covers the other end — merging the task branch back, or leaving the worktree in place for manual review.

## When to reach for it

- Feature work that needs isolation from the current workspace.
- A task needs a clean baseline: dependencies installed and tests green before the first change.
- **Not when:** you want a task run end to end. `work-on` owns the worktree as part of planning, implementation, validation, and merge.

## Common questions

**Can the worktree live somewhere else, such as a `worktrees/` directory?**

No. The directory is fixed: `<repo>/.worktrees/TASK-NNN` in a single-project repo, `<repo>/.worktrees/<project>-TASK-NNN` in a monorepo. A `worktree-dir:` directive in `CLAUDE.md` or a README convention does not move it.

**It wants to edit `.gitignore`.**

It runs `git check-ignore -q .worktrees` before creating the worktree. If `.worktrees` is not ignored, it adds `.worktrees/` to `.gitignore` with your confirmation and reports the change.

**The baseline tests failed in the new worktree.**

It stops and offers two options: continue anyway, because the tests may already be failing, or abort and investigate. The message names three possible causes: incomplete setup, tests that need a specific environment, or failing tests on the base branch.

**It says the branch already exists.**

Another session, or a runner run, may hold this task. It runs `git worktree list` and offers to reuse the existing worktree, wait, or clean it up.

## It's working if

- The identity came from `node ${CLAUDE_PLUGIN_ROOT}/lib/worktree-identity.js TASK-NNN`, and its `path` and `branch` are used verbatim — in the merge, the cleanup, and the reports.
- The worktree is at `<repo>/.worktrees/TASK-NNN`, or `<repo>/.worktrees/<project>-TASK-NNN` in a monorepo.
- `git check-ignore -q .worktrees` ran before the worktree was created; `.gitignore` changed only with your confirmation, and the change was reported.
- Setup ran from the detected manifest (`package.json` → `npm install`, `Cargo.toml` → `cargo build`, and so on) plus any steps documented in `CLAUDE.md` or `README.md`.
- The baseline test suite ran in the worktree before work began: either it passed, or you got the failing-baseline question.
- The calling skill received a `## Worktree Created` block with the branch, the base branch, and the working directory.
- A leftover unqualified worktree (`legacy.exists`), if one exists, was raised with you instead of silently adopted.

**It is not working if:** the path or the branch was typed by hand, the worktree sits outside `.worktrees/`, or work started without a baseline test run.
