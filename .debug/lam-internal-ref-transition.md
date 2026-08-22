# Debug: LAM Internal Ref Rejected by Runner

## Status
Resolved

## Symptoms
- TASK-188 implementation ran for 11m31s, then runner post-phase verification failed.
- Exact error: `repository refs changed during implement: refs/lam/checkpoints/s1/turn-1`.

## Reproduction
### Command Executed
`node tests/groundwork-run.test.js`

### Actual Output
Before the fix, the new production-path regression test failed with:
`TASK-004 failed: repository refs changed during plan: refs/lam/checkpoints/s1/turn-1`.

### Expected Output
The runner should advance to implementation after an application-owned custom ref changes, while continuing to reject branch and tag changes.

### Matches User Report?
Yes. The same `assertRepositoryTransition` branch rejected the same `refs/lam/checkpoints/...` namespace.

## Hypotheses

### Active
- None.

### Eliminated
- [x] Another concurrent process created the ref. The checkpoint commit captured the exact TASK-188 worktree tree and was timestamped during its phase.
- [x] The ref was unrelated tampering. LAM documents and implements `refs/lam/checkpoints/<session>/<turn>` as application state.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Inspected `refs/lam/checkpoints/s1/turn-1` | Commit subject/trailers identify LAM checkpoint `s1`, `turn-1`; its tree contains the TASK-188 edits | The phase itself created the ref while exercising LAM checkpoint code |
| 2 | Inspected LAM tests | `agent-session-file-tracking.test.ts` constructs `CheckpointManager` with `cwd: process.cwd()` and prompts a session | A LAM test leaks checkpoint state into the task repository |
| 3 | Ran production-path regression | Custom ref was rejected before implementation | Groundwork's blanket all-ref policy reproduced the user failure |
| 4 | Narrowed protected refs and reran suite | 113 passed, 0 failed | Custom application state is accepted; publication-sensitive refs remain protected |

## Root Cause
**Verification level:** Verified

Groundwork treated every path below `refs/` as runner-owned repository integrity state. Git permits applications to own custom namespaces, and LAM deliberately uses `refs/lam/checkpoints/`. A LAM test also incorrectly points checkpoint storage at the real process working directory, causing that legitimate application namespace to change during validation.

## Fix
`assertRepositoryTransition` now guards publication-sensitive and Git-special namespaces (`heads`, `tags`, `remotes`, `notes`, `replace`, `bisect`, rewrite/original/worktree refs, and `stash`) while allowing application-owned custom namespaces. Added a production-path regression for `refs/lam/checkpoints/...`; existing tag and inactive-task-branch rejection tests remain green.

## Resolution
`node tests/groundwork-run.test.js` — 113 passed, 0 failed.
