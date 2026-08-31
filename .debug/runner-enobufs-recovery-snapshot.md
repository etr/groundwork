# Debug: Runner ENOBUFS During Implementation Recovery

## Status
Fixed

## Symptoms
- TASK-192 in `/Users/etr/progs/lam` reported `implement failed after 09:37`.
- Terminal result: `RESULT: FAILURE | TASK-192 failed: spawnSync git ENOBUFS`.
- Runner preserved `/Users/etr/progs/lam/.worktrees/TASK-192` on `task/TASK-192`.

## Reproduction
### Command Executed
From the preserved TASK-192 worktree, executed Node's `execFileSync` with the installed runner's exact safe Git arguments for:

`git ls-files --others --ignored --exclude-standard -z`

### Actual Output
`spawnSync git ENOBUFS`; `code=ENOBUFS`; 1,114,112 stdout bytes were captured before termination. Streaming the same Git command completed with 1,376,026 bytes.

### Expected Output
The runner should preserve the implementation failure diagnostic and enter bounded recovery without exhausting a synchronous child-process buffer.

### Matches User Report?
Yes. The executable and exact error match. The installed runner and repository source have identical SHA-256 hashes.

## Hypotheses

### Active

### Eliminated
- [x] The `ENOBUFS` came from the implementation model process: eliminated because model stdout/stderr are file-backed and the exact buffered recovery Git call independently reproduces the reported error.
- [x] Git itself fails: eliminated because the same command completes when stdout is streamed.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Inspected preserved worktree and checkpoint | Plan is checkpointed; implementation changes are preserved but no implementation checkpoint exists | Failure occurred before implementation acceptance/finalization |
| 2 | Read runner Git helpers and recovery snapshot | `forEachGitRecord` is bounded-memory, but `recoveryStatusSnapshot` calls `execGit(... ls-files --others --ignored ... -z)` | Recovery reintroduced the already-known unbounded-listing failure class |
| 3 | Ran the installed runner's exact buffered Git call in TASK-192 | `spawnSync git ENOBUFS`, code `ENOBUFS`, after 1,114,112 stdout bytes | Exact runner subprocess boundary reproduced |
| 4 | Streamed the same Git command to `wc -c` | Git completed and emitted 1,376,026 bytes | Output size, not Git failure, triggers the exception |
| 5 | Traced `invokeChecked` into `invokeRecovery` | Any implementation result/process failure enters recovery; `observeRecoveryState` immediately calls `recoveryStatusSnapshot` | The recovery snapshot masks the preceding implementation diagnostic |

## Root Cause
**Verification level:** Verified

`recoveryStatusSnapshot` obtains LAM's potentially unbounded ignored-file list through `execGit`, which uses `execFileSync` with Node's default synchronous output buffer. TASK-192's ignored listing is 1,376,026 bytes, so Node terminates Git at the buffer boundary and reports `spawnSync git ENOBUFS` while the runner is trying to enter recovery. The earlier implementation failure is consequently masked; its ephemeral phase files are deleted by `invokePhase` cleanup.

## Fix
Changed `recoveryStatusSnapshot` to consume the NUL-delimited ignored-file listing through the existing file-backed `forEachGitRecord` helper instead of `execGit`/`execFileSync`. Added a full runner regression whose ignored listing exceeds Node's synchronous child-process buffer and which exercises failure recovery through task completion.

## Resolution
- RED: focused runner suite reproduced `TASK-004 failed: spawnSync git ENOBUFS`; 138 passed, 1 failed.
- GREEN: focused runner suite passed 139/139.
- Full repository gate: `bash tests/run-tests.sh` passed every suite.
- `git diff --check` passed.
- Installed `/Users/etr/.codex/groundwork-run.js` matches the validated source hash.
- Installed bounded reader processed TASK-192's exact 23,314 ignored records / 1,376,026 bytes.
- TASK-192 resume passed implementation and entered recovery without ENOBUFS. It then stopped on a separate LAM validation prerequisite: missing `lam-ai` build output.
