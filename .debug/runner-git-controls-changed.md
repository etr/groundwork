# Debug: Runner Git Controls Changed

## Status
Fixed

## Symptoms
- ArtistAI `TASK-074` implementation ran for 13 minutes 33 seconds, then the runner rejected the phase.
- Exact error: `Repository Git config, hooks, or info attributes changed during a model phase`

## Reproduction
### Command Executed
`node tests/groundwork-run.test.js`

### Actual Output
The integration reproduction creates a real Git repository and task worktree, changes
`core.hooksPath` from the primary checkout to the task worktree during the real
`runTasks` implementation boundary, and fails with:

`Error: TASK-004 failed: Repository Git config, hooks, or info attributes changed during a model phase`

### Expected Output
Normal implementation Git operations complete without changing protected repository execution controls, or the runner reports the exact changed control path.

### Matches User Report?
Yes. It reaches the same post-implementation integrity check and emits the same failure.

## Hypotheses

### Active
- [x] A narrow compare-and-restore of `core.hooksPath` is safe when the only new value is an absolute, real directory inside the selected task worktree; the full protected-control fingerprint must still match afterward.

### Eliminated
- [x] Worktree creation alone changes the protected controls: eliminated because existing implementation tests create worktrees without triggering this invariant.
- [x] The runner itself selected the hooks path: eliminated because ArtistAI's `scripts/setup_local_dev.py` explicitly runs `git config core.hooksPath <project_root>/scripts/githooks`.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | User ran the installed runner | Failure occurred only after the implementation child exited | The failure comes from the post-phase `invokeChecked` integrity check, not result parsing. |
| 2 | Inspected preserved ArtistAI `.git/config` | `core.hooksPath` points at `.worktrees/TASK-074/scripts/githooks`; config mtime is the failure time | The implementation phase persistently rewrote the common clone config. |
| 3 | Inspected ArtistAI setup code | `install_git_hooks()` runs that exact `git config` command | The path and writer are directly identified. |
| 4 | Ran the integration reproduction | The new test fails at `assertGitControls` with the user-reported error | Root cause is reproduced through the real orchestration boundary. |
| 5 | Restored the semantic hook value and reran | The invariant still failed in a `/var` temp path | The containment comparison mixed lexical and canonical macOS paths. |
| 6 | Canonicalized the target before containment and reran | The recurrence test passed | The narrow phase rollback works without weakening the full control snapshot. |
| 7 | Added a resume test with an already leaked hook path | It initially left a dangling worktree path after cleanup, then passed after relocation was added | Existing failed runs now recover before deleting their worktrees. |
| 8 | Extended recovery through a second selected task | The old control baseline rejected the next phase; refreshing the baseline after verified recovery made both tasks pass | Batch execution now continues safely after repairing a prior leaked path. |

## Root Cause
**Verification level:** Verified

ArtistAI's local-dev setup runs from the task worktree and writes its absolute
`scripts/githooks` directory into the clone-wide `.git/config`. The runner snapshots
that file before each model phase, so the persistent rewrite correctly trips the
post-phase integrity invariant. Worktree creation itself is not the cause. The guard
currently cannot distinguish this narrow, reversible setup side effect from a
malicious persistent Git-control change, so it rejects a successfully implemented task.

## Fix
Before each model phase, the runner records local `core.hooksPath` values. If the
phase changes that setting to one absolute, real directory inside the selected task
worktree, the runner restores the exact prior semantic value and then applies the
unchanged full Git-control fingerprint check. All other control changes still fail.

Before successful cleanup, a previously leaked absolute hook path inside the task
worktree is relocated to the same real directory in the primary checkout. If no safe
primary replacement exists, cleanup stops and preserves the worktree.

## Resolution
Focused runner suite and full repository suite pass with recurrence and
interrupted-run/batch recovery coverage. Syntax and diff-whitespace checks also pass.
The global Codex install was refreshed and its runner SHA-256 matches the source.
