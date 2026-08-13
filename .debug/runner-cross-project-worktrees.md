# Debug: Runner Cross-Project Worktrees

## Status
Fixed

## Symptoms
- A bottle-budget task range cannot start while TASK-075's ArtistAI worktree has
  uncommitted tracked changes.
- Exact error: `Unrelated worktree .../.worktrees/TASK-075 has tracked content
  that differs from its index`.

## Reproduction
### Command Executed
1. Inspected the actual linked worktrees with
   `git -C /Users/etr/progs/artistai worktree list --porcelain`.
2. Inspected TASK-075 with
   `git -C /Users/etr/progs/artistai/.worktrees/TASK-075 status --porcelain=v2
   --untracked-files=all --ignore-submodules=none`.
3. Ran a temporary-repository integration test with two projects and a linked
   worktree dirty only in the non-selected project.
4. Checked task catalogs for TASK-075 in both real projects.

### Actual Output
- TASK-075 is a registered `task/TASK-075` worktree.
- Its changes are under `packages/artistai`; the selected runner project is
  `bottle-budget`.
- The integration test fails before its model stub with the same
  `Unrelated worktree ... has tracked content that differs from its index` error.
- Both `packages/artistai` and `packages/bottle-budget` define TASK-075, while
  runner branch/worktree identities are currently project-agnostic.

### Expected Output
A run for one monorepo project may coexist with dirty worktrees whose changes are
outside the selected project. The runner must continue protecting the selected
project's counterpart in every unrelated worktree.

### Matches User Report?
Yes. The actual worktree and exact guard path match the reported failure.

## Hypotheses

### Active
None.

### Eliminated
- [x] TASK-075 is unregistered or unsafe: Git reports it as a registered linked
  worktree on `task/TASK-075`.
- [x] TASK-075 contains bottle-budget changes: the reported porcelain entries are
  all under `packages/artistai`.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Traced plan invocation | `invokeChecked()` snapshots every unrelated worktree before calling Codex | Failure occurs before the model process starts. |
| 2 | Read `snapshotUnrelatedWorktrees()` | It calls repository-wide `assertClean()` for each unrelated worktree | The check has repository-wide scope, not selected-project scope. |
| 3 | Inspected TASK-075 porcelain status | Every changed path shown is under `packages/artistai` | A separate package's in-progress work triggers the bottle-budget failure. |
| 4 | Ran cross-project integration test | Same guard failure occurs before the model stub | The cleanliness scope root cause is directly reproduced. |
| 5 | Searched both real task catalogs | Both projects define TASK-075 | Project-agnostic `task/TASK-075` and `.worktrees/TASK-075` identities collide. |
| 6 | Ran overlapping-ID integration test after the fix | bottle-budget TASK-075 receives a project-qualified branch and worktree | Cross-project identity collision is eliminated. |

## Root Cause
**Verification level:** Verified

The runner treats cleanliness of every complete linked worktree as a prerequisite
for every phase. In a monorepo, that conflates unrelated package work with the
selected project's safety boundary and creates a repository-wide exclusivity lock.
It also keys task branches and worktree paths only by TASK-NNN, so overlapping task
IDs across projects can be mistaken for resumable state belonging to the wrong
project.

## Fix
Design-it-twice comparison:

1. Keep global TASK identities and block on collision: shallow change, but prevents
   the requested overlapping-project workflow.
2. Use opaque project hashes in every branch/worktree: collision-resistant but
   makes manual Git operation and recovery needlessly difficult.
3. Use readable project-qualified identities only for monorepos, while preserving
   the existing single-project interface: deepest boundary and best operational
   locality. Recommended: `task/<project>/TASK-NNN` plus
   `.worktrees/<project>-TASK-NNN`.

First incremental change: limit unrelated-worktree cleanliness checks to the
selected project path. Single-project repositories retain repository-wide checks.

Second incremental change: use project-qualified monorepo workspace identities,
persist the chosen identity in the project-scoped checkpoint, and recognize a
legacy unqualified workspace only when old checkpoint state uniquely attributes it
to the selected project.

## Resolution
Regression coverage verifies:

- another project's dirty worktree is allowed;
- selected-project changes in an unrelated worktree remain blocked;
- overlapping monorepo task IDs receive distinct project-qualified identities;
- old unqualified workspaces remain resumable when uniquely owned by the selected
  project's checkpoint.

`bash tests/run-tests.sh` passes.
