# `test-driven-development`

> **Tier:** library — followed by the executors that implement tasks, and by any agent writing a feature or a bugfix · **Reads:** the task's recorded test seams, the project glossary · **Standard:** `references/checklists/testing.md`

## What it does

The red-green-refactor loop with an iron law: no production code without a failing test first. It also decides **where tests live** — at a *seam*, the public boundary a module is used and tested through — so that choice is made once, deliberately, instead of test by test.

## When to reach for it

- Any feature, bugfix, behavior change, or refactor.
- **Not when:** the code is throwaway, generated, or configuration — ask first.

## Common questions

**Where will the tests go?**

At the test seams the task records (see `create-tasks`). A task with no recorded seams gets the highest existing seam that reaches the behavior, and the choice is written down.

**Will the agent stop mid-task to ask me about seams?**

No. In a planned or unattended run, choosing is the agent's job. Seams are agreed while you are in the room, at task creation.

**What if a recorded seam turns out to be wrong?**

The same fallback applies: the highest existing seam that reaches the behavior, with the deviation noted. A recorded seam is where testing starts, not a dead end.

**Is refactoring part of the loop?**

Yes. After green, and only after green: remove duplication, improve names, keep the tests green, and run the linter on the changed files.

## It's working if

- Every test was seen failing before it was seen passing.
- Tests sit at the seam the task or plan named.
- Expected values are literals or worked examples, never recomputed the way the code computes them.
- Tests and implementation arrive one at a time, not all the tests followed by all the code.
- After green there is a refactor step, with tests still green.

**It is not working if:** a test passed the first time it ran, or a test restates the implementation's own arithmetic.
