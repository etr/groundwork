# `staged-rollout`

> **Run it:** `/groundwork:staged-rollout` · **Tier:** user-run or model-invoked — typed by you, or dispatched by `ship` as its second step · **Reads:** the change, its RED metrics and alerts · **Writes:** `specs/rollouts/<feature-slug>-prelaunch.md`, `specs/rollouts/<feature-slug>-rollback.md`, the feature flag; after a Go, the traffic stages

## What it does

Takes a change to all users gradually, behind a flag that can be flipped back, with a monitoring window between stages. Before any launch it produces four things: a pre-launch checklist, the feature-flag gating, the staged ramp, and a written rollback plan. Writing the plan and executing it are separate: when `ship` dispatches it, it stops at the plan; run on its own, it asks the go/no-go question itself.

## When to reach for it

- Any user-facing or externally-observable change: a new endpoint, a UI, a behavior change, a schema migration.
- A risky internal change where a bad deploy would degrade many users at once.
- Skip it for trivially reversible, low-blast-radius changes such as a copy fix or an internal doc. When unsure, stage it — the cost is one flag.
- **Not when:** the change is not observable yet. `instrument-observability` comes first; the monitoring window watches the signals it adds.

## Common questions

**It wrote the plan and then asked me a question. Where is the rollout?**

The gate comes before the first stage. Under `ship`, `ship` asks Go or No-Go; run on its own, it asks the same question with `AskUserQuestion` before any traffic shifts. Only a Go begins the canary stage, and until then the flag stays at its default of off.

**Where do the plan and the checklist go?**

`specs/rollouts/<feature-slug>-rollback.md` and `specs/rollouts/<feature-slug>-prelaunch.md`, in the project's specs directory. The feature slug is the kebab-case name of the change, and `specs/` is project-scoped, so same-named changes in two monorepo projects cannot overwrite each other.

**Is 1% / 10% / 50% / 100% the required ramp, and how long is each window?**

The skill presents that as a typical ramp. What it requires is stages — never one jump — with a monitoring window between them long enough to span real traffic; a clean dashboard watched for thirty seconds does not count.

**It rolled back instead of waiting for the metrics to settle.**

That is the rule. If a symptom breaches during a monitoring window, it stops and rolls back rather than pushing forward and hoping.

## It's working if

- The pre-launch checklist is complete, and the feature flag exists and defaults to off.
- The flag is flippable at runtime, without a redeploy.
- A staged or canary ramp is defined, with a monitoring window between stages.
- `specs/rollouts/<feature-slug>-rollback.md` names the trigger conditions, the exact rollback action, who can execute it, and the expected recovery time.
- The plan was written before launch, not after the first stage.
- No stage was advanced before the gate said go: the flag was still at its default when the question was asked.

**It is not working if:** the change went straight to 100% with no canary stage, the flag was already on when the Go / No-Go question was asked, or "revert the commit" is the whole rollback plan.
