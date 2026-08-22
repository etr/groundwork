# Debug: Dormant Dirty Worktree Blocks Earlier Task

## Status
Fixed

## Symptoms
- A range beginning at TASK-188 fails before implementation because the preserved TASK-278 worktree is dirty.
- Exact error: `TASK-188 failed: Unrelated worktree .../.worktrees/TASK-278 is not clean`.

## Reproduction
### Command Executed
`node -e "require('./bin/groundwork-run.js').snapshotUnrelatedWorktrees('/Users/etr/progs/lam','/Users/etr/progs/lam','/Users/etr/progs/lam/.worktrees/TASK-188')"`

### Actual Output
Exited 1 with `Error: Unrelated worktree /Users/etr/progs/lam/.worktrees/TASK-278 is not clean`, followed by the same staged file list reported by the user.

### Expected Output
The runner starts or resumes TASK-188 while preserving dormant TASK-278 work unchanged.

### Matches User Report?
Yes. The exact production guard and real LAM worktree reproduce the reported failure.

## Hypotheses

### Active
- [x] A checkpoint-owned dormant worktree can be safely preserved if the runner verifies its state does not change during the active task.

### Eliminated

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Traced task setup into `snapshotUnrelatedWorktrees` | Single-project repositories call `assertClean` on every non-active registered worktree | Preserved partial work in TASK-278 is rejected before TASK-188 can run |
| 2 | Compared installed and source runner SHA-256 | Both are `4a050d...eb76` | The failure is in the current implementation, not a stale install |
| 3 | Inspected LAM worktrees and checkpoints | TASK-188 and TASK-278 are registered on their expected branches; both have matching runner checkpoints | TASK-278 is runner-owned recovery state, not an unknown worktree |
| 4 | Executed the production guard on LAM | Exact user-reported error reproduced | Root cause is verified |
| 5 | Added the preservation regression test | Failed with the exact unrelated-worktree cleanliness error | Test proves the missing recovery behavior |
| 6 | Added strict checkpoint/worktree identity matching | Preservation regression passed | Valid dormant runner work no longer blocks a lower task |
| 7 | Added a dormant-worktree mutation test | Failed because the phase mutation went undetected | Simple cleanliness exemption alone was insufficient |
| 8 | Added content-aware state fingerprints and phase/publication checks | Both regressions and all 112 runner tests passed | Preserved work is allowed but protected from cross-task mutation |
| 9 | Re-ran the production guard on LAM | TASK-278 was accepted and fingerprinted without modification | Original failing preflight no longer triggers |

## Root Cause
**Verification level:** Verified

`snapshotUnrelatedWorktrees` treats a single-project repository's entire tree as the selected project and therefore requires every inactive worktree to be clean. Runner-mode failures deliberately preserve partial task worktrees, so a valid checkpoint-owned TASK-278 becomes incompatible with starting the numerically earlier TASK-188.

## Fix
Recognize only dormant worktrees whose checkpoint, task ID, expected branch, and canonical path agree. Fingerprint their staged state, dirty tracked contents, untracked contents, modes, symlinks, and nested Git state. Verify that fingerprint after every model phase and immediately before publication. Unknown dirty worktrees and hidden index flags remain hard failures.

## Resolution
Runner suite: 112 passed, 0 failed. Full repository suite: 368 passed, 0 failed. `git diff --check` passed. The real LAM TASK-278 status remained unchanged throughout diagnosis and verification.
