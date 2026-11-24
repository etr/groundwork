# `ship`

> **Run it:** `/groundwork:ship` · **Tier:** user-run · **Reads:** evidence of a green validation run and an approved PR · **Writes:** the change's instrumentation and the rollout plan, through the two skills it dispatches; after a Go, the canary stage

## What it does

The orchestrator for the ship phase, after the change is built, validated, and reviewed. It confirms the two earlier gates passed, dispatches `instrument-observability` and then `staged-rollout` — which stops at the plan — and asks you Go or No-Go before anything reaches users. On Go it begins the rollout at the canary stage; on No-Go it stops and reports what is outstanding.

## When to reach for it

- A change is built, validated, reviewed, and ready to go in front of users.
- You want the observability work and the rollout plan sequenced for you, in that order, with a human gate before anything is exposed to users.
- **Not when:** validation or review has not passed. It does not re-run them; it stops and asks you to run `validate` or `review-pr` first.

## Common questions

**It stopped straight away and asked me to run `validate` or `review-pr`.**

That is the first step, not a failure. It looks for evidence — a green validation run, an approved PR — and does not re-run either gate itself.

**It produced a plan and then asked a question instead of rolling out.**

By design. Inside `ship`, `staged-rollout` stops at the plan: nothing is advanced and no traffic shifts until the gate says Go. The gate is never skipped, even when every prior step is green.

**It would not go while the rollback plan existed only in the conversation.**

The question is asked only once the plan is a file. It confirms `specs/rollouts/<feature-slug>-rollback.md` — in the project's specs directory — exists. If it does not, it does not ask: it reports the missing plan and stops, and the gate stays No-Go until the file exists.

**One of the two skills reported its verification incomplete, and it carried on to the question.**

It carries each verification result forward and raises any incomplete one at the gate, instead of stopping there or proceeding silently.

## It's working if

- Validation and review were confirmed passed before any ship step ran.
- `instrument-observability` ran first, then `staged-rollout` — never in parallel.
- `specs/rollouts/<feature-slug>-rollback.md` exists.
- The Go / No-Go question came before any outward-facing deploy step: flipping the canary flag on, promoting a stage, releasing.
- On No-Go nothing was deployed; on Go the rollout began at the canary stage.
- Once the rollout was underway, it recommended `/groundwork:retro`.

**It is not working if:** any traffic moved before the Go / No-Go question was asked, or `ship` re-ran validation or review itself.
