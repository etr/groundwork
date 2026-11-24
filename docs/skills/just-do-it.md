# `just-do-it`

> **Run it:** `/groundwork:just-do-it [--project name] [--take-over] [--on-unrelated-failure mode]` · **Tier:** user-run · **Reads:** the task catalog, the specs · **Writes:** plans, task worktrees, validation results, merges

## What it does

Runs every remaining task in dependency order, in the current session: plan, implement in an isolated worktree, validate, finalize, and on to the next. Each task starts with a resume gate, so an interrupted batch picks up at the right phase instead of redoing finished work.

## When to reach for it

- You want a batch executed and can watch one session do it.
- **Not when:** there are many tasks and context accumulation is a concern — use `just-do-it-swarming`; or you want it detached from the session — use the external runner.

## Common questions

**It stopped and mentioned a live owner.**

Another session may be working on that task. A provably-live process is never overridden; an unverifiable one is what `--take-over` is for.

**It stopped on a validation failure unrelated to this project.**

That is the default. `--on-unrelated-failure` chooses whether to stop and ask, expand the fix, or merge with the unrelated gate waived and receipted.

**A previous run was killed. What happens now?**

The resume gate reads the checkpoints: a finished plan is reused, a validated tree is not re-validated, and a merged task is cleaned up rather than redone.

## It's working if

- Tasks run in dependency order, and each begins with the resume gate.
- Each plan is written to disk before implementation starts.
- Task status changes happen inside the task worktree.
- The run ends with a completion report listing every task and its outcome.

**It is not working if:** a finished task was re-planned or re-implemented after a restart.
