# `work-on-next-task`

> **Run it:** `/groundwork:work-on-next-task [--take-over] [--on-unrelated-failure mode]` · **Tier:** user-run or model-invoked · **Reads:** only the task index — `specs/tasks/_index.md`, or `specs/tasks.md` — plus the resume state of each in-flight task and `.groundwork.yml` in a monorepo · **Writes:** nothing of its own; the task it picks is then planned, implemented, validated, and merged by `work-on`

## What it does

Finds the next task to work on and hands it to `work-on`, which runs the whole workflow for it. To choose, it reads only the status table in the task index. A task already in flight from a prior session comes first; otherwise it takes the unblocked `Not Started` tasks. When the choice is ambiguous it shows you the options and waits, and it does no planning or building itself.

## When to reach for it

- Tasks exist in the catalog and you want the next one run without naming a number.
- A previous run was cut off partway through a task: that task is the first candidate.
- **Not when:** you already know the task. Run `/groundwork:work-on N` for it.
- **Not when:** there is no task catalog yet. Run `/groundwork:create-tasks` first.

## Common questions

**The first thing it asked was whether to switch model or effort.**

That is the pre-flight check, not a failure. The prompt appears whenever your effort level is below `high` or your model is not Sonnet or Opus. "Continue anyway" runs as you are; "Cancel — I'll switch first" prints the switching commands and stops. The question is asked once per conversation — a skill invoked by another skill skips it once it has been shown — and a non-interactive run (a batch or the runner) skips it too.

**It asked me to choose instead of starting the lowest-numbered task.**

That happens when a completed task has a higher number than the lowest-numbered available task. The gap may be a deliberate skip, so it lists the candidates with that context and waits for your selection.

**It went back to an `In Progress` task instead of a `Not Started` one.**

In-flight tasks come first by design: for every `In Progress` row it runs `task-resume.js check`, and a row whose check reports a worktree, branch, or validation session is the top-priority candidate. The resume gate inside `work-on` then continues at the right phase. A row with no such artifacts is a stale marker: it offers to reset it to `Not Started`.

**Every remaining task is blocked.**

It lists the blocked tasks and asks whether to override and work on one anyway.

## It's working if

- Only the task index was read to choose: `specs/tasks/_index.md` first, `specs/tasks.md` as the fallback. Individual task files are read only when the index has no status table.
- Every `In Progress` row had a `task-resume.js check` run before a candidate was chosen.
- The chosen task is `Not Started`, and every task in its `Blocked by` column is `Complete`.
- If a complete task has a higher number than the candidate, the "Multiple tasks are available" question appeared and the run waited for your selection.
- It ended by calling `work-on` with the chosen ID — with `--take-over` or `--on-unrelated-failure` only if you passed them here — and did no planning or building itself.
- With nothing left to run, it printed the matching message, such as "All tasks complete!" or the list of blocked tasks.

**It is not working if:** it started planning or implementing the task itself instead of calling `work-on`, or it picked a task without asking while a higher-numbered task was already complete.
