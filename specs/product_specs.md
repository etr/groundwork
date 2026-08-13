# Groundwork Product Specification

## Terminal task runner

The terminal runner executes each selected task through fresh plan, implement, validate, and finalize processes. It owns the task branch and linked worktree for the complete lifecycle; phase agents receive the already registered workspace and must not create, move, or remove it.

The runner SHALL serialize complete task lifecycles that target the same configured project. It SHALL allow model phases for different projects to overlap while preserving each project's checkpoint, task branch, worktree, and plan output. Repository-wide mutations—including worktree creation/removal, recovery, merge publication, and branch cleanup—SHALL be exclusive.

Before installing or starting the parallel task runner, operators SHALL drain every earlier-version runner process and launcher targeting that repository. Parallel runner versions SHALL NOT be operated together: a detected predecessor `runner.lock` causes v2 startup to fail, but that diagnostic is best-effort and does not make a hot mixed-version launch safe.

A queued repository writer SHALL take priority over new model-phase readers. If the base advances after finalization reports readiness but before publication becomes exclusive, the runner SHALL preserve the task workspace and repeat validation and finalization against the new base before merging.

The runner SHALL reject model-phase mutations to the base branch, inactive task branches, inactive checkpoints, unrelated worktree registrations, Git configuration, hooks, attributes, and local excludes. It MAY admit branch and checkpoint movement only for independently leased peer tasks active during the same interval.

Interrupted runs SHALL preserve owned workspaces and checkpoints for exact resume. Stale synchronization records SHALL be reclaimed without deleting a successor's lease, and ownership SHALL be bound to a process instance rather than PID alone where the host exposes a process-start identity.
