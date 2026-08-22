# Debug: Selected Project Dirty in Peer Worktree

## Status
Fixed in Source

## Symptoms
- Bottle Budget runner fails before TASK-041 because `.worktrees/TASK-075` contains a modified Bottle Budget test.
- Exact error: `Selected project in unrelated worktree .../.worktrees/TASK-075 is not clean`.

## Reproduction
### Command Executed
Called the installed runner's exported production preflight directly and read-only:

`snapshotUnrelatedWorktrees(artistaiRepo, bottleBudgetRoot, bottleBudgetTask041Worktree, "bottle-budget")`

### Actual Output
`Selected project in unrelated worktree .../.worktrees/TASK-075 is not clean: M packages/bottle-budget/frontend/tests/components/layout/TabBar.test.tsx`

### Expected Output
The runner should reject the cross-project mutation; ArtistAI validation must not authorize or make it.

### Matches User Report?
Yes. This is the exact production function and current worktree state from the user report.

## Hypotheses

### Active
- [x] Codex validation converted an unrelated full-repository gate failure into fixer authority outside the selected project.

### Eliminated
- [x] Installed runner is stale: installed and source runner SHA-256 hashes are identical.
- [x] Runner misclassified legitimate Bottle Budget task work: TASK-075 checkpoint selects `packages/artistai`, while its uncommitted edit targets `packages/bottle-budget`.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Compared installed/source runner hashes | Both are `e936ed...` | Not a stale installation |
| 2 | Inspected TASK-075 checkpoint and active leases | Project is `packages/artistai`; validation phase is active; checkpoint has implementation but no validation result | The mutation occurred after implementation during validation |
| 3 | Inspected TASK-075 status/diff | Bottle Budget `TabBar.test.tsx` is modified alongside ArtistAI files | This is cross-project spillover |
| 4 | Read live validation artifacts | `findings-project-gates-iter4.json` names the Bottle file as a fixable `initial-audit-miss`; `fixer-manifest-iter4.json` authorizes it | The validator explicitly delegated the out-of-scope repair |
| 5 | Compared timestamps | Iteration-4 gate artifact predates the Bottle file modification | The active fixer acted on that authorization |
| 6 | Ran production preflight read-only | Exact user error reproduced | Runner safety check works as designed |

## Root Cause
**Verification level:** Verified

The Codex-only project-gate policy treats every nonzero full-repository gate as an automatic `request-changes` finding and sends it to a fixer before adjudicating it against the frozen selected-project baseline. TASK-075's full test gate reported all 818 Bottle Budget assertions passing but a Vitest teardown error. The coordinator labeled that unrelated Bottle failure an `initial-audit-miss`, placed it in the iteration-4 fixer manifest, and the fixer edited the Bottle test from the ArtistAI worktree. The runner then correctly protected Bottle Budget from that cross-project dirty state.

## Fix
Add coordinator and fixer defense-in-depth rules: a failed repository-wide gate is evidence, not authority; only failures causally tied to the selected project/original task delta may enter a fixer manifest. Unrelated baseline failures are never mutated. If every in-scope check passed, persist the outside failure and continue; if causality cannot be established, fail validation without mutation.

## Resolution
- Added a regression test that fails unless the exported Codex validation coordinator keeps unrelated monorepo gate failures outside fixer authority.
- Added an independent validation-fixer rule that refuses outside-project project-gate mutation without a concrete causal chain from the task delta.
- Updated the project-gate barrier to distinguish in-scope failures, unrelated baseline failures, and uncertain failures. Unrelated failures are persisted without mutation; uncertain failures stop safely.
- `tests/apply-codex-skill-policy.test.js`: 10 passed, 0 failed.
- `tests/install-config.test.js`: 59 passed, 0 failed.
- The already-running TASK-075 validation used the old exported policy and completed its iteration-4 Bottle Budget edit. It must be interrupted before runner-owned commit/publication; cleanup of that single cross-project file remains a deliberate user action.
