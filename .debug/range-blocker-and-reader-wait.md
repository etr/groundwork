# Debug: Range Blocker and Reader Wait

## Status
Resolved

## Symptoms
- A bottle-budget range run waited about fourteen minutes for the artistai TASK-075 repository reader.
- After the reader released, the run failed with `TASK-153 is blocked by incomplete TASK-037` without starting the lowest runnable task.

## Reproduction
### Command Executed
Executed the installed runner's real `parseTaskCatalog` and `orderTasks` functions against every Bottle Budget task file for TASK-041..TASK-154, then evaluated TASK-041 alone.

### Actual Output
Range: `TASK-153 is blocked by incomplete TASK-037`.

TASK-041 alone: `[ 'TASK-041' ]`.

### Expected Output
- A legitimate active model phase may hold a reader lease, but diagnostics should explain why progress is blocked.
- A task blocked by an incomplete dependency outside a range should not prevent lower ready tasks in that range from running.

### Matches User Report?
Yes. The exact production ordering function and ArtistAI catalog reproduce the reported failure.

## Hypotheses

### Active
- [x] TASK-075 held a reader lease for its entire model phase; bottle-budget needed the repository writer gate during setup.
- [x] `orderTasks` rejects the whole range during preflight when any selected task has an incomplete dependency outside the selected set.

### Eliminated

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Inspected live ArtistAI lease records | PID 38942 owns the artistai TASK-075 project lease and an active repository reader; a registered child phase process exists | The wait was against a live phase, not a stale lock |
| 2 | Traced `invokeChecked` | The read gate is held across the complete harness/model call | Wait duration equals the active TASK-075 phase duration |
| 3 | Traced `runTasks` setup | A repository writer gate is acquired before project/catalog/range validation | The blocked-range error cannot surface until the active reader finishes |
| 4 | Inspected TASK-153 and TASK-037 | TASK-153 depends on TASK-037; TASK-037 is Not Started and excluded by `--from TASK-041` | The selected range contains an externally blocked task |
| 5 | Executed production ordering against the real catalog | Full range throws on TASK-153; TASK-041 alone returns TASK-041 | Numeric scheduling is never reached for the range |

## Root Cause
**Verification level:** Verified

Issue 1: setup used the publication writer lease for every startup and worktree registration, even though those operations do not conflict with an active model phase when registry snapshots are coordinated. TASK-075 held a reader lease for its whole model phase, so the over-broad writer gate delayed bottle-budget. The heartbeat only reported the delay every 30 seconds; it did not cause it.

Issue 2: `orderTasks` performs a fail-fast validation pass over every selected task before its numeric ready-task loop. TASK-153 appears in the selected range and depends on incomplete TASK-037 outside that range, so validation throws. TASK-153 was inspected, not started. TASK-041 is ready, but the scheduler never reaches it.

## Fix
Authorized follow-up targets the wait only; range failure semantics remain unchanged.

Design-it-twice result:

- Rejected: merely allow peer registry changes without synchronizing snapshots; phases can observe half-created workspaces.
- Rejected: precreate every selected worktree; later invocations remain unpredictable and later task bases become stale.
- Selected: keep the existing phase-reader/publication-writer gate, add a short exclusive workspace-registry mutex, and let workspace setup hold a phase-compatible reader plus that mutex. Phase before/after snapshots briefly take the same mutex. Permit only exact verified peer worktree additions; merge/removal remains publication-writer exclusive. Acquire the initial publication writer only when `.git/info/exclude` actually needs mutation.

## Resolution
- Startup catalog reads now use a phase-compatible repository reader.
- `.git/info/exclude` takes the publication writer only when an ignore entry is missing.
- Worktree registration uses a repository reader plus a short workspace-registry mutex.
- Phase snapshots use that mutex and accept only exact, live, checkpoint-verified peer additions.
- Worktree removal, branch deletion, and merge remain publication-writer exclusive.
- A base advanced by a concurrent project is handled by the existing finalize/revalidate loop.
- Regression: a second project reaches its model phase while the first remains active; both later publish successfully through serialized merge/revalidation.
- Verification: `tests/groundwork-run.test.js` — 112 passed, 0 failed.
