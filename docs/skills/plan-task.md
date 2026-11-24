# `plan-task`

> **Run it:** `/groundwork:plan-task [task number or description] [--project name]` · **Tier:** user-run or model-invoked · **Reads:** the task, the specs · **Writes:** `.groundwork-plans/<identifier>-plan.md` (gitignored)

## What it does

Produces a validated implementation plan and saves it to disk, without implementing anything. In **task mode** it plans an existing task; in **blurb mode** a free-text feature, clarifying the requirements first. A Plan agent does the planning in its own context; the plan file is the hand-off the implementer works from.

## When to reach for it

- You want to review the approach before any code is written.
- A batch flow needs a plan for each task.
- **Not when:** you want implementation in the same step. `work-on` chains planning, implementation, validation, and merge for you.

## Common questions

**Will it ask me questions?**

In task mode, never: the task and the specs are the context. In blurb mode it interviews you first, because nothing is written down yet.

**Where is the plan?**

`.groundwork-plans/TASK-NNN-plan.md` (or `FEATURE-<slug>-plan.md`). Running planning again for the same identifier overwrites it.

**The plan does not mention test seams.**

A plan targets the task's recorded seams, or names the ones it chose. If it does neither, the implementer falls back to the highest existing seam — it will not stop to ask.

## It's working if

- The plan file exists at the expected path with its context header.
- The plan says the work happens in a worktree, resolved through the shared helper rather than a hand-typed path.
- The plan includes the test-first cycle and names the test seams.
- The output is the single `RESULT: PLANNED` line, and the plan is not re-quoted afterwards.

**It is not working if:** the plan was summarized back into the conversation, or implementation started inside the planning step.
