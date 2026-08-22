# Debug: Non-Existential Phase Checks

## Status
Resolved

## Symptoms
- Validation completed after 2h22m, then Groundwork discarded the result because another task checkpoint changed.
- Exact error: `Inactive task checkpoint state changed during a model phase: 18544cc3b8a31bad/TASK-041.json`.

## Reproduction
### Command Executed
`node tests/groundwork-run.test.js`

### Actual Output
`Error: TASK-004 failed: Inactive task checkpoint state changed during a model phase: cdb4ee2aea69cc6a/TASK-075.json`

### Expected Output
Changing inactive-task checkpoint metadata must not invalidate a completed phase.

### Matches User Report?
Yes. Same production assertion, same inactive-checkpoint mutation, same late phase invalidation.

## Root Cause
**Verification level:** Verified by production-path regression.

`invokeChecked()` snapshots every runner checkpoint before a model phase and compares every file afterward. A checkpoint belonging to an unrelated task is mutable coordination metadata, not evidence that the current task result is unsafe. The blanket comparison turns normal concurrent runner progress into a late failure.

## Policy Boundary
- Keep only checks whose failure means Groundwork could publish the wrong commit, lose task work, write outside the repository, or execute attacker-controlled Git configuration.
- Remove phase invalidation for inactive checkpoints, peer worktrees, unrelated worktrees, and unrelated refs.

## Fix
- Model phases no longer snapshot or compare runner checkpoints, repository refs, registered worktrees, peer leases, or unrelated worktree contents.
- Publication no longer inspects unrelated worktrees.
- Benign repository-local exclude and config metadata changes no longer invalidate a phase.
- Git execution controls remain limited to hooks, `core.hooksPath`, command-bearing configuration, and `info/attributes`.

## Verification
- Exact inactive-checkpoint regression: green.
- Non-existential tag, inactive branch, unrelated worktree, unrelated project, and local-exclude regressions: green.
- Runner suite: 114 passed, 0 failed.
