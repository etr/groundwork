# Debug: Concurrent Runner Git-Control Collision

## Status
Fixed

## Symptoms
- ArtistAI TASK-075 implementation ran for 17 minutes, then failed with
  `Repository Git config, hooks, or info attributes changed during a model phase`.
- A bottle-budget runner was active in the same monorepo at the same time.

## Reproduction
### Command Executed
1. `stat` on the shared `.git/config` and `.git/info/exclude` files.
2. Read `.git/info/exclude` and compared its timestamp with the second runner's
   first logged phase.
3. Inspected common Git hooks and local config.

### Actual Output
- `.git/config`: last modified `09:57:32`; hook path already points at the primary
  checkout.
- `.git/hooks`: unchanged since March.
- `.git/info/exclude`: last modified `10:16:22`, exactly when the bottle-budget
  runner logged its first phase.
- The new line is `/packages/bottle-budget/.groundwork-plans/`.

### Expected Output
Launching two runners against one repository must not let one runner invalidate a
long-running model phase in the other. Shared Git state must have one deterministic
owner at a time.

### Matches User Report?
Yes. The protected file timestamp and added project pattern identify the exact
concurrent write that caused the reported terminal guard failure.

## Hypotheses

### Active
None.

### Eliminated
- [x] TASK-075's model changed Git hooks: config and hooks timestamps do not match
  the phase failure.
- [x] Hook-path restoration failed: the local hook path is already restored to the
  primary checkout.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Compared control timestamps | Only `info/exclude` changed during the phase | Failure was not a hook/config mutation. |
| 2 | Read new exclude entry | It names bottle-budget, not ArtistAI | The second runner made the change. |
| 3 | Matched wall-clock time | Exclude mtime equals the bottle runner's `10:16:22` start | Cross-runner attribution is direct. |
| 4 | Traced runner preflight | `ensureLocalPlanIgnore()` writes the shared exclude file before each run | Concurrent runners currently have no shared-state coordination. |
| 5 | Ran repository-lease unit test | Second owner waited, acquired after release, and removed only its own lease | Lease ownership and queue behavior are verified. |
| 6 | Ran `runTasks` failure integration | Runner waited for the existing owner and released its lease after the phase failed | Orchestration uses the lease across failure paths. |

## Root Cause
**Verification level:** Verified

Each runner assumes it is the only writer of the repository's common Git directory
during a model phase, but the runner has no repository lease. A second runner's
legitimate `info/exclude` update therefore looks identical to model tampering and
invalidates the first runner after expensive work has completed.

## Fix
Design-it-twice recommendation: use a repository-wide lease held for one complete
task. Other invocations wait with progress messages and acquire the lease at the
next task boundary. This preserves the security snapshots; weakening them cannot
distinguish authorized concurrent runners from model tampering, while a coordinating
daemon would be disproportionate for the mini-harness.

## Resolution
The runner now serializes initial shared-state setup and holds a repository lease for
each complete task. Independent batch commands can queue and interleave only at task
boundaries. Lease wait progress includes the owning project, task, and PID; stale
dead-process leases are reclaimed. `bash tests/run-tests.sh` passes.
