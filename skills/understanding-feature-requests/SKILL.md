---
name: understanding-feature-requests
description: Use when clarifying feature requests, gathering requirements, or checking for contradictions in proposed changes
user-invocable: false
---

# Understanding Feature Requests

Interactive workflow for clarifying feature requests and ensuring they don't conflict with existing requirements.

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
