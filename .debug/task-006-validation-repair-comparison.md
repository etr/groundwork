# Debug: TASK-006 validation repair comparison

## Status
Root Cause Found

## Symptoms
- ArtistAI maillist TASK-006 repeatedly failed validation and entered repair.
- Determine whether the semantic runner-output change would prevent that behavior.

## Reproduction
### Command Executed
Read TASK-006's durable validation session, gate finding, repair envelope, fixer result, and the historical Codex rollout. Compared those artifacts with the current source and installed validation helper using exact searches for `expectedTree`, the drift error, snapshots, quarantine, and rollback.

### Actual Output
- Historical session: `stage=fixer-result-ready`, iteration 1, with an `expectedTree` recorded by the old helper.
- Historical rollout: eleven files changed outside the recorded fixer transition; the old helper rejected the resulting tree mismatch and validation churned into runner repair.
- Legitimate iteration-1 gate finding: two raw `font-weight: 600` declarations; the validation fixer replaced them with `var(--font-weight-interface-semibold)`.
- Current source and installed helper: no matches for `expectedTree`, `worktree changed outside a recorded validation transition`, fixer snapshots, quarantine, or rollback.

### Expected Output
The removed validator tree-policing path cannot reject the same external writes. Reporting changes alone do not alter lifecycle behavior.

### Matches User Report?
Yes. The historical rollout explicitly records the repeated validation churn and its tree-mismatch cause.

## Hypotheses

### Active
- [ ] None.

### Eliminated
- [x] The semantic reporting change prevents the loop: eliminated because it changes rendering/journaling, not validation admission.
- [x] The ordinary project-gate finding caused repeated outer recovery: eliminated because the font-token finding was fixed successfully inside validation.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Read TASK-006 validation artifacts | One real frontend gate finding; fixer result was `fixed` | A normal internal fixer pass was warranted |
| 2 | Read historical rollout | Eleven later file changes caused `expectedTree` mismatch | Validator tree policing caused the repeated churn |
| 3 | Search current source and installed helper | All tree-policing and snapshot terms absent | The causal guard has been removed from both copies |

## Root Cause
**Verification level:** Corroborated

The old validation helper required every worktree change to occur within a recorded validation transition. Eleven TASK-006 worktree files changed after its fixer transition, so the helper rejected the new tree and the outer runner treated the validation failure as recoverable. Re-running validation could not reconcile the old durable guard, causing repeated repair churn.

The original worktree no longer exists, so the historical failure cannot be re-executed verbatim. Direct durable artifacts, the historical rollout, and the exact removed code path independently agree.

## Fix
No code change requested or authorized.

## Resolution
The earlier validator fix—not the semantic reporting change—removed the causal `expectedTree` and snapshot/rollback mechanism. The same out-of-transition writes will no longer fail validation for that reason. Genuine gate findings can still invoke validation's internal fixer, and ordinary receipt/commit/publication checks remain.
