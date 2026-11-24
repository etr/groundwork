# `create-tasks`

> **Run it:** `/groundwork:create-tasks [filter]` · **Tier:** user-run · **Reads:** the product specs and the architecture · **Writes:** the task catalog under `specs/tasks/` (or `specs/tasks.md`)

## What it does

Turns the PRD and the architecture into an executable task catalog: milestones, tasks with action items and acceptance criteria, a dependency graph, and a status table the rest of the lifecycle parses. It researches implementation patterns first and validates the list against the PRD and the architecture before finishing.

## When to reach for it

- The specs exist and you are ready to plan implementation.
- **Not when:** the architecture still has open decisions the tasks would depend on. Settle those first.

## Common questions

**What are "Test Seams" on a task?**

Where this task's tests will live: the public boundary they are written against, with what testing there catches and what it misses. This is the one moment in the lifecycle when you are in the room and the decision can be made, so everything after — planning, implementation, unattended batches — follows it without asking.

**I do not know what the seams should be.**

`**Test Seams:** None recorded` is valid. The planner then picks the highest existing seam that reaches the behavior and writes the choice down.

**The tasks use words our project does not use.**

Tasks should be written in the domain glossary's terms. A concept missing from the glossary is one to raise for `domain-modeling`, not a synonym to invent.

## It's working if

- Every task carries the required fields: ID, milestone, component, estimate, goal, action items, dependencies, acceptance criteria, status.
- Acceptance criteria are checkable — "typecheck passes", not "works correctly".
- Tasks are vertical slices, not one layer each.
- Each milestone is presented for your approval before the next.
- The dependency graph agrees with each task's "Blocked by" line.
- The validation loop ran, and its findings were resolved.

**It is not working if:** a later skill cannot parse a task, or a seam entry reads "catches: bugs; misses: edge cases".
