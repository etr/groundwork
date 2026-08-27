# Groundwork Product Specification

## Terminal task runner

The terminal runner executes each selected task through fresh plan, implement, validate, and finalize processes. It owns the task branch and linked worktree for the complete lifecycle; phase agents receive the already registered workspace and must not create, move, or remove it.

The runner SHALL serialize complete task lifecycles that target the same configured project. It SHALL allow model phases for different projects to overlap while preserving each project's checkpoint, task branch, worktree, and plan output. Repository-wide mutations—including worktree creation/removal, recovery, merge publication, and branch cleanup—SHALL be exclusive.

Before installing or starting the parallel task runner, operators SHALL drain every earlier-version runner process and launcher targeting that repository. Parallel runner versions SHALL NOT be operated together: a detected predecessor `runner.lock` causes v2 startup to fail, but that diagnostic is best-effort and does not make a hot mixed-version launch safe.

A queued repository writer SHALL take priority over new model-phase readers. If the base advances after finalization reports readiness but before publication becomes exclusive, the runner SHALL preserve the task workspace and repeat validation and finalization against the new base before merging.

The runner SHALL reject model-phase mutations to the base branch, inactive task branches, inactive checkpoints, unrelated worktree registrations, Git configuration, hooks, attributes, and local excludes. It MAY admit branch and checkpoint movement only for independently leased peer tasks active during the same interval.

### Semantic progress and durable status

While a task is running without `--verbose`, the runner SHALL display concise runner-owned lifecycle state and exact accepted gate, validation-stage, repair-result, and next-step markers; it SHALL NOT display ordinary provider activity or raw provider JSON. When `--verbose` is selected, the runner SHALL additionally display bounded, credential-redacted activity summaries without adding that activity to the concise human log.

For each selected project and task, the runner SHALL append versioned structured events to `events.jsonl`, concise semantic records to `runner.log`, and a normalized diagnostic transcript to `transcript.jsonl` under the repository common Git directory. The transcript SHALL be written while each harness phase is running and SHALL contain bounded credential-redacted activity, user-visible phase-agent messages, reviewer-batch states, accepted semantic markers, and bounded tool output. It SHALL NOT persist raw provider records, hidden reasoning, terminal controls, or unbounded text. Oversized transcript messages SHALL record explicit truncation metadata.

The runner SHALL accept provider-authored semantic progress only from an exact `GROUNDWORK_RUNNER_EVENT ` prefix followed by a version-1 marker whose type-specific fields, enums, counts, names, and text bounds match the declared schema with no extra keys. Provider-derived text SHALL be credential-redacted and SHALL NOT contain terminal controls, DEL, bidirectional formatting controls, or C0/C1 controls other than normalized line breaks and tabs inside multiline transcript messages before it reaches terminal output, a durable artifact, or status projection.

### Advisory task-executor project memory

The runner MAY discover bounded Groundwork-owned or plugin-scoped Claude task-executor memory and freeze one immutable, credential-safe snapshot for a task implementation. Only the implementation phase receives that snapshot; plans, validation, finalization, recovery, receipts, checkpoints, and terminal reporting do not. Existing repository rules, task/specifications, `AGENTS.md`, `CLAUDE.md`, and runner instructions override memory. A retry or resumed implementation reuses the exact frozen snapshot rather than live memory.

Implementation may optionally leave a bounded versioned learning proposal in a runner-owned sidecar location. The runner MAY validate, deduplicate, and publish it only after a verified merge and workspace cleanup. Discovery, snapshots, proposal handling, locking, compare-and-swap, and publication are best-effort and fail open: malformed, stale, secret-bearing, unavailable, contended, conflicting, or failed memory must not delay, fail, recover, reopen, or otherwise affect lifecycle outcomes, validation, receipts, commits, merges, cleanup, or sealed completion. Memory never contains project-specific dependency or `.venv` reuse guidance.

When an operator invokes `groundwork-run status TASK-NNN`, the runner SHALL require exactly one task and no harness, read only the newest valid run plus its identity-bound active validation session, tolerate a truncated final record, and report its latest phase, validation round, validation stage, per-reviewer state, gate, and terminal state. When an operator invokes `groundwork-run logs TASK-NNN`, the runner SHALL render the newest run's normalized transcript, support a bounded `--tail`, and with `--follow` stream appended records until that run becomes terminal. Failed tool output SHALL be shown by default; successful tool output SHALL require `--include-tool-output`. Status and logs SHALL NOT acquire or create a project lease or repository gate, invoke a harness, repair reporting state, or mutate any reporting or synchronization artifact.

### Autonomous phase recovery

An ordinary phase failure—including malformed or incomplete successful-exit output—SHALL enter one bounded recovery controller. Each recovery attempt SHALL use a fresh model process, receive credential-redacted diagnostics and bounded status summaries, and be limited to the selected task and configured project. The runner SHALL allow no more than two recovery sessions for one failed phase, regardless of whether each attempt changes repository state; the second session is the single stronger retry.

The recovery model's `ready`, `revalidate`, and `needs_user` result is advisory. Independently observed state SHALL determine whether the runner retries the failed phase, returns to validation, or stops at a hard safety or product-decision boundary. A hint alone SHALL NOT interrupt a routine recoverable failure. A recovery request to revalidate finalization, or any accepted finalization recovery mutation, SHALL invalidate prior validation before finalization can run again.

The complete recovery transaction—from the preservation snapshot and fresh model process through post-state checks, exact-path staging, runner-owned sealing, and checkpoint update—SHALL hold the repository writer gate. Before invoking recovery, the runner SHALL preserve the selected worktree bytes, index, metadata, protected refs, registered worktrees, Git controls and configuration, runner checkpoints, the primary worktree, and unrelated registered worktrees. Recovery SHALL reject deletions, unsafe file types, overwrites of pre-existing dirty or untracked content, selected-worktree identity or history changes, and changes outside the configured project. Rejected repository mutations SHALL be restored where runner-owned recovery can do so, with rescue snapshots retained for judgment.

Accepted recovery changes SHALL be regular selected-project files, staged only from an independently revalidated path set, and sealed by the runner in a recovery commit. Any such mutation invalidates the previous validation result. A recovered task SHALL resume the normal lifecycle, publish only after successful validation and finalization, and SHALL NOT prevent later selected tasks from continuing sequentially in the same run. Exhausted recovery or a hard boundary SHALL preserve the task branch and worktree and return an actionable diagnostic.

Interrupted runs SHALL preserve owned workspaces and checkpoints for exact resume. Stale synchronization records SHALL be reclaimed without deleting a successor's lease, and ownership SHALL be bound to a process instance rather than PID alone where the host exposes a process-start identity.
