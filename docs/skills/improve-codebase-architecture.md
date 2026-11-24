# `improve-codebase-architecture`

> **Run it:** `/groundwork:improve-codebase-architecture [module or pain-point] [--project name]` · **Tier:** user-run · **Reads:** the code, the glossary, decision records, git history · **Writes:** a temp HTML report outside the repo; a decision record when a candidate is chosen

## What it does

A **survey, not a rescue**. It looks for *deepening opportunities* — clusters of shallow modules that could become one deep module: a lot of behavior behind a small interface, tested through that interface. It presents the candidates in chat and as a visual before/after report, then takes the one you pick through a design and a recorded decision. It does not implement.

## When to reach for it

- The codebase resists change more than the changes warrant.
- You have a spare moment for upkeep and want candidates ranked by evidence, not a hunch.
- **Not when:** you already know what to change. Go straight to `design-it-twice`, or create the tasks.

## Common questions

**Where does the report go, and is it kept?**

A temp path outside the repository and every worktree, named so two surveys cannot overwrite each other. The path is printed; open it in a browser. Nothing lands in the repo — the durable record is the decision record.

**Will it refactor my code?**

No. It surveys, designs with you, records the decision, and hands implementation to `create-tasks` or `plan-task`, with the new interface as the task's test seam.

**A candidate contradicts an earlier decision.**

It is shown with a callout naming the decision record and the reason it may be worth reopening. It never re-litigates silently.

**I rejected a candidate. Will it come back next time?**

If your reason would stop a future survey from suggesting it again, it offers to record that reason as a decision. Ephemeral reasons ("not now") are not recorded.

## It's working if

- The scope is stated: your direction, or the change hot spots with their commit counts.
- Each candidate names its files, one sentence of problem, one of solution, wins in deep-module terms, and a strength (`Strong`, `Worth exploring`, `Speculative`).
- The report shows a before/after diagram per candidate and a top recommendation.
- "Nothing worth exploring" is said plainly when it is true.
- The candidate you chose ends in a decision record and a hand-off — never in code edits inside the skill.

**It is not working if:** it scanned everything and prioritized nothing, or the candidate list is already a design.
