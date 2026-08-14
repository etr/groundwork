# Unworked Review Issues

**Run:** 2026-08-13 17:02:01
**Task:** manual-validation
**Total:** 43 (0 critical, 29 major, 14 minor)

## Major

1. [ ] **architecture-alignment-checker** | `bin/groundwork-run.js:2171` | pattern-violation
   A runner acquires its project lease and writes a newly created workspace checkpoint before it obtains `releaseWorkspaceGate` (the writer gate starts at line 2173). A peer reader that already snapshotted checkpoint files and live peers at lines 2090-2096 therefore sees this new checkpoint as an unauthorized mutation at line 2106. This makes ordinary concurrent task startup fail, despite the architecture requiring writer-gated lifecycle setup before concurrent reader phases and checkpoint exceptions only for exact peers established in the snapshot.
   *Recommendation:* Acquire the writer gate before creating or first persisting the task checkpoint, and keep checkpoint initialization with branch/worktree preparation inside that writer-gated setup boundary. Add a two-runner regression test where one runner is in a reader phase while another begins a fresh task; the second must wait, then initialize its checkpoint and workspace without invalidating the first phase.

2. [ ] **architecture-alignment-checker** | `bin/groundwork-run.js:2724` | pattern-violation
   The writer-gated publication path rechecks unrelated worktrees and the base head, then calls mergeAndCleanup, but neither that block nor mergeAndCleanup compares the current Git controls to the task baseline. The only assertGitControls call is in invokeChecked after a reader-held model phase (line 2357), so a control-file/config change occurring after finalize returns and before or while publication waits for writer access is accepted. This conflicts with the publication contract in specs/architecture.md:11, which requires Git controls to be rechecked under the writer gate before merge and cleanup.
   *Recommendation:* Inside the publication writer-gate block, before mergeAndCleanup (and before any intentional hooks-path relocation), call assertGitControls(commonDir, gitControls) and re-run assertNoCommandGitConfig(repoRoot). Add an integration test that mutates a tracked Git-control input between READY_TO_MERGE and writer-gate acquisition and expects publication to abort while retaining the task workspace.

3. [ ] **architecture-alignment-checker** | `bin/groundwork-run.js:851` | pattern-violation
   The atomic publisher creates `.staging-*` files in the project-lease directory (lines 532-575), but `activeProjectOwners` accepts only final lease filenames and does not exempt staging files. If a runner is terminated after creating a staging file, every peer reader phase reaches this scan and fails with `Project lease filename is invalid`, even though no lease was ever published. This violates the architecture's coordination/recovery invariant that in-progress lease publication must not block concurrent task lifecycles.
   *Recommendation:* Treat the publisher's exact `.staging-*` namespace as non-authoritative in `activeProjectOwners` (and optionally remove safely under the lease-mutation protocol), then add a crash-leftover test proving a stale project staging file neither becomes an owner nor blocks a peer phase.

4. [ ] **architecture-alignment-checker** | `bin/groundwork-run.js:891` | pattern-violation
   `publishRecordAtomically` writes `.staging-*` files in the project-lease directory before final publication, but `activeProjectOwners` only exempts `.reclaim.lock` and `.lease-mutation` before rejecting every other non-token filename. If a runner is terminated after staging-file creation, a later peer phase fails with `Project lease filename is invalid` even though no lease was published. This violates the architecture's file-coordination/recovery model by turning an abandoned pre-publication artifact into a repository-wide coordination failure.
   *Recommendation:* Ignore the publisher's exact `.staging-*` namespace in `activeProjectOwners` (or safely reclaim it under the mutation protocol), and add a crash-leftover regression test showing that such a file neither becomes an owner nor blocks a peer reader phase.

5. [ ] **code-quality-reviewer** | `bin/groundwork-run.js:560` | error-handling
   waitForLegacyRunnerDrain returns for any record carrying protocol: 'repository-gate-v2' before checking whether its PID is still live. After a new runner crashes, its stale compatibility runner.lock therefore lets a new-protocol reader begin with no writer.lock. A still-deployed main-version runner can then observe that stale PID, unlink runner.lock, acquire its legacy lease, and mutate repository-wide state while the reader phase is active.
   *Recommendation:* Check legacy.live before accepting the compatible protocol marker (and fail closed/preserve stale records), then add a regression test proving a stale protocol-marked runner.lock cannot admit a reader that overlaps a main-version acquireRunnerLease call.

6. [ ] **code-quality-reviewer** | `bin/groundwork-run.js:574` | error-handling
   If directory fsync fails after linkSync has published finalPath and the compensating unlinkSync(finalPath) also fails (for example, an I/O failure), this catch throws while leaving the final lease present. The caller receives no release handle, but other runners see the current process as a live holder and wait until it exits. The new staging-cleanup test covers only cleanup failure after a successful publication, not this post-link double-failure path.
   *Recommendation:* Once the final link exists, preserve ownership and return a releasable acquisition (report the durability warning separately), or otherwise guarantee a cleanup/release path before throwing. Add a regression test that injects both the post-link fsync failure and final-lease unlink failure.

7. [ ] **code-quality-reviewer** | `bin/groundwork-run.js:684` | error-handling
   `liveLeaseFiles` iterates a non-atomic directory snapshot and calls `readLiveLease` for each name without treating `ENOENT` as a concurrent release. A reader or writer can release its token lock after `readdirSync` but before `inspectLease` calls `lstatSync`, causing an uncaught ENOENT and aborting another otherwise-valid runner. The same release race is reachable through the writer existence check at lines 738–740 and project-owner scan at line 704.
   *Recommendation:* Make lease inspection/scans tolerate ENOENT as an absent lease and retry the gate decision (or centralize this in `readLiveLease`); add a deterministic test that removes a reader/intent/writer lock between enumeration/existence check and inspection.

8. [ ] **code-quality-reviewer** | `bin/groundwork-run.js:693` | correctness
   After selecting one nearest lower ticket, the code enters the mutation critical section as soon as that ticket disappears without re-evaluating older tickets. If ticket 2 dies while it is waiting for still-live ticket 1, ticket 3 observes ticket 2 gone and proceeds concurrently with ticket 1. I reproduced this by leaving ticket 1 live, removing immediate predecessor ticket 2 from the injected wait callback, and observing a reader lease publish while ticket 1 remained.
   *Recommendation:* After a selected predecessor disappears or is reclaimed as stale, rescan for the nearest live lower ticket and continue waiting until none exists. Add a regression test with two lower tickets where the immediate predecessor vanishes before the older ticket releases, asserting no lease is published until both have cleared.

9. [ ] **code-quality-reviewer** | `bin/groundwork-run.js:806` | correctness
   A stale legacy .reclaim.lock now aborts recovery and requires manual deletion. Consequently, a crashed runner that left both a stale target lease and recovery record cannot resume automatically, contrary to the stated requirement that stale synchronization records be reclaimed. The updated test at tests/groundwork-run.test.js:378 explicitly codifies this outage rather than a recoverable migration path.
   *Recommendation:* Introduce a versioned or isolated migration protocol that can safely coexist with legacy reclaimers while allowing stale legacy state to drain automatically; add a crash-recovery integration test. If manual intervention is an intentional product constraint, document the exception in the product specification and user-facing recovery guidance.

10. [ ] **code-simplifier** | `bin/groundwork-run.js:1207` | code-structure
   withoutRef, withoutWorktree, snapshotRunnerState, assertRunnerState, snapshotTaskRunnerState, and assertTaskRunnerState are unreachable after the map/file snapshot implementation; only their definitions remain. This leaves an obsolete, competing checkpoint/ref-validation model in the 2,800-line runner.
   *Recommendation:* Remove the superseded helpers and retain refSnapshotMap/assertRepositoryTransition plus snapshotRunnerFiles/assertRunnerTransition as the single active state-validation path. These are private, unexported functions, so this cleanup preserves runtime behavior while reducing misleading surface area.

11. [ ] **code-simplifier** | `bin/groundwork-run.js:1849` | code-structure
   invokeChecked acquires the repository reader gate before constructing repositoryState, while the try/finally that releases the gate begins afterward. Any error from snapshotRepositoryRefs, snapshotWorktreeRegistry, snapshotUnrelatedWorktrees, snapshotTaskRunnerState, or readLocalHooksPaths therefore leaves the gate held and can make later runs wait indefinitely.
   *Recommendation:* Put state capture and callPhase inside one outer try/finally immediately after acquisition, with releaseGate in that outer finally; retain the existing post-phase assertions in an inner cleanup block. This makes the ownership lifetime explicit and preserves all checks while releasing on every error path.

12. [ ] **code-simplifier** | `bin/groundwork-run.js:2066` | code-structure
   invokeChecked acquires releaseGate, then performs activeProjectOwners and all repository/runner snapshots before entering the try/finally. A malformed peer lease or any snapshot/readLocalHooksPaths error therefore skips releaseGate and leaks the reader lease.
   *Recommendation:* Enter the try immediately after acquireRepositoryGate (or use a nested setup try/finally) so releaseGate is guaranteed for snapshot construction as well as phase invocation and post-phase validation.

13. [ ] **code-simplifier** | `bin/groundwork-run.js:2084` | lifecycle
   invokeChecked acquires the repository read gate, then performs activeProjectOwners and repository-state snapshots before entering the try/finally that releases the gate. The new peer scan now performs checkpoint parsing, realpath resolution, and Git worktree enumeration, all of which can throw and leave the read lease behind.
   *Recommendation:* Start the cleanup scope immediately after acquireRepositoryGate (or wrap peer enumeration and all pre-phase snapshots in the existing finally), so every failure after acquisition releases the gate before propagating the error. Keep the assertion cleanup in the nested scope so its existing error behavior is preserved.

14. [ ] **code-simplifier** | `bin/groundwork-run.js:402` | code-structure
   acquireRunnerLease still contains its own lease serialization, JSON parsing, PID liveness check, stale-file cleanup, heartbeat loop, and ownership-checked release, while the new createOwnedLease/readLiveLease/waitForLease helpers implement the same concerns for project and repository leases. Keeping two implementations creates drift (for example, token validation and error wording differ) and makes the concurrency code harder to audit.
   *Recommendation:* Extract a parameterized file-lease primitive for record creation, liveness/reclamation, waiting, and token-checked release, then implement acquireRunnerLease, acquireProjectLease, and acquireRepositoryGate in terms of it. Preserve the public acquireRunnerLease API and its existing log/error context through options rather than deleting the compatibility surface.

15. [ ] **code-simplifier** | `bin/groundwork-run.js:410` | code-structure
   Lease mutation, stale-record recovery, atomic publication, project leases, and the repository gate form roughly 680 lines of a single CLI module that is already about 2,900 lines long. This mixes multi-process synchronization with task orchestration and makes the concurrency invariants harder to review or reuse.
   *Recommendation:* Extract the synchronization subsystem into a focused module (for example, lib/runner-leases.js) with the existing dependency-injection hooks and a small public surface for project leases, repository gates, and active-owner discovery; keep bin/groundwork-run.js responsible for phase orchestration. Preserve the current filesystem protocol and tests while moving the implementation behind that seam.

16. [ ] **code-simplifier** | `bin/groundwork-run.js:574` | cleanup-paths
   The final staging-file unlink is outside the guarded transaction. If unlinking the staging path fails after the hard link has published the lease, the function throws with the final lease still present, so the caller can report acquisition failure while leaving an owned lease behind.
   *Recommendation:* Keep staging unlink inside the same guarded cleanup path (or use an idempotent finalizer) so any post-publication failure removes both the final and staging paths before rethrowing. Preserve the original error when cleanup succeeds and surface cleanup failure only when necessary.

17. [ ] **code-simplifier** | `bin/groundwork-run.js:635` | code-structure
   The new lease-mutation protocol (choosing entries, ticket assignment, predecessor election, stale-entry removal, waiting, and rollback) is a roughly 60-line synchronization module embedded directly in the already 2,783-line runner.
   *Recommendation:* Extract this protocol behind a small internal acquire/release module or focused helper object, preserving the existing dependency hooks and path-safety helpers. Keep createOwnedLease/reclaimStaleLease responsible only for lease semantics and let the mutation module own its election invariants.

18. [ ] **code-simplifier** | `bin/groundwork-run.js:672` | code-structure
   activeProjectOwners now combines lease-directory traversal, checkpoint identity validation, legacy/scoped workspace-name construction, realpath checks, and Git worktree authorization in one function. The legacy/scoped candidate mapping is also duplicated in taskWorkspaceIdentity around lines 1254-1283, so the two authorization paths can drift.
   *Recommendation:* Extract a shared workspace-candidate helper and a focused peer-workspace resolver. Let activeProjectOwners retain only lease iteration and owner collection, while taskWorkspaceIdentity and peer authorization consume the same branch/path mapping. This preserves the current identities while making the security boundary easier to review.

19. [ ] **code-simplifier** | `bin/groundwork-run.js:715` | lifecycle
   When the first choosing-entry unlink fails, the catch block retries it, records the cleanup error, removes the ticket, and rethrows; if that second unlink also fails, the process leaves its choosing entry behind. A later acquisition from the same still-live process sees that entry as a contender and can wait indefinitely, while the added test only asserts that the ticket directory is empty.
   *Recommendation:* Centralize mutation-entry cleanup and make the failure state explicit so a failed acquisition cannot leave a self-owned choosing entry that future acquisitions treat as live; extend the regression test to assert both choosing and tickets directories are clean (or that the retained entry is safely recoverable) before returning the original error.

20. [ ] **code-simplifier** | `bin/groundwork-run.js:749` | code-structure
   acquireRepositoryGate creates reader and writer leases before all post-acquisition checks are covered by cleanup. If liveLeaseFiles, readLiveLease, report/wait, or releaseIntent throws, readerPath or writer.lock can remain behind and make later runs wait forever.
   *Recommendation:* Put the complete post-create acquisition loop under one ownership-safe try/finally, retaining the release callback only on successful acquisition and releasing every lease already created on exceptional exits (including the writer lock before rethrowing and the writer intent).

21. [ ] **code-simplifier** | `bin/groundwork-run.js:970` | code-structure
   acquireRepositoryGate contains two complete protocols—reader admission and writer-intent/writer admission—with nested polling loops and separate release-on-error branches in one function. The mode-specific ownership lifetimes are difficult to audit and every gate change requires navigating both workflows.
   *Recommendation:* Split the reader and writer paths into focused acquireReadGate and acquireWriteGate helpers, leaving acquireRepositoryGate as a small mode validator/dispatcher with shared path and dependency setup. Preserve the existing wait hooks, writer priority, and release behavior in each helper.

22. [ ] **performance-reviewer** | `bin/groundwork-run.js:585` | resource-leak
   After a successful hard-link publication, a non-ENOENT staging unlink failure is deliberately swallowed. The orphan retains a valid record for the still-live runner, so reclaimStaleStagingEntries will not remove it; moreover, writer.lock staging files live in the repository-gate root, which is never swept. Repeated cleanup failures during a long task wave therefore grow staging files and directory-scan work without a bound.
   *Recommendation:* Retain a bounded retry/cleanup queue after publication and sweep every final-path directory, including the repository-gate root. Safely recognize a published staging file via its link count (or equivalent final-file identity) so it can be removed even while its owner is live; retain the current age/dead-owner rule only for unlinked, in-progress staging files.

23. [ ] **security-reviewer** | `bin/groundwork-run.js:2149` | data-integrity
   startupRecordIsCurrent checks the marker, exact parent identity, and deadline before creating and fsyncing a staging file, but renameSync replaces the marker later without participating in the lease-mutation protocol (CWE-362). In the normal dual-record order, the supervisor can upgrade the project marker, validate the reader startup marker while the parent is still live, and then pause. If the parent dies after the 10-second deadline, another runner can reclaim the expired reader lease and acquire the writer gate. When the supervisor resumes, line 2176 recreates the old reader child record even though its parent lease is gone, then execs the harness; the old phase and the new writer can consequently mutate the repository concurrently. This is possible under the supported cooperative-crash model and defeats the intended stale cleanup/reclaim boundary.
   *Recommendation:* Make validation and replacement of all project/reader startup records one serialized handoff with lease reclamation: acquire the applicable lease-mutation locks in a stable global order, revalidate that every parent lease and startup marker has the exact expected identity, atomically replace all markers with the supervisor's exact identity, and only then release the locks and exec. If any parent lease or marker changed, remove only records still matching the old identity and exit. Add a deterministic regression test that pauses the supervisor after validating the second marker, kills the parent, advances past the deadline, lets a writer reclaim the reader lease, and proves the delayed supervisor cannot exec or recreate authority afterward.

24. [ ] **security-reviewer** | `bin/groundwork-run.js:2393` | broken-access-control
   CWE-284/CWE-667: Repository exclusion is represented only by ordinary files inside the same Git common directory that the phase child can modify. The phase must be able to run Git commits, so it can resolve the common directory and unlink its reader lease (or another runner's intent/ticket) while `callPhase` is still executing. A waiting writer then sees no reader and enters publication or worktree mutation concurrently. The parent's exact-identity check in `releaseGate()` detects the missing lease only after the child returns; it cannot undo shared Git operations that were admitted during the interval. This makes the gate advisory to the untrusted model process rather than an enforceable parent-held boundary.
   *Recommendation:* Place synchronization state outside every child-writable/sandbox-visible path and hold an OS-backed advisory lock or brokered lease in the parent process, without passing the controlling descriptor to the phase. If the harness cannot enforce that filesystem boundary, do not permit cross-project model phases concurrently. Add an adversarial test whose phase removes its reader record and pauses, then verify that a second process still cannot acquire the writer gate until the parent releases it.

25. [ ] **security-reviewer** | `bin/groundwork-run.js:613` | availability
   A phase-child record with startup:true is considered live unconditionally, without checking the parent process identity, a bounded handoff state, or an exact child identity. phaseChildEnvironment durably publishes these records before spawn and publishes the project and reader records sequentially. If the runner is killed after either publication but before the supervisor replaces all startup records, no finally cleanup runs and readLiveLease will forever treat the dead parent's lease as live. A stranded project sentinel blocks that project; a stranded repository-reader sentinel prevents every future writer (workspace setup, publication, and cleanup), yielding a persistent denial of service after an ordinary cooperative crash (CWE-667). The supervisor's sequential replacement also has the same failure mode if it exits between the two record upgrades.
   *Recommendation:* Replace the unconditional startup sentinel with a bounded, reclaimable launch protocol that cannot race a late child into execution. For example, spawn a supervisor paused on a parent-controlled handshake, publish and durably fsync its exact PID/start identity to every lease, then signal it to exec; if the parent dies before the signal, the supervisor must exit. Reclaim abandoned startup records only after proving the parent and any handshake supervisor are dead, remove stale phase-child records during lease reclamation, and add SIGKILL tests at each boundary: after the first sentinel, after both sentinels, and between the two exact-record upgrades.

26. [ ] **test-quality-reviewer** | `bin/groundwork-run.js:1506` | missing-test
   The active-peer exception permits a peer checkpoint's atomic temporary file during a model phase, but the test suite covers only rejection of an inactive peer checkpoint change. No test establishes a live peer lease plus registered workspace, mutates its allowed .TASK-...tmp record during a phase, and verifies the runner accepts the transition while still rejecting other checkpoint mutations.
   *Recommendation:* Add an integration test through runTasks that creates a live registered peer owner, writes the exact allowed atomic checkpoint temporary filename during invokePhase, and verifies completion; pair it with an adjacent disallowed temporary/checkpoint mutation assertion if needed to preserve the boundary.

27. [ ] **test-quality-reviewer** | `tests/groundwork-run.test.js:2159` | missing-test
   The two-lease exec test compares child.processStart with the actual execed process only when /proc is available. On macOS, its helper returns null, so either lease can publish any nonempty processStart value and the test still passes.
   *Recommendation:* Give the fixture helper the same ps fallback as production (or otherwise obtain the child identity portably) and require equality for both records.

28. [ ] **test-quality-reviewer** | `tests/groundwork-run.test.js:410` | missing-test
   The atomic-publication failure matrix injects errors only before `linkSync` publishes the final lease. It never exercises the new `published` rollback branch in `publishRecordAtomically` when directory fsync fails after the final path has been linked, so a regression that leaves a published lock behind on that error would pass every new test.
   *Recommendation:* Inject an `fsyncDirectory` failure after publication (via the existing dependency seam or an equivalent narrow seam) and assert that both the final lease and staging file are absent, for project, reader, writer-intent, and writer leases as applicable.

29. [ ] **test-quality-reviewer** | `tests/groundwork-run.test.js:857` | missing-test
   The only drained-upgrade regression test covers a live predecessor lock. The new product and architecture requirements also require startup to fail closed while preserving a malformed or stale `groundwork/runner.lock`, but neither case is exercised.
   *Recommendation:* Add deterministic table-driven cases that write a malformed record and a structurally valid dead-PID record, invoke `acquireRepositoryGate`, assert the specific fail-closed error, and assert the original lock bytes remain unchanged.

## Minor

30. [ ] **code-simplifier** | `bin/groundwork-run.js:1953` | code-structure
   The lexical/canonical containment and symlink checks for the selected project are repeated for the prepared worktree (1953-1962), the implementation worktree (2121-2129), and again before validation/finalization (2191-2192). The repetition makes a safety invariant difficult to review and leaves separate project-relative path variables to keep aligned.
   *Recommendation:* Introduce a small resolveTaskProject(worktreeRoot, projectRelative) helper that performs the same checks and returns the canonical project root plus specs path. Call it at each lifecycle boundary so revalidation remains intact without duplicating the path-safety sequence.

31. [ ] **code-simplifier** | `bin/groundwork-run.js:2170` | patterns
   The inspectUnrelatedWorktrees dependency fallback is resolved separately at workspace preparation and publication, duplicating one policy decision in the lifecycle code.
   *Recommendation:* Resolve dependencies.inspectUnrelatedWorktrees || snapshotUnrelatedWorktrees once near the other runTasks collaborators and reuse that function at both writer-gated boundaries.

32. [ ] **code-simplifier** | `bin/groundwork-run.js:2440` | code-structure
   The selected-project resolution sequence (lexical path, symlink-component checks, realpath containment, and specs-directory validation) is duplicated for the prepared worktree here and for the implementation worktree around line 2608. Duplicated security-sensitive setup can drift between lifecycle phases.
   *Recommendation:* Extract a resolveTaskProject(worktreeRoot, projectRelativePath) helper that returns the canonical project root and specs directory after performing the same checks, then call it at both lifecycle boundaries without changing the revalidation points.

33. [ ] **code-simplifier** | `bin/groundwork-run.js:455` | code-structure
   Lease-owner constraints are repeated in normalizeLeaseOwner and inspectLease: project syntax, project-path containment, and task-ID validation must stay synchronized across writes and reads.
   *Recommendation:* Share a small lease-owner validation helper between record creation and inspection, leaving only read-specific fields such as token, PID, timestamp, and process identity in inspectLease. This removes duplicated regular expressions without changing the accepted record format.

34. [ ] **code-simplifier** | `bin/groundwork-run.js:532` | code-structure
   The boolean `notify` flag selects four separate callback branches in the atomic publisher, while callers do not communicate why mutation records must suppress those hooks.
   *Recommendation:* Replace the flag with explicit `publishLeaseRecord`/`publishMutationRecord` wrappers or a named hooks/options object. This keeps mutation-ticket publication hook-free without making the publisher's mode implicit.

35. [ ] **code-simplifier** | `bin/groundwork-run.js:578` | needless-repetition
   inspectMutationEntry repeats the bounded, no-follow JSON-file opening and ENOENT/ELOOP/close handling already implemented by inspectLease, leaving two versions of the same filesystem boundary logic to evolve.
   *Recommendation:* Extract a private bounded-JSON reader that owns open/fstat/read/close and filesystem-error translation, then keep lease and mutation ownership validation in their respective callers so their behavior-specific messages remain distinct.

36. [ ] **code-simplifier** | `bin/groundwork-run.js:650` | code-structure
   readPeerCheckpoint duplicates the descriptor-safe, size-bounded JSON-file pattern already implemented by inspectLease and loadCheckpoint, including the same open/fstat/read/close structure.
   *Recommendation:* Factor the common bounded JSON reader while keeping the caller-supplied size limit and error label, then use it for peer checkpoints and lease records. This removes repeated resource-management code without changing validation rules.

37. [ ] **code-simplifier** | `bin/groundwork-run.js:671` | code-structure
   The choosing-contender loop and immediate-predecessor loop duplicate the same inspect/live/stale-unlink/wait lifecycle across lines 671-682 and 693-704. Keeping two copies of this concurrency-sensitive protocol makes future fixes easy to apply to one path but not the other.
   *Recommendation:* Extract a named helper such as waitForMutationEntry(entryPath, dependencies) that performs one bounded inspection, removes a dead entry, and waits while it remains live; call it for both contender and predecessor paths while retaining the existing selection logic.

38. [ ] **code-simplifier** | `bin/groundwork-run.js:672` | needless-repetition
   The choosing-contender loop and predecessor loop repeat the same inspect-live/stale-unlink/short-wait lifecycle. Keeping two copies of this concurrency-sensitive protocol makes a future fix easy to apply to one path but not the other.
   *Recommendation:* Extract waitForMutationEntry(entryPath, dependencies) to perform one bounded inspection, remove a dead entry, and wait while it remains live; use it for both choosing contenders and ticket predecessors while retaining their existing selection/filtering logic.

39. [ ] **code-simplifier** | `bin/groundwork-run.js:807` | code-structure
   The old single-runner state helpers withoutRef, snapshotRunnerState, and assertRunnerState are now unreachable after the project-scoped transition and snapshot changes; only withoutTaskRefs and snapshotTaskRunnerState are used.
   *Recommendation:* Remove the obsolete helpers so the file has one repository-ref filtering path and one checkpoint snapshot model. This is a behavior-preserving cleanup and reduces confusion about whether checkpoints are global or project-scoped.

40. [ ] **code-simplifier** | `bin/groundwork-run.js:939` | code-structure
   The previous transition/checkpoint helpers (withoutRef, withoutWorktree, snapshotRunnerState/assertRunnerState, and snapshotTaskRunnerState/assertTaskRunnerState) are now unreachable after the map/file snapshot implementation, leaving two competing validation designs and substantial dead code.
   *Recommendation:* Remove the superseded helpers once the new transition assertions are established; keep the active map/file snapshot path as the single state-validation implementation.

41. [ ] **performance-reviewer** | `bin/groundwork-run.js:715` | missing-caching
   activeProjectOwners calls registeredWorktrees() once for every live project lease. Each call shells out to `git worktree list` and realpaths every registered worktree, so a phase start costs O(active-projects × registered-worktrees) filesystem/process work instead of one registry scan.
   *Recommendation:* Build the registered-worktree index once before the lease loop (for example, a Map keyed by canonical path) and reuse it for every live owner; retain the existing per-owner branch comparison.

42. [ ] **security-reviewer** | `bin/groundwork-run.js:617` | resource-management
   Mutation-directory scans silently ignore every name beginning with .staging-, while publishRecordAtomically can leave such a file behind if the process is killed after staging creation or publication but before unlinkSync (CWE-459). The residue does not break reader/writer exclusion or expose a partial final lease, but repeated interrupted acquisitions can accumulate permanent files under .git/groundwork and consume directory or filesystem resources.
   *Recommendation:* Give staging entries enough authenticated process-instance metadata to distinguish active publication from abandoned files, and reap abandoned staging entries during mutation-directory maintenance; also fsync the directory after successful staging unlink if crash-consistent cleanup is required. Keep active staging entries private and ignored for lock ordering.

43. [ ] **spec-alignment-checker** | `specs/product_specs.md:13` | specification-gap
   The requirement that stale synchronization records "SHALL be reclaimed" is absolute, while the compatibility implementation intentionally preserves a stale legacy .reclaim.lock and fails closed rather than reclaiming it when safe ownership cannot be established (bin/groundwork-run.js:779-817). The tested behavior prevents an older reclaimer from deleting a successor lease, but the exception is not stated in the PRD.
   *Recommendation:* Clarify that records using an unsafe legacy recovery protocol are retained and reported for manual intervention; automatic reclamation applies only when the current protocol can revalidate ownership without risking a successor lease.
