# `just-do-it-swarming`

> **Run it:** `/groundwork:just-do-it-swarming [--project name] [--parallel] [--take-over] [--on-unrelated-failure mode]` · **Tier:** user-run · **Reads:** the task catalog, the specs, the `work-on` workflow · **Writes:** task worktrees, validation results, merges

## What it does

Runs every remaining task with **agent teams**: each task gets its own teammate session with its own context window, so one long task cannot pollute the next. The orchestrator embeds the full `work-on` workflow in each teammate's prompt and checks the result, instead of doing the work itself.

## When to reach for it

- Many tasks, or long ones, where context accumulation in a single session is a concern.
- **Not when:** agent teams are not available in your harness, or the batch is small. Use `just-do-it`.

## Common questions

**It says agent teams are not enabled.**

Swarming needs them (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` in your settings). It offers `just-do-it` as the inline alternative.

**Do tasks run at the same time?**

In sequence by default. With `--parallel`, tasks that do not depend on each other run in separate teammates simultaneously.

**Will a teammate stop to ask something?**

No. Teammates run in batch mode and must quote the validate skill's terminal result in a `VALIDATION:` line; a completion message without it is sent back.

**What counts as proof that validation ran?**

The `validate` skill's own terminal line — `Validation PASSED (…)`, or `Validation PASSED-WITH-WAIVERS (…)` with one `WAIVED` line per waived gate — quoted verbatim.

**A previous run was killed. What happens now?**

Each task starts with the same resume gate as `just-do-it`, so finished phases are not redone.

## It's working if

- Each task runs in its own teammate session and its own worktree.
- Each teammate's completion message quotes the validate skill's terminal line under `VALIDATION:`, with one `WAIVED` line per waived gate when validation passed with waivers.
- The run ends with a completion report listing every task and its outcome.

**It is not working if:** a teammate asked a question, or a task reports complete without validation evidence.
