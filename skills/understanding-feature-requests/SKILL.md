---
name: understanding-feature-requests
description: This skill should be used when clarifying feature requests, gathering requirements, or checking for contradictions in proposed changes
user-invocable: false
---

<!-- Interview protocol adapted from the "grilling" skill in github.com/mattpocock/skills (MIT). -->

# Understanding Feature Requests

Interactive workflow for clarifying feature requests and ensuring they don't conflict with existing requirements.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high`, `xhigh`, or `max` (the scale is `low` < `medium` < `high` < `xhigh` < `max`, so `xhigh` and `max` are already above `high`) AND you are Sonnet or Opus.
If effort is `low` or `medium` (i.e. below `high`), you MUST show the recommendation prompt — regardless of model.
If you are not Sonnet or Opus, you MUST show the recommendation prompt - regardless of effort level.

Otherwise → use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Do you want to switch? Contradiction detection in feature requirements benefits from consistent reasoning.\n\nTo switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke this skill.",
    "header": "Recommended: Sonnet or Opus at high effort",
    "options": [
      { "label": "Continue" },
      { "label": "Cancel — I'll switch first" }
    ],
    "multiSelect": false
  }]
}
```

If the user selects "Cancel — I'll switch first": output the switching commands above and stop. Do not proceed with the skill.

## Step 1: Clarify the Request

Interview the user in **rounds** until you reach a shared understanding.

### The design tree and the frontier

Model the request as a **design tree**: every decision branches into the decisions that hang off it. Work the tree in **rounds**. The **frontier** is every question whose prerequisites are already settled — the questions you can ask *now* without guessing at answers you haven't heard yet. Ask the whole frontier in one round; a question whose answer depends on another question still open in this round belongs to a *later* round. Each round of answers reshapes the tree: settled decisions push the frontier outward and unblock the questions that depended on them.

### Asking a round

Number every question and attach your recommended answer, worded so a plain "yes" accepts it:

> **Q1 — Session storage:** Keep sessions in the in-memory map, or move them to Postgres (`sessions` table with TTL)?
> **Recommended:** Postgres — orders already require it, and horizontal scaling kills the in-memory map.

"Yes" means *take the recommendation* — that is the whole mechanic. The question itself keeps whatever shape it honestly has: binary, or multiple-choice with the recommendation naming one of the options:

> **Q2 — Job queue:** Redis Streams, Sidekiq, or the database itself?
> **Recommended:** the database — at current volume a separate broker is a new failure mode, and migrating later is mechanical.

Never force a genuinely open question into a yes/no just to satisfy the format; a binary phrasing of an open choice is a leading question. The user can then answer a whole round in one line ("1: yes, 2: Sidekiq, 3: yes"), with no ambiguity about which answer attaches to which question. A "no" (or naming a different option) must carry the choice — a bare "no" doesn't say what they *do* want, so ask for it when you get one.

**Question material, in priority order:**

*Core (always resolve):*
- What problem does this solve for the user?
- Who is the target user/persona?
- What is the expected outcome or behavior?

*Exploratory (for open-ended or vague requests):*
- What inspired this feature idea? What was seen done well elsewhere?
- What would make this feature 'delightful' vs just 'adequate'?
- What's the simplest version that would provide value?
- If half the scope had to be cut, what would be kept?

*Conditional (as relevant):*
- What triggers this behavior? (event-driven features)
- What are the edge cases or error conditions?
- What is explicitly out of scope?
- Dependencies on other features?
- What metrics would indicate success?
- How could this fail? What are the risks?
- Could this be done another way?

Prefer multiple-choice when it sharpens the question; explore one topic per question, never compound. A round is as small as the frontier allows: resolve the core questions before the conditional ones, and drop any question an earlier answer has already mooted. Rounds fit the tool at hand: a round of up to 4 decision questions can use `AskUserQuestion` (recommended answer first among the options); larger rounds, or rounds expecting free-form answers ("2: no — keep REST"), go as numbered prose.

### Facts are your job; decisions are the user's

Never ask the user for anything you can look up. When a frontier question needs a fact from the environment (does the codebase already parse JWTs? does the platform support X?), dispatch a subagent to find it. Don't block on it: a running lookup is an unsettled prerequisite, so only the questions downstream of it wait — ask the rest of the frontier now. The *decisions* are the user's: put each to them and wait.

### Termination

The interview is done when the frontier is **empty** — every branch of the design tree visited, nothing left silently assumed. Then summarize the settled understanding in a few lines and get the user's confirmation before handing off to design. Do not act on the understanding before that confirmation.

### Unattended runs

If `GROUNDWORK_BATCH_MODE=true` (or runner mode is active), run no rounds — an unattended run must never wait on an interview. Settle from the conversation, the specs, and the codebase whatever they already answer, and hand the caller two lists: what you settled, and what remains open. What happens to the open items is the caller's contract, not this skill's: the runner fails the run on a missing decision rather than assuming one, while an interactive batch proceeds on assumptions it records. Either way, never fill a gap with a silent guess.

## Step 2: Check for Internal Contradictions

Throughout the rounds — and once more over the final summary — check for conflicts within the request:

- Conflicting behaviors (e.g., "shall be real-time" AND "shall work offline-first")
- Incompatible constraints (e.g., "shall complete in <100ms" AND "shall process 10,000 items")
- Mutually exclusive states

**If conflicts found, surface them and resolve before proceeding.** A contradiction is itself a frontier question: put it to the user with your recommended resolution.
