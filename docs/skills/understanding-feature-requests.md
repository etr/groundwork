# `understanding-feature-requests`

> **Tier:** library — run for you by `design-product` (Step 1) and by `plan-task` in blurb mode · **Reads:** the conversation, existing specs · **Writes:** nothing; its output is the settled understanding

## What it does

The interview that precedes a PRD or an unplanned feature. It works in **rounds**: each round asks only the questions that can be answered now, each with a recommended answer, and it looks up facts itself instead of asking you for them. It ends when nothing is left unasked.

## When to reach for it

- Any time a feature request arrives before design: "add X", "we need Y".
- **Not when:** the requirements are already written. Go to `design-architecture` or `create-tasks`.

## Common questions

**Why am I asked several questions at once?**

A round is the *frontier*: every question whose prerequisites are already settled. A question that depends on an answer still missing is held for a later round.

**Do I have to write out each answer?**

No. "Yes" means *take the recommendation*. A whole round fits in one line: `1: yes, 2: Sidekiq, 3: yes`.

**It asked me something it could have looked up.**

That is a failure. Facts are its job; decisions are yours.

**Will it block an unattended run?**

No. With batch mode or the runner active it runs no rounds: it settles what the conversation, the specs, and the code already answer, and hands back what was settled and what remains open.

## It's working if

- Every question is numbered and carries a recommended answer.
- Later questions build on your earlier answers rather than guessing at them.
- You are asked for decisions, never for facts.
- The interview ends with a short summary of what was settled and your confirmation.
- An unattended run asks nothing, and its output lists what was settled and what was left open.

**It is not working if:** an open question was forced into yes/no, or the interview stopped because a question list ran out while branches remained.
