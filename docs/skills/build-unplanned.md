# `build-unplanned`

> **Run it:** `/groundwork:build-unplanned [feature-description] [--on-unrelated-failure stop-and-ask|expand-and-fix|ignore-and-merge]` · **Tier:** user-run · **Reads:** your feature description, existing specs if there are any, `.groundwork.yml` in a monorepo · **Writes:** a plan file for a `FEATURE-<slug>` identifier, the feature worktree and its commits, validation fixes, the merge into the base branch, worktree and branch cleanup

## What it does

Builds a feature that has no task behind it, by delegating to the same three skills `work-on` uses: `plan-task` (in blurb mode), `implement-task`, and `validate`. Planning clarifies the requirements with you first, then saves a plan. Implementation happens in an isolated worktree, test-first. You are asked before implementation starts, offered a pause before validation, and asked again before the merge.

## When to reach for it

- A feature request has no task behind it: an ad-hoc request, a prototype, or a repo with no specs yet.
- You want the feature built in an isolated worktree and validated before it reaches the base branch.
- **Not when:** the work is a planned task with existing specs. That is `groundwork:work-on`.

## Common questions

**The first thing it asked was whether to switch model or effort.**

That is the pre-flight check, not a failure. The prompt appears whenever your effort level is below `high` or your model is not Sonnet or Opus. "Continue anyway" runs as you are; "Cancel — I'll switch first" prints the switching commands and stops.

**It is asking me about the feature instead of building it.**

That is the planning step. With no argument it asks what to build; `plan-task` then runs in blurb mode, which calls `understanding-feature-requests` to clarify the requirements and assigns a `FEATURE-<slug>` identifier.

**I chose "Stop here — I'll review the plan first". How do I resume?**

Run `/groundwork:implement-task <plan_file_path>` with the path it printed. The work is known by a `FEATURE-<slug>` identifier, not a task number, so the resume takes the plan file.

**Will it merge without asking me?**

No. Step 5 always asks "Would you like me to merge this into [base-branch] now?" and waits. If you decline, or the merge conflicts, the worktree is kept and you get its location and the commands to merge by hand. Only `--on-unrelated-failure ignore-and-merge` lets validation return `PASSED-WITH-WAIVERS`, and then the waived-gate lines are carried into that question, never presented as passed.

## It's working if

- `plan-task` was called with your description and no task ID, and returned `RESULT: PLANNED | plan_file_path=<path> | identifier=<id> | branch_prefix=<prefix>`.
- You were asked "[identifier] — plan ready. Proceed to implementation?" before any implementation.
- Implementation returned `RESULT: IMPLEMENTED | worktree_path=<path> | branch=<branch> | base_branch=<bb>`, on a branch named `task/FEATURE-<slug>` in a single-project repo.
- You were offered the choice to stop and clear context before validation.
- The merge question was asked from the project root, and any uncommitted validation fixes were committed on the feature branch before merging.
- The report ends with `## Feature Complete: [identifier]`, with a `**Validation:**` line and a `**Worktree status:**` line, followed by the final line `RESULT: SUCCESS | [one-line summary]`.

**It is not working if:** implementation started before you answered the plan question, the worktree was removed after you declined the merge or after a conflict, or a waived gate was reported as passed.
