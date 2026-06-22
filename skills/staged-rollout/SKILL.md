---
name: staged-rollout
description: Roll out a change in stages behind a feature flag with a monitoring window and a written rollback plan - use before shipping anything user-facing, instead of flipping it on for everyone at once
---

# Staged Rollout

## Overview

A change reaches all users gradually, behind a switch you can flip back, while someone watches the signals. **Big-bang releases convert a small bug into a full outage.** A staged rollout converts the same bug into a contained blip caught at 1% traffic.

**Core principle:** Every outward-facing change ships behind a flag, advances in stages with a monitoring window between them, and has a rollback plan written *before* launch — not improvised during the incident.

This depends on the change being observable first: see [[instrument-observability]] for the signals the monitoring window watches.

## When to Use

- Any user-facing or externally-observable change (new endpoint, UI, behavior change, schema migration)
- Risky internal changes where a bad deploy degrades many users at once

Skip only for trivially reversible, low-blast-radius changes (a copy fix, an internal doc). When unsure, stage it — the cost is one flag.

## Process

1. **Pre-launch checklist.** Confirm before any traffic shift:
   - Validation and review already passed (see [[validate]] / [[review-pr]])
   - Instrumentation is live and the dashboards read real data
   - The feature flag exists and defaults to **off**
   - The rollback plan is written (step 4)
2. **Feature-flag gating.** Put the new behavior behind a flag, default off. The flag must be flippable at runtime without a redeploy — that is what makes rollback fast.
3. **Staged / canary rollout.** Advance through stages, not in one jump. A typical ramp:

   | Stage | Audience | Hold for |
   |-------|----------|----------|
   | Canary | 1% (or internal/dogfood) | a monitoring window |
   | Early | 10% | a monitoring window |
   | Majority | 50% | a monitoring window |
   | Full | 100% | — |

   **Monitoring window:** between each stage, watch the RED metrics and alerts long enough to span real traffic before promoting. Do not promote on a clean dashboard you've watched for thirty seconds. If a symptom breaches, **stop and roll back** — do not push forward hoping it settles.
4. **Written rollback plan.** Before launch, document: the exact trigger conditions (which metric/alert at which threshold), the precise rollback action (flip flag `X` to off; revert migration `Y`), who can execute it, and the expected recovery time. A rollback that requires a redeploy is too slow — prefer the flag.

## Rationalizations

| Excuse | Reality |
|--------|---------|
| "It's a small change, ship to everyone" | Small changes cause large outages. The flag costs minutes; the outage costs hours. |
| "I'll write the rollback plan if something breaks" | Mid-incident is the worst time to design recovery. Write it cold, before launch. |
| "Dashboard looked clean, I promoted right away" | A clean dashboard watched for seconds proves nothing. Hold the window across real traffic. |
| "Rollback is just redeploy the old version" | A redeploy is minutes of continued damage. A flag flip is seconds. Gate behind a flag. |
| "Canary at 1% will take forever" | 1% surfaces the catastrophic bugs cheaply. That's the point. |

## Red Flags

- Going straight to 100% with no canary stage
- A flag that needs a redeploy to toggle
- Promoting between stages without watching the metrics in between
- No documented trigger condition or named rollback action before launch
- "We'll roll it back by reverting the commit" as the entire plan

## Verification

- [ ] Pre-launch checklist complete; flag exists and defaults to off
- [ ] The change is gated behind a runtime-flippable feature flag
- [ ] A staged/canary ramp is defined with a monitoring window between stages
- [ ] A written rollback plan exists naming trigger conditions, the exact rollback action, the owner, and expected recovery time
- [ ] The plan was written before launch, not after the first stage
