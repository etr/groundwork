# `implement-task`

> **Run it:** `/groundwork:implement-task [task number or plan path] [--project name]` · **Tier:** user-run or model-invoked · **Reads:** the plan file, the task section · **Writes:** the task worktree (through the executor)

## What it does

Dispatches a planned task to the executor agent, which creates or resumes an isolated worktree and implements the plan test-first. The orchestrator passes paths, not content: the executor reads the plan and the task in its own context and returns a single structured result.

## When to reach for it

- A plan exists and you reviewed it.
- A batch flow reached the implementation phase of a task.
- **Not when:** there is no plan yet. Run `plan-task` first.

## Common questions

**It says there is no plan for my task.**

The plan is expected at `.groundwork-plans/TASK-NNN-plan.md`. Plan first, or pass the plan path explicitly.

**Will the executor come back with questions?**

No. It gets everything from the plan file and the task section — goal, action items, acceptance criteria, and test seams — and is told not to ask.

**Does it validate or merge?**

No. The caller handles both.

## It's working if

- The executor starts from the plan file and the task section without asking for details.
- The task moves to `In Progress` — recorded inside the worktree when the runner drives, so the base checkout stays clean.
- The final line is `RESULT: IMPLEMENTED` with the worktree path, the branch, and the base branch — or a one-line `RESULT: FAILURE`.
- No validation or merge happened inside the step.

**It is not working if:** the executor asked what to build, or — under the runner — the base checkout was dirtied by bookkeeping.
