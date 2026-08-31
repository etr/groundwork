# Debug: Runner worktree ownership

## Status
Fixed

## Symptoms
- The proposed generated-state policy may wrongly assume expensive dependencies live inside task worktrees.
- ArtistAI may keep `.venvs` only under the primary worktree.
- Convention-matching task worktrees should be treated as runner-owned when reused.

## Reproduction
### Command Executed
`git worktree list --porcelain`

`stat` and `du -sh` on the primary and `maillist-TASK-005` `.venvs`

Source inspection of `taskWorkspaceIdentity`, `assertRecoveryBoundaries`, ArtistAI `AGENTS.md`, `scripts/run_tests.py`, and `scripts/project_registry.py`.

### Actual Output
- Primary `.venvs`: created 2026-06-08, 4.7 GB.
- `maillist-TASK-005/.venvs`: created 2026-08-25 after the worktree, currently 2.6 GB; its `dev/pyvenv.cfg` was modified at 19:23 during the task run.
- The two environments contain separate files rather than hard links; the sampled pytest file has distinct inodes and link count 1.
- The runner accepts the exact conventional monorepo identity `.worktrees/maillist-TASK-005` plus `task/maillist/TASK-005`.
- Recovery rejects every content or ignored-state change in the primary worktree.
- The root-lockfile exception operates on the repository root inside the task worktree, not on the primary checkout.

### Expected Output
Confirm the physical location and sharing model of ArtistAI environments, the runner's task-worktree convention, and existing primary-worktree recovery exceptions.

### Matches User Report?
Yes in substance. The primary environment pre-existed and the task run materialized a large second environment. The literal current state is that `.venvs` now exists in both locations.

## Hypotheses

### Active

### Eliminated
- [x] ArtistAI currently has `.venvs` only in the primary worktree: eliminated because six linked worktrees contain `.venvs`, including a 2.6 GB TASK-005 copy.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Listed registered ArtistAI worktrees and `.venvs` locations | TASK-005 uses the exact scoped convention and has a local `.venvs` | Convention is sufficient runner ownership; migration is unnecessary |
| 2 | Compared primary and TASK-005 environment timestamps/sizes/inodes | 4.7 GB primary predates a distinct 2.6 GB worktree environment | Current validation setup duplicates expensive dependencies |
| 3 | Traced primary recovery and root-lockfile tests | Primary content changes are rejected; root lock repair occurs inside the task worktree | Existing exceptions do not permit recovery to update primary ignored environments |
| 4 | Read ArtistAI validation helpers | Tests resolve `.venvs` relative to the current worktree, while PYTHONPATH is already made worktree-safe | Reusing primary environments needs an explicit repository/workspace mechanism, not artifact guessing |
| 5 | Compared interactive `work-on` with runner recovery | `work-on` delegates project setup to the task executor and never snapshots or classifies ignored files; runner recovery hashes, rescues, classifies, and verifies them | Ignored-state complexity was introduced by the runner safety transaction, not required by the skill workflow |

## Root Cause
**Verification level:** Verified

The current policy conflates two independent questions: ownership of the selected conventional worktree and placement of expensive shared development resources. The former is already verifiable by exact path/branch convention. The latter is repository-specific; ArtistAI's command contract currently resolves `.venvs` inside each worktree, causing a large duplicate even though the primary environment already exists. Interactive `work-on` avoided this policy problem because ignored files stayed outside its Git-based task accounting; the runner made ignored bytes part of its recovery transaction.

## Fix
Removed generated-artifact classification. Recovery no longer enumerates, hashes, rescues, restores, or treats as progress any Git-ignored path in the selected conventional task worktree or primary checkout. Unrelated registered worktrees still receive full ignored-state snapshots and rollback protection. Recovery instructions explicitly authorize repository setup to refresh ignored primary or selected state.

## Resolution
TDD regressions failed with 52,230 probes, `Recovery overwrote pre-existing work: .local-runtime/state.db`, and `Recovery changed the primary worktree or base branch`. After the policy change, the runner suite passes 145/145, every repository test suite passes, and `git diff --check` passes.
