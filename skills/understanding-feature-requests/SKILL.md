---
name: understanding-feature-requests
description: This skill should be used when clarifying feature requests, gathering requirements, or checking for contradictions in proposed changes
user-invocable: false
---

# Understanding Feature Requests

Interactive workflow for clarifying feature requests and ensuring they don't conflict with existing requirements.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high` or higher AND you are Sonnet or Opus.
If effort is below `high`, you MUST show the recommendation prompt — regardless of model.
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

When the user proposes a feature or change, ask clarifying questions to understand:

**Core Questions (always ask):**
- What problem does this solve for the user?
- Who is the target user/persona?
- What is the expected outcome or behavior?

**Exploratory Questions (for open-ended or vague requests):**
- "What inspired this feature idea?"
- "Have you seen this done well elsewhere? What did you like about it?"
- "What would make this feature 'delightful' vs just 'adequate'?"
- "What's the simplest version that would provide value?"
- "If you had to cut half the scope, what would you keep?"

**Conditional Questions (ask as relevant):**
- What triggers this behavior? (for event-driven features)
- What are the edge cases or error conditions?
- What is explicitly out of scope?
- Are there dependencies on other features?
- What metrics would indicate success?
- How could this fail? What are the possible risks and dangers?
- Could we do this in any other way?

**Keep questions focused** - ask 2-3 at a time, not all at once. Build understanding iteratively.

**Question Style:**
- Prefer multiple-choice questions when possible - they're easier to answer and keep conversations focused
- Explore one topic at a time to avoid overwhelming stakeholders
- When presenting alternatives, lead with your recommendation

## Step 2: Check for Internal Contradictions

Before proceeding with design, review for conflicts within the proposed feature:

- Conflicting behaviors (e.g., "shall be real-time" AND "shall work offline-first")
- Incompatible constraints (e.g., "shall complete in <100ms" AND "shall process 10,000 items")
- Mutually exclusive states

**If conflicts found, surface them and resolve before proceeding.**
