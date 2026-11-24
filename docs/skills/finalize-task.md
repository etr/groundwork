# `finalize-task`

> **Run it:** `/groundwork:finalize-task [task-id] [--project name] [--on-unrelated-failure mode]` · **Tier:** user-run or model-invoked · **Writes:** the merge, task bookkeeping, worktree cleanup; a pull request when the project integrates that way

## What it does

The last step of a task: commit, merge the validated task branch into the base branch with `--no-ff`, and remove exactly that worktree and branch. In repositories that integrate through pull requests, it opens the PR instead and writes its body.

## When to reach for it

- A task worktree has just passed validation.
- **Not when:** validation did not just pass for this exact tree. Run `validate` first.

## Common questions

**It stopped and said the direct merge was rejected.**

A branch-protection rejection is not permission to open a pull request. Interactively it asks you; unattended it stops with `RESULT: NEEDS_INPUT` and leaves everything untouched.

**My repository merges through pull requests.**

Say so when you invoke it, or state it in the repository's `CLAUDE.md`/`AGENTS.md`. It then pushes the branch and opens (or updates) the PR, keeps the worktree and branch until the PR merges, and reports the PR as awaiting review.

**What does the PR body look like?**

Three parts: a **summary** that is the smallest visual that makes the change clear; **evidence** as before and after; and **merge danger** — one-way or two-way door, and the blast radius.

**Validation passed with waivers.**

The merge message names each waived gate as waived, never as passed.

## It's working if

- The merge commit carries the task ID and what the task achieved.
- Waived gates are named as waived, and incidental fixes are mentioned.
- The worktree and branch are removed only after a successful merge.
- On the pull-request path, nothing is pushed unless you asked, the body has its three parts, and the worktree and branch are preserved.

**It is not working if:** a PR appeared that nobody asked for, or a branch disappeared while its PR was still open.
