# groundwork

## 3.12.0

### Minor Changes

- 69a0e1d: Two new skills, a docs page for every skill, and a round of fixes from an audit of every skill, agent, and reference file. Several patterns are adapted from [mattpocock/skills](https://github.com/mattpocock/skills); see *Attribution* in the README.
  
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
  - **Pre-flight model recommendation** (22 skills): asked once per conversation instead of once per skill in a chain, never asked in a non-interactive run, with one set of option labels.
  - **Project-context check** (Step 0, 21 skills): an explicit `--project` now skips the working-directory mismatch check in every skill, and `--noninteractive` never stops on it.
  - **Batch phases** (`just-do-it`): the phases now run A to D (finalize is Phase D), and the plan step carries the same five constraints `plan-task` uses.
  - **Alignment check** (`check-specs-alignment`): an optional argument narrows the check to one requirement, decision, task, feature, or path; the "Partially Implemented" status has one spelling.
  - **Debug levels** (`debug`, `swarm-debug`): "Corroborated" is the minimum needed before a fix and "Verified" is what the fix earns; the escalation report and the no-root-cause outcome live in one shared reference.
  - **Design system** (`ux-design`): the final confirmation is asked before the document is written, all six template sections are filled, and the layout decision guide no longer carries implementation code (that moved to a companion file; both open with their selection aids).
  - **Validation reviewers**: each review can record the invariants it cleared (`cleared_invariants`), so a repair that disturbs one re-runs exactly that reviewer; scores follow one rubric.
  - **Unworked-findings ledger**: a finding with no line or file no longer renders as `:null`.
  - **Shipping** (`ship`): the go/no-go question reports what the two ship disciplines actually returned — an incomplete verification appears as a gap or an open item, never as done.
  - **Help** (`groundwork-help`): lists the agents it scans, by role.
  - **Sync skills** (`source-*-from-code`): the `[files...]` argument hint is gone — these skills work from the session and never read it.
  
  **Repository**
  
  - The ZCode marketplace README carries the project's attribution and third-party license notices.
  - Adds `CONTRIBUTING.md` and changesets.
  - Blocks that many skills carried as hand-maintained copies (the Pre-flight recommendation, the project-context check, the merge snippet, the task format, the spec-detection rule, the auto-split thresholds, the shared parts of two dispatch prompts) are now rendered from one source, `lib/sync-shared-blocks.js`, and a parity test fails on any hand-edited copy. Skill and agent text shrinks accordingly (about 3,000 lines removed across skills, agents, and references).
  - The README credits the summary of *Clean Code* that the clean-code principles reference follows.
