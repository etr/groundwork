# Groundwork Architecture

## Parallel task-runner synchronization

The task runner coordinates through files under the repository common Git directory. Project leases live in `groundwork/projects/` and scope one full task lifecycle per project. The repository gate lives in `groundwork/repository-gate/`: token-named reader leases admit concurrent model phases, `writer.lock` protects repository-wide mutations, and token-named `writers-waiting/` intents prevent reader barging while a writer is queued.

Lease files are created atomically with exclusive creation and contain a random token, PID, process-start identity, bounded project identity, project-relative path, task ID, and timestamp. Token-named files must agree with their record. Stale removal is serialized by a recovery claim and revalidates the current file while holding that claim, preventing one reclaimer from unlinking a successor lease.

The runner creates the task branch and linked worktree while holding the writer gate, then gives phase agents reader access. A phase snapshot protects all repository refs except the exact task refs belonging to verified live peer project leases. The runner similarly protects every checkpoint except those exact live peers. Full unrelated-worktree cleanliness scans occur at the writer-gated lifecycle boundaries rather than before and after every reader phase; this keeps concurrent phase waves linear instead of producing a scan matrix across all worktrees.

Publication acquires the writer gate and rechecks unrelated worktrees, the base head, validated task head, bookkeeping-only finalization diff, Git controls, and registered workspace identity. A base-head mismatch converts the READY result into revalidation without removing the branch or worktree. Only a successful verified merge may remove the workspace, delete the task branch, and clear the checkpoint.

`info/exclude` initialization is a writer-gated setup responsibility. In a configured monorepo, a runner installs all project plan-ignore entries in one update so later concurrent project setup does not mutate Git controls during another project's reader phase.

### In-place upgrade compatibility

Before joining the repository-gate protocol, a runner inspects the deployed predecessor's `groundwork/runner.lock`. A structurally valid live legacy lease causes the new runner to wait; a malformed or stale legacy record fails closed and is preserved for manual recovery. At every repository-writer boundary, the new runner also holds a legacy-compatible `runner.lock` until it has released its writer gate. Consequently, a main-version runner and a new writer cannot both enter repository-wide mutation: each sees the other version's live lease before proceeding. The compatibility barrier exists only for writer boundaries, so it does not serialize independent new-protocol reader phases.

### Model-process threat boundary

Linked worktrees, scoped leases, and post-phase snapshots protect against accidental or buggy model-phase mutations. They are not an isolation boundary against a hostile child process running as the same OS user: such a child can locate the Git common directory and deliberately alter lock files. Lease identity checks detect tampering when the parent releases a lease, but cannot undo mutation admitted during that interval. Enforcing hostile-process isolation would require an OS sandbox or private clones outside the child-writable Git directory; the runner intentionally does not provide that guarantee.
