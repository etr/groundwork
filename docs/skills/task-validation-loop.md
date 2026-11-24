# `task-validation-loop`

> **Tier:** library — run for you by `create-tasks` after you approve the task list and before the final version is written · **Reads:** the task list, the PRD, the architecture, the design system if present · **Writes:** the task list, when a reviewer requests changes: new tasks, changed `Component` fields, added acceptance criteria

## What it does

Checks a finished task list from three sides before implementation begins. Up to three agents run in parallel — `prd-task-alignment-checker`, `architecture-task-alignment-checker`, `design-task-alignment-checker` — and each returns a score and a verdict. On any `request-changes` the loop edits the task list to apply each critical and major recommendation, then re-runs only the agents that asked for changes. It ends when every agent approves.

## When to reach for it

- You do not start it. `create-tasks` calls it after you approve the task list and waits for the loop to pass.
- A "Task List Validation Report" or a "Validation Iteration" log appears in the middle of `create-tasks`: that is this loop.
- **Not when:** implementation is under way and you want the code checked against the specs. That is `check-specs-alignment`.

## Common questions

**It changed a task I had already approved.**

That is the fix step. On a `request-changes` verdict it applies every critical and major recommendation by editing the task file: `requirement-not-tasked` adds a task, `component-mismatch` updates the task's `Component` field, `accessibility-missing` adds acceptance criteria. Minor findings do not block; they come back as optional suggestions.

**It stopped with "Stuck - Need User Input".**

The same finding came back three times, or it reached a decision it will not make alone: conflicting requirements between the PRD and the architecture, missing information to create a required task, or a scope decision such as adding a requirement to the PRD instead of removing a task. It asks with `AskUserQuestion`, applies your answer, and continues the loop.

**Why did only two agents run?**

`prd-task-alignment-checker` and `architecture-task-alignment-checker` always run. `design-task-alignment-checker` is skipped — recorded with verdict `skipped` — when there is no design system and no UI/frontend tasks. With UI/frontend tasks but no design system it still runs, and the summary notes "Design system not found".

**It asked whether to switch model and effort before starting.**

That is the pre-flight model recommendation, skipped only when effort is `high`, `xhigh`, or `max` and you are on Sonnet or Opus. "Cancel — I'll switch first" prints the switching commands and stops the skill.

## It's working if

- A "Task List Validation Report" table appears with one row per agent — PRD Alignment, Architecture Alignment, Design Alignment — each with a score, a verdict, and critical/major/minor counts, over an `Overall:` PASS / NEEDS FIXES line.
- Each fix round is logged as "Validation Iteration [N]" with the agents' verdicts and a "Fixing [X] issues..." line.
- Each fix notes which finding it addresses.
- After a fix, only agents that returned `request-changes` are re-run; the others keep their earlier `approve` verdict and score.
- It ends with "Task List Validation PASSED", an "Issues fixed" list, and a "Coverage Summary".
- Minor findings are listed under "Minor suggestions (optional)".

**It is not working if:** it returns while an agent still says `request-changes`, or the same finding appears a third time without the "Stuck - Need User Input" question.
