# Debug: Runner Stops Before a Finished Product

## Status
Fixed

## Product Contract
A user launches the runner once and returns to all selected tasks implemented, validated, and integrated. Worktree preservation, checkpoints, and recovery limits are internal controls; none is a successful outcome.

## Symptoms
- TASK-192 resumed successfully after the ENOBUFS fix and completed implementation.
- Validation could not load `lam-ai` because the task worktree lacked generated build output.
- Recovery ran twice without permission to write or build, then reported `user judgment is required`.
- The task remained checkpointed and clean, but the requested product was unfinished.

## Reproduction
### Actual Output
The preserved TASK-192 run reached validation, reported that `lam-ai` had no resolvable build output, noted that `npm run check` passed, and stopped after two recovery sessions made no state progress.

### Expected Output
Recovery should perform safe, reversible preparation inside the selected task worktree, retry validation, and keep driving toward integration. A progressing repair sequence must not fail because it crossed a lifetime attempt count.

## Root Cause
**Verification level:** Verified

Three controller policies contradict the runner's completion contract:

1. The recovery prompt asks the model to repair the task, but both harness invocations prohibit filesystem writes.
2. The recovery transaction rejects every ignored-content change, including newly generated local build output, even though it already snapshots and protects pre-existing ignored content.
3. `MAX_RECOVERY_ATTEMPTS` is a lifetime cap, so recovery terminates after two sessions even when every session advances the selected task toward completion.

## Designs Considered

### Repository-specific prerequisite hooks
Rejected. Hooks would move product reliability into each repository and require the user to predict every missing preparation step.

### Copy ignored state from another worktree
Rejected. Copied artifacts can be stale, platform-specific, or inconsistent with the selected task head.

### Goal-driven completion controller
Selected. Give recovery authority for safe local changes in the selected task worktree, preserve new ignored environment artifacts while protecting all pre-existing content, and limit only consecutive stagnation. Existing Git ownership, scope, destructive-change, publication, and rollback controls remain in force.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Resumed preserved TASK-192 after the ENOBUFS repair | Implementation committed as `16439efc`; validation then failed on missing `lam-ai` build output | The runner passed the original crash and exposed a separate completion failure |
| 2 | Inspected recovery harness construction | Claude recovery has no writable paths; Codex recovery has `writable_roots=[]` | Recovery cannot perform the repair its prompt requests |
| 3 | Inspected recovery approval | Any ignored SHA change is rejected before safe-delta approval | Generated build output cannot survive recovery |
| 4 | Inspected retry controller | Total recoveries are capped at two regardless of state progress | The controller optimizes bounded attempts, not completed work |
| 5 | Ran TASK-192 with writable recovery | Recovery built LAM and got the blocked test past missing `lam-ai`, but Vitest refreshed `packages/coding-agent/node_modules/.vite/vitest/.../results.json`; the runner rolled back and failed | Blanket protection of generated ignored caches still converts routine recovery into a terminal product failure |

## Live Acceptance Revision
The selected task worktree must distinguish protected ignored content from generated environment state. Recovery may create or refresh generated directories such as dependency trees, build outputs, caches, coverage, targets, and virtual environments. Other ignored content remains byte-protected. Unrelated worktrees retain full ignored-content protection. Generated selected-task paths are excluded from rescue copying, avoiding the observed multi-minute cleanup of LAM's 23,000-file ignored dependency tree.

## Fix
- Gave fresh recovery sessions write authority inside the selected task instead of invoking them read-only.
- Reframed recovery around completing the failed phase, with explicit authority for repository-declared local setup, generation, builds, and tests.
- Replaced the lifetime two-recovery cap with a limit on two consecutive sessions that make no relevant progress; any progressing repair resets stagnation.
- Allowed selected-task generated ignored state to be created or refreshed while preserving byte protection for other ignored paths and all ignored paths in unrelated worktrees.
- Excluded generated selected-task state from rescue copying, retaining transactional protection without copying and deleting entire dependency trees.
- Documented the external runner as a start-once completion harness.

## Resolution
- RED 1: focused runner suite failed on read-only recovery, a third progressing repair, new ignored build output, and ignored overwrite handling (`136 passed, 4 failed`).
- GREEN 1: focused runner suite passed `140/140`; full repository suite passed.
- Live acceptance 1: recovery built LAM and passed the blocked test, then exposed Vitest's pre-existing ignored cache refresh as a blanket-protection failure. The runner rolled back and preserved TASK-192.
- RED 2: exact generated-cache regression failed on `packages/coding-agent/node_modules/.vite/vitest/fixture/results.json` (`139 passed, 1 failed`).
- GREEN 2: focused runner suite passed `140/140`; added unrelated-worktree generated-state protection; final runner suite passed `141/141`; every repository suite passed; `git diff --check` and Node syntax checks passed.
- Installed runner SHA-256 matched validated source: `e97a5c4327dbc05e619cf91ccb995053af077237a3373b10be7dd51d762a2293`.
- Live acceptance 2: the runner autonomously built LAM dependencies, passed the TASK-192 and unchanged baseline tests, completed two validation iterations, repaired findings, obtained all causal re-review approvals, finalized, merged, and cleaned up.
- LAM outcome: clean `main` at merge `350f0dcd`; validated task head `0398e5e7`; TASK-192 status `Complete`; `task/TASK-192` and `.worktrees/TASK-192` removed.
