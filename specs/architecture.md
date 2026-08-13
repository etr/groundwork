# Groundwork Architecture

## Parallel task-runner synchronization

The task runner coordinates through files under the repository common Git directory. Project leases live in `groundwork/projects/` and scope one full task lifecycle per project. The repository gate lives in `groundwork/repository-gate/`: token-named reader leases admit concurrent model phases, `writer.lock` protects repository-wide mutations, and token-named `writers-waiting/` intents prevent reader barging while a writer is queued.

Lease files are created atomically with exclusive creation and contain a random token, PID, process-start identity, bounded project identity, project-relative path, task ID, and timestamp. Token-named files must agree with their record. Stale removal is serialized by a recovery claim and revalidates the current file while holding that claim, preventing one reclaimer from unlinking a successor lease.

The runner creates the task branch and linked worktree while holding the writer gate, then gives phase agents reader access. A phase snapshot protects all repository refs except the exact task refs belonging to verified live peer project leases. The runner similarly protects every checkpoint except those exact live peers. Full unrelated-worktree cleanliness scans occur at the writer-gated lifecycle boundaries rather than before and after every reader phase; this keeps concurrent phase waves linear instead of producing a scan matrix across all worktrees.

Publication acquires the writer gate and rechecks unrelated worktrees, the base head, validated task head, bookkeeping-only finalization diff, Git controls, and registered workspace identity. A base-head mismatch converts the READY result into revalidation without removing the branch or worktree. Only a successful verified merge may remove the workspace, delete the task branch, and clear the checkpoint.

`info/exclude` initialization is a writer-gated setup responsibility. In a configured monorepo, a runner installs all project plan-ignore entries in one update so later concurrent project setup does not mutate Git controls during another project's reader phase.
