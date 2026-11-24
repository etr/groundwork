# `doubt-driven-development`

> **Run it:** `/groundwork:doubt-driven-development` · **Tier:** user-run or model-invoked — typed by you, or invoked by the model on a high-stakes change · **Reads:** the chosen approach, the code it will change · **Writes:** failure modes and doubts, in writing; failing tests that clear them; spike code in a worktree, never committed

## What it does

For a change that is hard to undo, the agent turns reviewer on its own approach during the build, before building on it. It names the decision in one sentence, writes down how it fails, what it breaks, and what observation would disprove it, then clears each doubt only with a test, a doc, or a spike. A doubt that stays unproven counts as refuted, so the path becomes a safer, reversible one — or the decision goes to you.

## When to reach for it

- Schema or data migrations, authentication and authorization, payments or billing.
- Public API surface, destructive or irreversible operations, concurrency.
- Routine, easily reverted CRUD does not need it. Reserve it for blast radius.
- **Not when:** the code is already written and you want it checked. That is `validate`, which runs after implementation; this runs before a line is committed.

## Common questions

**It abandoned an approach it could not prove wrong.**

That is the rule. A doubt that cannot be disproved with evidence is a reason to choose a safer path, not to proceed and hope. Uncertainty after honest effort counts as refuted.

**Isn't this what `validate` does?**

No. `validate` is the post-hoc multi-agent loop that runs after implementation and catches what got built wrong. This runs during the build and catches what should never have been built that way.

**What clears a doubt?**

Only concrete evidence: a test, a doc or spec, or a spike — a throwaway experiment against real-ish data. "I'm pretty sure" clears nothing. Spike code lives in the task worktree or a scratch worktree via `use-git-worktree`, is never committed, and never goes in the shared workspace.

**It refused to commit.**

Before committing the high-stakes change it checks its own list. If it cannot check every box, the doubt is not cleared and it does not commit.

## It's working if

- The decision is named in one explicit sentence.
- At least one concrete failure mode is written down, with the observation that would disprove the approach.
- Every doubt is either cleared by evidence — test, doc, or spike — or marked refuted.
- No doubt is left open; the uncertain ones were treated as refuted.
- Where the approach was refuted, a safer reversible path was taken, or you were asked.
- The irreversible step has a rollback, a dry-run, or a flag — or proof that it needs none.

**It is not working if:** it proceeded on "should be fine", cleared a doubt by reasoning alone, or ran the irreversible step with no dry-run, no flag, and no rollback.
