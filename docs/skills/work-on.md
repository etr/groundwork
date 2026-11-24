# `work-on`

> **Run it:** `/groundwork:work-on [task-number] [--take-over] [--on-unrelated-failure stop-and-ask|expand-and-fix|ignore-and-merge]` · **Tier:** user-run or model-invoked · **Reads:** the task's resume state, `.groundwork.yml` in a monorepo (the task, the specs, and the plan are read by the skills it delegates to) · **Writes:** a plan file, the task worktree and its commits, validation fixes, the merge into the base branch, worktree and branch cleanup, resume checkpoints, the task's `Complete` status

## What it does

Runs one task from the catalog end to end by delegating to three skills: `plan-task`, `implement-task`, and `validate`. Implementation happens in an isolated worktree, test-first. It then commits any validation repairs, merges into the base branch from the project root, removes the worktree, and marks the task `Complete`. Before planning it runs a resume gate, so a task left half-done by an earlier session skips the phases already finished.

## When to reach for it

- One task should go from plan to merged branch in a single run.
- An earlier run on the task was interrupted: the resume gate decides where to continue.
- **Not when:** the work has no task in the catalog. An ad-hoc feature goes through `build-unplanned`.
- **Not when:** you want every remaining task run in a sequence. That is `just-do-it`.

## Common questions

**The first thing it asked was whether to switch model or effort.**

That is the pre-flight check, not a failure. The prompt appears whenever your effort level is below `high` or your model is not Sonnet or Opus. "Continue anyway" runs as you are; "Cancel — I'll switch first" prints the switching commands and stops. The question is asked once per conversation — a skill invoked by another skill skips it once it has been shown — and a non-interactive run (a batch or the runner) skips it too.

**Will it merge without asking me?**

Not in an interactive run. Step 5 asks "Would you like me to merge this into [base-branch] now?" and waits for your answer. It merges on its own only in batch mode (`GROUNDWORK_BATCH_MODE=true`) or when `GROUNDWORK_AUTO_MERGE` is `true`.

**What do `--take-over` and `--on-unrelated-failure` change?**

`--take-over` gets the resume gate past soft standdowns only: a provably-live worker (`heartbeat-worker-alive`) is a hard standdown, and the skill reports and stops. `--on-unrelated-failure` picks how validation treats gate failures confidently assessed unrelated to this task's project — `stop-and-ask` (the default), `expand-and-fix` (repair it through the validation fixer), or `ignore-and-merge` (record waiver receipts and proceed). Under `ignore-and-merge` validation can return `PASSED-WITH-WAIVERS`; the waived gates are listed in the merge question and in the final line, never as passed.

**I stopped before validation. How do I finish?**

That stop hands the rest of the workflow to you. The implementation is committed in the worktree: run `/clear`, `cd <worktree_path>`, then `/groundwork:validate`. After it passes, merge manually from the project root and mark the task `Complete` in the tasks file.

## It's working if

- The first command for the task is the resume gate, `task-resume.js check <TASK-NNN>`, returning one line of JSON.
- After planning (interactive runs), you are asked "[TASK-NNN] [Title] — plan ready. Proceed to implementation?" — the run does not end on a plan summary.
- Implementation returns `RESULT: IMPLEMENTED | worktree_path=<path> | branch=<branch> | base_branch=<bb>`.
- Before validation (interactive runs), you are offered the choice to stop and clear context.
- The merge is put to you as a question from the project root, unless batch mode is active or `GROUNDWORK_AUTO_MERGE` is `true`; uncommitted validation fixes are committed on the task branch first.
- The last line is exactly `Done: [TASK-NNN] merged → <base>. Validation passed in N iter(s).`, or the same line with `pending at <worktree_path>` when the merge did not happen. Batch mode ends with `RESULT: SUCCESS | [TASK-NNN] [Task Title] - [one-line summary of what was done]` instead.
- The task file reads `**Status:** Complete`, and its row in the status table says `Complete`.

**It is not working if:** the run ended on a plan summary, a merge went ahead unasked in an interactive run without `GROUNDWORK_AUTO_MERGE` set to `true`, the orchestrator edited files itself during validation, or the task was marked complete with a checklist box unchecked.
