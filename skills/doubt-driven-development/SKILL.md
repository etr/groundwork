---
name: doubt-driven-development
description: Use when building a high-stakes or hard-to-reverse change - schema/data migrations, auth, payments, public API surface, destructive operations, or concurrency - to adversarially refute the chosen approach BEFORE committing to it
---

# Doubt-Driven Development

## Overview

For most code, optimism is fine: try it, run the test, fix what breaks. For changes you cannot cheaply undo, optimism is a liability. Doubt-driven development inverts the default — you actively try to *refute* your chosen approach before you build it, and you require concrete evidence to clear each doubt.

**Core principle:** default to refuted when uncertain. A doubt you cannot disprove with evidence is a reason to choose a safer path, not a reason to proceed and hope.

This is review applied *during* the build, by you, before a single line is committed. It is distinct from [[validate]], the post-hoc multi-agent loop that runs after implementation — that catches what got built wrong; this catches what should never have been built that way.

## When to Use

Apply when the change is high-stakes or hard to reverse:

- **Schema / data migrations** — backfills, column drops, type changes, anything that mutates existing rows
- **Authentication / authorization** — session handling, token validation, permission checks
- **Payments / billing** — charges, refunds, idempotency, money math
- **Public API surface** — endpoints or contracts other teams or users depend on
- **Destructive / irreversible operations** — deletes, overwrites, bulk updates, cache purges
- **Concurrency** — locking, ordering, race-prone shared state

Routine, easily-reverted CRUD does **not** need this. Reserve the ceremony for blast radius.

## Process

### 1. Name the decision

State the high-stakes decision in one sentence, explicitly. "I will run the backfill in a single transaction over the whole table." Vague intent cannot be refuted. If you cannot name it crisply, you do not understand it well enough to commit to it.

### 2. Adopt the skeptic stance — refute, don't defend

Before implementing, switch jobs. Your job is now to *break* the chosen approach, not to justify it. Produce, in writing:

- **How it fails** — concrete failure modes, not "it should be fine"
- **What it breaks** — existing callers, data, invariants, in-flight requests
- **What would disprove it** — the specific observation that would prove the approach wrong (the row count mismatches; the lock is held > N seconds; the old client gets a 500)

A skeptic who lists zero failure modes is not trying. Push until you have real ones.

### 3. Demand evidence per doubt

Each doubt is cleared only by concrete evidence — a **test**, a **doc/spec**, or a **spike** (throwaway experiment against real-ish data). "I'm pretty sure" does not clear a doubt. If clearing a doubt requires a behavior, write the failing test first ([[test-driven-development]]) so the evidence is durable.

### 4. Resolve: clear, refute, or escalate

- **Cleared** — evidence disproves the doubt. Proceed on that point.
- **Refuted** — evidence confirms the failure, or you cannot get evidence after honest effort. Pick a safer, reversible path (expand/contract migration instead of in-place; feature flag; dry-run mode; smaller batches) or **escalate to the human** with the doubt and what you tried.

Uncertainty after honest effort counts as **refuted**, not as permission to proceed.

## Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'm pretty sure it works" | Certainty without evidence is a guess. Get the test, doc, or spike. |
| "It's probably fine, low risk" | You put it on the high-stakes list. Probably-fine is the exact failure this catches. |
| "[[validate]] will catch it later" | Validate runs after the irreversible thing already happened. Doubt runs before. |
| "Refuting my own plan wastes time" | A bad migration or auth bug costs far more than the spike that would have caught it. |
| "I can't prove it's safe, but I can't prove it's unsafe either" | Default to refuted. The burden is on the approach to clear the doubt, not on you to disprove it. |
| "Adding a flag / dry-run is over-engineering" | For irreversible work, reversibility is the requirement, not a luxury. |

## Red Flags - STOP

- Listing only reasons the approach works, none of how it fails
- "Should be fine" / "I'm pretty sure" / "probably" as the basis to proceed
- Clearing a doubt with reasoning instead of a test, doc, or spike
- Treating "I couldn't find a problem" as "there is no problem"
- Running the irreversible step with no dry-run, no flag, no rollback
- Proceeding while a named doubt is still open

## Verification

Before committing the high-stakes change:

- [ ] The decision is named in one explicit sentence
- [ ] At least one concrete failure mode and its disproving observation are written down
- [ ] Every doubt is either cleared by evidence (test/doc/spike) or marked refuted
- [ ] No open doubt remains; uncertain ones were treated as refuted
- [ ] If refuted, a safer reversible path was taken or the human was escalated to
- [ ] The irreversible step has a rollback, dry-run, or flag — or proof it needs none

Can't check every box? The doubt is not cleared. Do not commit.
