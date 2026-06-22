---
name: ship
description: Ship a validated change to production - sequences observability and a staged rollout, then gates the outward-facing deploy behind a final go/no-go. Usage /groundwork:ship
allowed-tools: ["Bash", "Read", "Skill", "AskUserQuestion"]
requires: instrument-observability, staged-rollout
disable-model-invocation: true
---

# Ship

Orchestrator for the **ship phase** — the last leg of the lifecycle, after the change is built, validated, and reviewed. It sequences the ship disciplines and stops at a human go/no-go before anything reaches users.

<!--
Design note: this is a USER-ONLY LEAF (disable-model-invocation: true). It must be
started deliberately by the user — the router and other skills cannot auto-fire it.
That flag only blocks OTHER skills from calling THIS skill; it does NOT stop this skill
from calling dual skills. So Step 2 dispatches instrument-observability / staged-rollout
(both dual) via the Skill tool without issue.
-->

## Step 1: Confirm Validation and Review Passed

Shipping presupposes a clean change. Confirm both gates already cleared:

- **Validation** passed — see [[validate]].
- **Review** passed — see [[review-pr]].

Check for evidence (a green validation run, an approved PR). If you cannot confirm either, **stop** and ask the user to run [[validate]] / [[review-pr]] first. Do not re-run them here; this skill assumes they are done.

## Step 2: Sequence the Ship Disciplines

Dispatch the two disciplines **in order** via the `Skill` tool. Each is dual-tier, so this leaf may call them. Do not parallelize — the rollout depends on the instrumentation.

(Architecture decisions are recorded earlier, during `design-architecture` — there is no decision-capture step here.)

1. `Skill(skill="groundwork:instrument-observability")` — make the change observable (structured logs, RED metrics, trace spans, symptom alerts). Run before rollout: the rollout's monitoring window watches these signals.
2. `Skill(skill="groundwork:staged-rollout")` — produce the pre-launch checklist, feature-flag gating, the staged/canary ramp, and the written rollback plan.

Carry each skill's verification result forward. If any reports its Verification incomplete, surface that to the user at Step 3 rather than silently proceeding.

## Step 3: Final Go / No-Go Gate

Before **any** outward-facing deploy step (flipping the canary flag on, promoting a stage, releasing), stop and ask the user with `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Validation and review passed. Observability instrumented, staged rollout plan and rollback ready. Proceed to begin the rollout?",
    "header": "Go / No-Go",
    "options": [
      { "label": "Go", "description": "Begin the staged rollout starting at the canary stage" },
      { "label": "No-Go", "description": "Stop — something needs attention first" }
    ],
    "multiSelect": false
  }]
}
```

- **No-Go** → stop. Report what's outstanding; do not deploy.
- **Go** → proceed to begin the staged rollout (the canary stage) per the plan from Step 2. Never skip this gate, even if every prior step is green — a human owns the decision to expose the change to users.

## Verification

- [ ] Validation and review were confirmed passed before any ship step ran
- [ ] `instrument-observability` then `staged-rollout` were dispatched in that order
- [ ] Each dispatched skill's Verification result was carried forward and any gaps surfaced
- [ ] The go/no-go `AskUserQuestion` gate ran before any outward-facing deploy step
- [ ] On No-Go, nothing was deployed; on Go, the rollout began at the canary stage
