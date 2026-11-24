# Skill docs

A page per skill, written for the person deciding whether to run it. Every page has the same four sections: **What it does**, **When to reach for it**, **Common questions**, and **It's working if** — the last one being the observable signals that the skill did its job.

Each page's header states how the skill is run: **user-run** skills are typed by you and the model can only recommend them; **user-run or model-invoked** skills can be typed or started by the model; **library** skills are never typed and are used by other skills or the model. The full skill list, with one-line summaries, is in the [README](../../README.md#skills).

## Plan

| Page | Run | What it is for |
|------|-----|----------------|
| [`design-product`](design-product.md) | `/groundwork:design-product` | A feature request into EARS requirements in the PRD |
| [`ux-design`](ux-design.md) | `/groundwork:ux-design` | A design system — foundations, brand identity, UX patterns |
| [`design-architecture`](design-architecture.md) | `/groundwork:design-architecture` | Requirements into architecture, one recorded decision at a time |
| [`swarm-design-architecture`](swarm-design-architecture.md) | `/groundwork:swarm-design-architecture` | Competing technology options argued by parallel advocates |
| [`domain-modeling`](domain-modeling.md) | `/groundwork:domain-modeling` | The project's shared vocabulary, written down as it resolves |
| [`design-it-twice`](design-it-twice.md) | `/groundwork:design-it-twice` | Two or three genuinely different interface designs, then one recommendation |
| [`create-tasks`](create-tasks.md) | `/groundwork:create-tasks` | The PRD and architecture into an executable task catalog |
| [`plan-task`](plan-task.md) | `/groundwork:plan-task` | A validated implementation plan, saved to disk |
| [`understanding-feature-requests`](understanding-feature-requests.md) | *(library)* | The interview that settles a feature request before design |
| [`split-specs`](split-specs.md) | `/groundwork:split-specs` | A single-file PRD into a directory |
| [`split-architecture`](split-architecture.md) | `/groundwork:split-architecture` | A single-file architecture document into a directory |

## Build

| Page | Run | What it is for |
|------|-----|----------------|
| [`work-on`](work-on.md) | `/groundwork:work-on` | One task from plan to merged branch |
| [`work-on-next-task`](work-on-next-task.md) | `/groundwork:work-on-next-task` | The next unblocked task, handed to `work-on` |
| [`implement-task`](implement-task.md) | `/groundwork:implement-task` | A planned task implemented in an isolated worktree |
| [`just-do-it`](just-do-it.md) | `/groundwork:just-do-it` | Every remaining task, in one session, in dependency order |
| [`just-do-it-swarming`](just-do-it-swarming.md) | `/groundwork:just-do-it-swarming` | Every remaining task, one teammate session each |
| [`build-unplanned`](build-unplanned.md) | `/groundwork:build-unplanned` | A feature with no task behind it, from description to merge |
| [`vertical-slice`](vertical-slice.md) | `/groundwork:vertical-slice` | A multi-layer feature as thin end-to-end slices behind a flag |
| [`test-driven-development`](test-driven-development.md) | *(library)* | Red, green, refactor — and where the tests live |
| [`use-git-worktree`](use-git-worktree.md) | *(library)* | An isolated worktree with a tested baseline, and its merge and cleanup |

## Verify

| Page | Run | What it is for |
|------|-----|----------------|
| [`validate`](validate.md) | `/groundwork:validate` | Project gates, then a multi-agent audit that repairs what it finds |
| [`finalize-task`](finalize-task.md) | `/groundwork:finalize-task` | Merge a validated task, or open its pull request |
| [`task-validation-loop`](task-validation-loop.md) | *(library)* | A new task list checked against the PRD and architecture |
| [`review-pr`](review-pr.md) | `/groundwork:review-pr` | A multi-agent review of a pull request |
| [`debug`](debug.md) | `/groundwork:debug` | Root cause first, then the fix |
| [`swarm-debug`](swarm-debug.md) | `/groundwork:swarm-debug` | Several hypotheses investigated in parallel |
| [`check-specs-alignment`](check-specs-alignment.md) | `/groundwork:check-specs-alignment` | The code against the PRD, the architecture, and the task statuses |

## Ship

| Page | Run | What it is for |
|------|-----|----------------|
| [`ship`](ship.md) | `/groundwork:ship` | Observability and a rollout plan, behind a go/no-go gate |
| [`instrument-observability`](instrument-observability.md) | `/groundwork:instrument-observability` | Logs, metrics, traces, and symptom alerts for a change |
| [`staged-rollout`](staged-rollout.md) | `/groundwork:staged-rollout` | A change released in stages behind a flag, with a rollback plan |

## Sync

| Page | Run | What it is for |
|------|-----|----------------|
| [`source-product-specs-from-code`](source-product-specs-from-code.md) | `/groundwork:source-product-specs-from-code` | The session's product decisions carried into the PRD |
| [`source-architecture-from-code`](source-architecture-from-code.md) | `/groundwork:source-architecture-from-code` | The session's technical decisions carried into the architecture |
| [`source-ux-design-from-code`](source-ux-design-from-code.md) | `/groundwork:source-ux-design-from-code` | The session's design decisions carried into the design system |

## Upkeep

| Page | Run | What it is for |
|------|-----|----------------|
| [`improve-codebase-architecture`](improve-codebase-architecture.md) | `/groundwork:improve-codebase-architecture` | A survey of deepening opportunities, with a before/after report |
| [`retro`](retro.md) | `/groundwork:retro` | Improve the agent's environment after a session |
| [`doubt-driven-development`](doubt-driven-development.md) | `/groundwork:doubt-driven-development` | A high-stakes approach refuted before it is built |
| [`handoff`](handoff.md) | `/groundwork:handoff` | A compact document that carries a session to the next |

## Project and plugin

| Page | Run | What it is for |
|------|-----|----------------|
| [`using-groundwork`](using-groundwork.md) | *(library)* | The lifecycle map from the work at hand to the skill for it |
| [`setup-repo`](setup-repo.md) | `/groundwork:setup-repo` | Configure the repository as one project or a monorepo |
| [`select-project`](select-project.md) | `/groundwork:select-project` | Switch the active project in a monorepo |
| [`skills`](skills.md) | `/groundwork:skills` | Every skill, including the ones you cannot type |
| [`groundwork-help`](groundwork-help.md) | `/groundwork:groundwork-help` | An overview of what you can run, with usage examples |
| [`groundwork-check`](groundwork-check.md) | `/groundwork:groundwork-check` | Validate the plugin installation |
| [`statusline`](statusline.md) | `/groundwork:statusline` | Install or remove the optional statusline |
