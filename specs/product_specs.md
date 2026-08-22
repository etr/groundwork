# Groundwork Product Specification

## Terminal task runner

The terminal runner executes each selected task through fresh plan, implement, validate, and finalize processes. It owns the task branch and linked worktree for the complete lifecycle; phase agents receive the already registered workspace and must not create, move, or remove it.

The runner SHALL serialize complete task lifecycles that target the same configured project. It SHALL allow model phases for different projects to overlap while preserving each project's checkpoint, task branch, worktree, and plan output. Repository-wide mutations—including worktree creation/removal, recovery, merge publication, and branch cleanup—SHALL be exclusive.

Before installing or starting the parallel task runner, operators SHALL drain every earlier-version runner process and launcher targeting that repository. Parallel runner versions SHALL NOT be operated together: a detected predecessor `runner.lock` causes v2 startup to fail, but that diagnostic is best-effort and does not make a hot mixed-version launch safe.

A queued repository writer SHALL take priority over new model-phase readers. If the base advances after finalization reports readiness but before publication becomes exclusive, the runner SHALL preserve the task workspace and repeat validation and finalization against the new base before merging.

The runner SHALL reject model-phase mutations to the base branch, inactive task branches, inactive checkpoints, unrelated worktree registrations, Git configuration, hooks, attributes, and local excludes. It MAY admit branch and checkpoint movement only for independently leased peer tasks active during the same interval.

### Autonomous phase recovery

An ordinary phase failure—including malformed or incomplete successful-exit output—SHALL enter one bounded recovery controller. Each recovery attempt SHALL use a fresh model process, receive credential-redacted diagnostics and bounded status summaries, and be limited to the selected task and configured project. The runner SHALL allow no more than two recovery sessions for one failed phase, regardless of whether each attempt changes repository state; the second session is the single stronger retry.

The recovery model's `ready`, `revalidate`, and `needs_user` result is advisory. Independently observed state SHALL determine whether the runner retries the failed phase, returns to validation, or stops at a hard safety or product-decision boundary. A hint alone SHALL NOT interrupt a routine recoverable failure. A recovery request to revalidate finalization, or any accepted finalization recovery mutation, SHALL invalidate prior validation before finalization can run again.

The complete recovery transaction—from the preservation snapshot and fresh model process through post-state checks, exact-path staging, runner-owned sealing, and checkpoint update—SHALL hold the repository writer gate. Before invoking recovery, the runner SHALL preserve the selected worktree bytes, index, metadata, protected refs, registered worktrees, Git controls and configuration, runner checkpoints, the primary worktree, and unrelated registered worktrees. Recovery SHALL reject deletions, unsafe file types, overwrites of pre-existing dirty or untracked content, selected-worktree identity or history changes, and changes outside the configured project. Rejected repository mutations SHALL be restored where runner-owned recovery can do so, with rescue snapshots retained for judgment.

Accepted recovery changes SHALL be regular selected-project files, staged only from an independently revalidated path set, and sealed by the runner in a recovery commit. Any such mutation invalidates the previous validation result. A recovered task SHALL resume the normal lifecycle, publish only after successful validation and finalization, and SHALL NOT prevent later selected tasks from continuing sequentially in the same run. Exhausted recovery or a hard boundary SHALL preserve the task branch and worktree and return an actionable diagnostic.

Interrupted runs SHALL preserve owned workspaces and checkpoints for exact resume. Stale synchronization records SHALL be reclaimed without deleting a successor's lease, and ownership SHALL be bound to a process instance rather than PID alone where the host exposes a process-start identity.
