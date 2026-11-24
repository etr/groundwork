# `design-architecture`

> **Run it:** `/groundwork:design-architecture [feature-name]` · **Tier:** user-run or model-invoked · **Reads:** the PRD · **Writes:** `specs/architecture.md` (or the split directory), including its decision records

## What it does

Turns the product requirements into an architecture through decisions made one at a time: for each decision area it presents two to four options with a recommendation, researches what it does not know, and records the decisions that are hard to reverse. It ends with a document validated against the PRD.

## When to reach for it

- A PRD exists and the technical design is not settled.
- **Not when:** the viable options are so close that one pass cannot weigh them fairly — use `swarm-design-architecture`.

## Common questions

**It finished with open questions left.**

Deliberate. Questions that can be stated precisely are recorded as *open decisions*; ones it can sense but not yet phrase are recorded as *fog*. A question silently resolved to make the document look complete would be a decision without its rationale.

**Only some decisions were recorded.**

A decision is written down only when it passes the decision-record gate: hard to reverse, surprising without context, and a real trade-off. Everything else is simply implemented.

**It asked me something it could have looked up.**

That is a failure. Facts are its job during the decision loop; decisions are yours.

**It flagged open decisions before offering the next step.**

When open decisions remain that the tasks would depend on, it says so before you choose *Create tasks*: tasks built on an open decision are guesses.

**It finished and told me to run something instead of continuing.**

`ux-design` and `create-tasks` are user-run skills, so the model can only recommend them. Run the one it names.

**I ran it again on the same project.**

It reads the existing document first — settled decisions are constraints, and the open decisions recorded in section 12 are the agenda — then updates the document in place.

## It's working if

- Each decision area arrives with options, pros and cons, and a recommendation tied to the requirements.
- Decision areas are ordered so prerequisites settle first.
- Recorded decisions keep the discarded options and the reasoning.
- Section 12 lists what is unsettled, split between open decisions and fog.
- The document uses the glossary's terms, and the checker approved it.

**It is not working if:** the document is a component list with no rationale, or every uncertainty was filled in with an unmarked assumption.
