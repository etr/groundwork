# Debug: Runner Finalize Completion Transition

## Status
Fixed

## Symptoms
- TASK-074 validation completed, but finalization was rejected after 49 seconds.
- Exact error: `finalize-task did not make only the required TASK-074 completion transition`
- Worktree and branch were preserved.

## Reproduction
### Command Executed
1. `node -e "...parseTaskCatalog(git show <sha>:packages/artistai/specs/tasks.md)..."`
2. `git show <implementation-sha>:packages/artistai/specs/tasks.md`
3. `git show <validated-sha>:packages/artistai/specs/tasks.md`
4. Added a real temporary-repository integration test where validation commits the
   task completion and finalize returns the unchanged validated HEAD.

### Actual Output
User-observed command result:

`RESULT: FAILURE | TASK-074 failed: finalize-task did not make only the required TASK-074 completion transition`

Observed preserved state:
- Implementation `6e8370d4`: `- **Status:** In Progress`
- Validated HEAD `70a9772b`: `- **Status:** Complete`
- Installed runner parses both commits as `status: Not Started`
- Final task HEAD equals validated HEAD; finalize made no post-validation commit.

### Expected Output
Finalization accepts only TASK-074 completion bookkeeping after validation, then merges and cleans up.

### Matches User Report?
Yes for the preserved real run; minimal automated reproduction pending.

## Hypotheses

### Active
None.

### Eliminated
- [x] Finalize changed another field or task row: eliminated because task branch HEAD still equals the checkpoint's validated HEAD.
- [x] Validation checkpoint points at the wrong commit: eliminated because checkpoint and branch both identify `70a9772b`.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | User reran TASK-074 | Finalize returned a structurally valid READY receipt, then runner bookkeeping verification rejected it | Failure is after model finalization and before outward merge. |
| 2 | Compared implementation and validated task specs | Validation made the intended `In Progress -> Complete` transition | Completion can already be part of the validated tree. |
| 3 | Ran installed `parseTaskCatalog` on both commits | Both bullet-form statuses parse as `Not Started` | Parser does not support common Markdown list-prefixed metadata. |
| 4 | Ran the new temporary-repository integration test | It failed with the exact user-reported completion-transition error | The after-validation transition assumption is independently reproduced. |

## Root Cause
**Verification level:** Verified

The verifier assumes finalization itself must create a `non-Complete -> Complete`
transition after the validated commit. TASK-074's validation fixer/housekeeper already
made that transition inside the validated commit, so finalization correctly returned
the same task head. Separately, the task parser ignores list-prefixed status fields,
preventing it from recognizing either state. The real preserved Git state directly
supports both causes; the temporary-repository integration test independently
reproduces the failure.

## Fix
- Parse `Status` and `Blocked by` metadata with or without a Markdown list marker.
- Mask a selected task's list-prefixed status when verifying bookkeeping-only diffs.
- Accept an unchanged task HEAD when the validated tree already marks the task
  Complete.
- Continue rejecting any post-validation bookkeeping commit in that case.

## Resolution
Regression tests cover the list-prefixed parser and the exact validated-complete
finalization path. `bash tests/run-tests.sh` passes.
