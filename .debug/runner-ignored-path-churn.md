# Debug: Runner Ignored Path Churn

## Status
Fixed

## Symptoms
- A real Codex planning run for `TASK-074` failed after the phase with: `The ignored path set in the base worktree changed during a model phase`.
- Ignored files are outside Git's tracked/untracked cleanliness model and normal tools may create ignored caches while merely reading or testing a project.

## Reproduction
### Command Executed
`node tests/groundwork-run.test.js`

### Actual Output
The regression test `does not replace a phase result when a tool creates an ignored cache path` failed with:

`Error: TASK-004 failed: The ignored path set in the base worktree changed during a model phase`

### Expected Output
The runner should preserve the phase's own result instead of failing because a tool created an ignored cache path.

### Matches User Report?
Yes. The real `runTasks` path replaced the planning result after a phase created one ignored cache file.

## Hypotheses

### Active
- [x] The invariant is intrinsically too strict: hashing the ignored pathname set treats ordinary cache creation as repository corruption.

### Eliminated

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Traced `runTasks -> invokeChecked -> assertIgnoredPaths` | The baseline is captured before any phase and compared in `finally` after every phase. | Any ignored pathname addition/removal replaces the model result with the invariant failure.
| 2 | Ran the runner regression with a phase that creates `.cache/tool-state` | The expected `planning blocked` error was replaced by the exact ignored-path-set failure. | The ignored-path invariant directly causes the reported failure.

## Root Cause
**Verification level:** Verified

`snapshotIgnoredPaths` hashes the complete ignored pathname set before the first model phase. `invokeChecked` compares that hash after every phase. Normal project tools create and remove ignored caches, so ordinary tool side effects violate an invariant that is unrelated to Git merge safety. The regression reproduced the exact user-facing error through `runTasks`.

## Fix
Removed ignored-path snapshots from the phase and unrelated-worktree integrity checks. The runner still protects tracked files, ordinary untracked files, refs, registered worktrees, task plans, Git controls, branches, and validated heads. Ignored build/cache state is no longer treated as transactional Git state.

## Resolution
The regression now advances from a successful plan that creates `.cache/tool-state` into implementation. `node tests/groundwork-run.test.js` passes.
