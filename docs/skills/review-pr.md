# `review-pr`

> **Run it:** `/groundwork:review-pr [PR number or URL] [--no-interactive]` · **Tier:** user-run · **Reads:** the PR, the specs, the repository's standards · **Writes:** one review on GitHub, after you confirm

## What it does

A multi-agent review of a pull request. Specialized reviewers — code quality, tests, security, performance, simplification, housekeeping, plus conditional ones — each read the diff in their own context, and the results are aggregated and deduplicated into a single review with inline comments. It is read-only: it reports, it does not fix.

## When to reach for it

- Before merging any PR, especially one from outside the Groundwork lifecycle.
- **Not when:** you want issues fixed, not listed. Run `validate` on the branch instead.

## Common questions

**Why is it silent about things my linter would catch?**

On purpose. Reviewers skip anything the project's tooling already enforces — linter, typechecker, formatter, CI — and spend their findings on judgment.

**When does spec alignment run?**

When product specs exist in the repository. On a task branch it checks against the real task definition; otherwise the PR's stated intent is the scope.

**Does it post without asking?**

Interactively, no: you see a summary or a full preview first. With `--no-interactive` it posts straight away.

**There is already a Groundwork review on this PR.**

It offers a fresh review or an incremental one that excludes findings already raised.

**It created a local branch called `pr-<number>-review`.**

The review checks the PR head out into that branch so the reviewers can read the files — the same way for forks and same-repo PRs. Step 9 deletes it again; if another worktree has it checked out, it reports that and stops rather than moving it.

## It's working if

- The report lists every agent with a score and a verdict, and each skipped agent with the reason.
- Findings are judgment calls, not lint output.
- A spec alignment row appears when the repository has specs.
- Near-duplicate findings from different agents are merged, keeping the higher severity.
- Nothing is posted before you confirm (unless you ran it non-interactively).

**It is not working if:** one agent's output is re-quoted wholesale as the review, or the same finding appears three times.
