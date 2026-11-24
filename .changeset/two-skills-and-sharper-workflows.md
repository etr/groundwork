---
"groundwork": minor
---

Two new skills, a docs page for every skill, and a round of fixes from an audit of every skill, agent, and reference file. Several patterns are adapted from [mattpocock/skills](https://github.com/mattpocock/skills); see *Attribution* in the README.

**New**

- **`retro`**: after a work session, suggests improvements to the agent's environment — automated checks, coding standards, steering files, tooling — most severe first. `ship` and `debug` recommend it when a session ends.
- **`improve-codebase-architecture`**: surveys the codebase for deepening opportunities (shallow module clusters that could become one deep module), presents them in chat and as a visual HTML report, takes the chosen one through design-it-twice, and records the decision.
- **A docs page for every skill** under `docs/skills/`: what it does, when to reach for it, common questions, and the signals that it worked.

**Changed**

- **Interviews** (`understanding-feature-requests`): questions come in rounds, each with a recommended answer; facts are looked up instead of asked; the interview ends when nothing is left to ask.
- **Test seams on tasks** (`create-tasks`): a task can record where its tests live, decided while you are in the room, so that executors never have to ask.
- **Debugging** (`debug`, `swarm-debug`): several ranked hypotheses before testing any, secrets redacted from everything shown or stored, and temporary instrumentation tagged for a one-grep cleanup.
- **Validation** (`validate`): the project's own gates run once before the reviewers, a gate failure caused by the task goes to the fixer, and the fixer writes a result file on every harness.
- **Shipping** (`ship`, `staged-rollout`): the go/no-go question always comes before the first rollout stage, and the rollback plan must exist as a file before the question is asked.
- **PR review** (`review-pr`): skips findings the project's linter, typechecker, or CI already enforce; checks spec alignment when product specs exist; `--no-interactive` now skips every prompt.
- **Task alignment checkers**: any major finding now returns `request-changes`, so the validation loop fixes it instead of passing it.
- **Merging** (`work-on`, `build-unplanned`): validation fixes are committed on the task branch before the merge.
- **Batch runs** (`just-do-it`, `just-do-it-swarming`): swarming checks validation by quoting `validate`'s own result line; the resume gate re-checks after each phase.
- **User-run skills**: `design-product`, `ux-design`, and `create-tasks` are started by you; the model recommends them and stops.
- **Specs**: the domain glossary gains `Avoid` lists and is an explicit part of the specs set; the architecture template records open decisions and fog instead of resolving them silently.
- **Pull-request bodies** (`finalize-task`): a visual summary, before/after evidence, and a merge-danger call, for repositories that integrate through pull requests.

**Repository**

- The ZCode marketplace README carries the project's attribution and third-party license notices.
- Adds `CONTRIBUTING.md` and changesets.
