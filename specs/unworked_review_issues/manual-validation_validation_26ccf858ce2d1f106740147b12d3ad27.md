# Unworked Review Issues

**Run:** 2026-09-12 15:30:36
**Task:** manual-validation
**Total:** 42 (0 critical, 3 major, 39 minor)

## Major

1. [ ] **code-quality-reviewer** | `lib/validation-session.js:373` | code-elegance
   tryAcquireOpenLock (lines 373-451) re-implements the O_EXCL acquire / liveness-probe / age-out / reap cycle that the new lib/owned-lock.js acquireOwnedLock (lines 47-117) already provides — two parallel copies of concurrency-critical stale-recovery logic in the same change set, differing subtly (open lock uses pid+host via lockHolderAlive; owned lock adds processStart identity). A future bug fix applied to one and not the other silently diverges the two recovery paths.
   *Recommendation:* Unify: have the open lock use acquireOwnedLock (optionally with a custom staleMs), or extract the shared reap-or-throw decision into one helper both call. The plan's Slice 4 explicitly named owned-lock.js as the shared lock primitive.

2. [ ] **code-simplifier** | `lib/validation-session.js:373` | code-structure
   tryAcquireOpenLock() plus lockHolderAlive() (lines 348-459) hand-rolls an O_EXCL lockfile with stale-reap logic that substantially duplicates the new shared primitive lib/owned-lock.js (acquireOwnedLock, lines 47-117), yet the two diverge in reap heuristics: the session open lock probes liveness with kill(pid, 0) only, while owned-lock uses process-start identity. Two parallel implementations of the same dangerous invariant (when may a lock be reaped) is exactly where future drift introduces a concurrency bug. The plan named owned-lock.js as the shared token-bearing lock primitive.
   *Recommendation:* Consolidate the validation open lock onto acquireOwnedLock (it already provides O_EXCL creation, identity-checked release, dead-holder and aged-out reaping, and unreadable-young-lock grace). Preserve behavior: keep the open-lock's wider LOCK_STALE_MS if intentional, keep the existing error-message content callers/tests match on, and keep a kill/process-start injection seam for tests. If the divergence is deliberate, record the reason in a comment at both sites so the duplication is clearly load-bearing.

3. [ ] **housekeeper** | `AGENTS.md:108` | documentation-stale
   AGENTS.md's Library Utilities table does not mention the new runtime helpers added by this branch: `lib/external-runner-manifest.js` (the fail-closed export dependency contract driving install-skills.sh), `lib/process-identity.js` (process-start identity/liveness shared by the runner and validation heartbeat), and `lib/owned-lock.js` (token-bearing O_EXCL lock with identity-checked release). These are load-bearing for the installer, runner startup, and validation ownership, exactly the kind of files the table exists to catalog. The branch diff (8a1c5f3..HEAD) contains no AGENTS.md change.
   *Recommendation:* Add rows for `lib/external-runner-manifest.js`, `lib/process-identity.js`, and `lib/owned-lock.js` to the Library Utilities table in AGENTS.md (and consider mentioning `pi-extension/lib/project-context-core.js` / `template-vars.js` alongside the pi-extension entry).

## Minor

4. [ ] **architecture-alignment-checker** | `hooks/pin-session-selection.sh:55` | interface-contract
   The receipt-extraction hook reads only payload.tool_response.stdout or payload.tool_response.output. This is the documented strict receipt contract (single exact candidate, schema-validated), but the accepted payload forms are narrower than what some hook-capable harnesses emit (e.g. structured content or arrays of content blocks); the hook silently no-ops there. The plan requires verifying target payload support and documenting hookless fallbacks — skills/select-project/SKILL.md was updated, so this is consistent, but the accepted forms live only in the hook script rather than in the protocol reference.
   *Recommendation:* Document the exact accepted PostToolUse payload forms (stdout/output fields) in references or the select-project skill so future harness targets know what the hook supports before claiming per-chat pinning works.

5. [ ] **architecture-alignment-checker** | `lib/external-runner-manifest.js:22` | pattern-violation
   The manifest is a hand-maintained list of runtime entries; it does not statically verify that the relative require() closure of each listed source file (e.g. validation-session.js -> owned-lock.js -> process-identity.js, worktree-identity.js -> project-context.js -> atomic-write.js) references only other listed files. A future helper requiring an unlisted local module would not be caught by validateManifest() itself — only by the plan's copied-source fixture smoke test.
   *Recommendation:* Consider extending validateManifest() to scan each listed source for relative require() calls and fail when a target is outside the manifest closure, making the contract self-checking rather than test-guarded.

6. [ ] **code-quality-reviewer** | `hooks/pin-session-selection.sh:26` | code-readability
   The jq-less sed fallback for extracting tool_input.command uses [^"]* and cannot handle embedded escaped quotes; a command containing quoted arguments is truncated. Failure direction is safe (gate under-matches, hook no-ops), and jq is the primary path, but the fallback's limitation is undocumented.
   *Recommendation:* Add a one-line comment noting the fallback only gates simple commands and is deliberately conservative (a missed match is a no-op, never a wrong pin).

7. [ ] **code-quality-reviewer** | `lib/atomic-write.js:62` | code-readability
   publishFileSyncExclusive's JSDoc says options are 'Passed through to writeFileSyncAtomic', but the function re-implements the temp write inline and only honors options.mkdir itself; the doc misdescribes the actual contract.
   *Recommendation:* Correct the JSDoc to describe the inline behavior (or genuinely delegate the temporary write to writeFileSyncAtomic and return the published path).

8. [ ] **code-quality-reviewer** | `lib/validation-session.js:1131` | code-readability
   heartbeatLoop and acquireOwnedLockWithRetry (line 615) branch on regex matches over error message text ('/exiting:/', '/another process holds/') — string-coupled control flow that breaks silently if a message is reworded.
   *Recommendation:* Attach a stable property (e.g. error.code = 'HB_EXIT' / 'LOCK_HELD') or throw typed errors, and match on that; keep the human message free-form.

9. [ ] **code-quality-reviewer** | `lib/validation-session.js:579` | code-elegance
   withRunLock loads the full session twice per mutation (line 581 outside the lock for the version check, line 588 inside). Each loadSession run executes multiple git rev-parse calls, realpaths, and SHA-256 hashing of checkpointed artifacts, doubling that cost on every heartbeat beat and mutation.
   *Recommendation:* Hoist only the cheap version read (parse stateFile directly) for the pre-lock guard, or skip the pre-load entirely and let the in-lock load raise the legacy read-only error — the lock is acquired either way before any write.

10. [ ] **code-quality-reviewer** | `lib/validation-session.js:594` | readability
   Two stacked JSDoc blocks now precede readSessionStateLightweight: lines 594-602 are withRunLock's original doc ('Serialize an authenticated state mutation...') left orphaned when the new function was inserted above it, followed by the new function's own doc at 603-608. The first block describes code 13 lines below, misleads readers of the hot-path helper, and reads as a copy-paste artifact.
   *Recommendation:* Move the 594-602 block down to sit directly above withRunLock (line 622), leaving only the 'Cheap state read for hot paths' doc on readSessionStateLightweight.

11. [ ] **code-quality-reviewer** | `lib/validation-session.js:609` | error-handling
   acquireOwnedLockWithRetry gives up after MUTATION_LOCK_WAIT_MS (5s) and heartbeatLoop (line 1131) then dies on any non-'exiting:' beat error. A checkpoint holding the mutation lock longer than 5s (loadSession hashes artifacts up to 64MB and runs git commands) would kill the heartbeat worker mid-run, degrading liveness through a code path unrelated to actual ownership loss.
   *Recommendation:* Either retry beats past a transient lock-timeout (distinct from authentication/terminal errors, which must still kill the worker) or raise the mutation-lock wait; classify errors structurally (error.code / typed error) rather than by message regex.

12. [ ] **code-quality-reviewer** | `lib/validation-session.js:659` | code-elegance
   saveRunnerCapability uses plain fs.writeFileSync rather than the shared atomic-write API used everywhere else in this module, so a crash mid-write can leave a torn runner-capability.json. loadRunnerCapability's catch makes the failure mode safe (treated as absent), but the torn file then permanently disables runner resume until manually removed.
   *Recommendation:* Write via writeJsonSyncAtomic (mode 0600 is preserved by the temp-file + rename path if the temp is created with 0o600, which it is).

13. [ ] **code-quality-reviewer** | `tests/validation-session.test.js:1107` | test-quality
   The takeover test's key negative assertion waits 2000ms for an 'unfenced takeover' that must NOT happen, then asserts unfencedTakeover === false. Timing-based negative assertions are inherently load-sensitive: I observed this suite fail 3 tests on one run and 1 on the next while the repair files were being written concurrently, before three consecutive clean passes. The 2s window can false-positive (flag a correct serialization as unfenced) on a heavily loaded machine.
   *Recommendation:* Lengthen the negative window or make it load-tolerant (e.g., scale with an env override, or assert instead on the taker's observed blocking: after releasing the mutation lock, the takeover completing with epoch+1 and the old-owner record never reappearing is the deterministic part and is already asserted — the strict unfencedTakeover === false check is the only timing-fragile line and could be advisory).

14. [ ] **code-simplifier** | `bin/groundwork-run.js:1411` | code-smell
   Pointless try/catch around releaseIntent() whose handler only rethrows the same error (catch (error) { throw error; }).
   *Recommendation:* Call releaseIntent() directly without the try/catch.

15. [ ] **code-simplifier** | `bin/groundwork-run.js:53` | code-smell
   createWorktreeIdentity({ execGit: (cwd, args) => execGit(cwd, args) }) wraps execGit in a lambda that silently drops the third (options) argument. If the shared factory ever passes options (env/raw), they vanish here with no error.
   *Recommendation:* Pass execGit directly, or forward all arguments ((...invoke) => execGit(...invoke)) so options cannot be silently discarded.

16. [ ] **code-simplifier** | `bin/groundwork-run.js:832` | code-smell
   In phaseChildLeases(), the guard !owner || !sameLeaseIdentity(owner, owner) is a tautology: sameLeaseIdentity(x, x) is true for any truthy x, so the condition reduces to !owner and the sameLeaseIdentity call suggests a validation that is not actually performed.
   *Recommendation:* Replace with if (!leasePath || !owner) throw ... — or, if field-level shape validation of owner was intended, validate the specific required fields.

17. [ ] **code-simplifier** | `lib/atomic-write.js:65` | needless-repetition
   publishFileSyncExclusive duplicates the open-temp/write/fsync/close block of writeFileSyncAtomic (lines 29-41) instead of sharing it; the two copies must stay in step on the O_EXCL/0o600/fsync discipline.
   *Recommendation:* Extract a shared writeTemporary(directory, file, data, options) helper returning the temporary path, and build both the rename path and the exclusive link path on top of it.

18. [ ] **code-simplifier** | `lib/owned-lock.js:119` | naming
   pathBasename(file) is a one-line wrapper around path.basename used twice; it adds indirection without adding meaning.
   *Recommendation:* Inline path.basename(lockFile) at the two call sites and delete the wrapper.

19. [ ] **code-simplifier** | `lib/project-context.js:600` | needless-repetition
   getPaneFilePath() and getSnapshotFilePath() (lines 600-681) duplicate the same legacy-slug selection plus `${key}__${slug}.json` filename construction; only the directory differs.
   *Recommendation:* Extract a shared keyFilePath(directory, key, repoRoot, options) helper used by both.

20. [ ] **code-simplifier** | `lib/validation-session.js:1132` | code-structure
   heartbeatLoop() detects orderly shutdown by matching the error message against /exiting:/ — error-message text used as a control-flow protocol. A wording change to either throw site silently converts an orderly stop into a crash.
   *Recommendation:* Have heartbeatBeat/heartbeatRegister throw a dedicated error (e.g. Object.assign(new Error(...), { code: 'HEARTBEAT_EXIT' })) and branch on error.code instead of message text.

21. [ ] **code-simplifier** | `lib/validation-session.js:171` | code-structure
   validateCoordinatorStateFile() and validateFixerResultFile() call validateCoordinatorFile() (which already reads and JSON-parses the file at line 164) but discard the parsed object, then immediately re-read and re-parse the same file via readJson. Additionally, validateCoordinatorFile's name misleads: it is also the validator for fixer envelopes and results.
   *Recommendation:* Have the base validator return { basename, sha256, parsed } so callers validate the parsed schema without a second read, and rename it to something neutral like validateBoundedJsonArtifact.

22. [ ] **code-simplifier** | `lib/validation-session.js:435` | code-smell
   Dead conditional in the open-lock error message: the throw at line 431 only executes when lockHolderAlive(...) && !agedOut, so the ternary (agedOut ? '' : ' or remove a stale lock manually...') always selects the second arm.
   *Recommendation:* Remove the ternary and always append the 'remove a stale lock manually' clause.

23. [ ] **code-simplifier** | `pi-extension/lib/project-context-core.js:103` | needless-repetition
   isContained() now exists in three private copies (pi-extension/lib/project-context-core.js, lib/project-context.js isContainedBy, bin/groundwork-run.js isContained). The pi copy is intentionally dependency-free and the runner bundle is intentionally standalone, so the duplication is defensible, but it is undocumented at the duplication sites.
   *Recommendation:* Leave the copies in place (bundle independence is load-bearing) but add a one-line comment at each noting the canonical semantics they must mirror, so the three cannot drift.

24. [ ] **housekeeper** | `AGENTS.md:131` | documentation-stale
   AGENTS.md's Path safety section still reads "Files produced by skills follow three invariants ... shared 'active' pointers use O_EXCL locks with staleness recovery (as in `lib/validation-session.js`)" while docs/developing-skills.md was updated on this branch to five invariants, adding absolute-cwd-invariant bindings and invocation-unique journals, and now cites `lib/owned-lock.js` alongside `lib/validation-session.js`. The two contributor-facing documents now describe different rule sets.
   *Recommendation:* Update the AGENTS.md Path safety paragraph to match docs/developing-skills.md (five invariants; pointer reference to `lib/owned-lock.js`/`lib/validation-session.js`).

25. [ ] **performance-reviewer** | `bin/groundwork-run.js:1001` | blocking-io
   waitForMutationEntry polls inspectMutationEntry + processStartIdentity starting at a 10ms interval (doubling to 250ms). At 10ms, each poll can spawn up to two `ps` processes (see finding 3), so the first moments of lease-mutation contention can produce ~100-200 process spawns per waiting runner.
   *Recommendation:* Start the backoff at 25-50ms instead of 10ms (the mutation critical section is file I/O, rarely sub-25ms), or probe liveness at a lower frequency than entry-presence (entry disappearance via a cheap stat/read can stay fast; the ps-based liveness check only needs to run every few hundred ms).

26. [ ] **performance-reviewer** | `bin/groundwork-run.js:1408` | blocking-io
   The repository-gate writer loop calls liveLeaseFiles(readers) every 1s while readers hold the gate; each iteration reclaims staging entries (readdir + lstat scan) and runs inspectLease + processStartIdentity (ps spawns on macOS) for every reader lease. With R concurrent readers the waiting writer performs O(R) process-spawn chains per second for the whole read duration.
   *Recommendation:* Cache the previous poll's live reader set and re-probe identities at a lower cadence (e.g. every 5s) with a fast existence check (readdir/stat only) each second, or apply a short liveness-probe TTL per pid. Correctness is unaffected — this is pure spawn-rate reduction on a wait path.

27. [ ] **performance-reviewer** | `hooks/pin-session-selection.sh:24` | blocking-io
   The pin hook runs on every Bash PostToolUse and always spends one `cat` plus one `jq` spawn (plus a second jq for session_id when the gate passes) before its command gate exits. The gating is good (node never spawns for unrelated commands), but the fixed per-tool-use cost is two process spawns where one would do.
   *Recommendation:* Extract tool_input.command and session_id with a single jq invocation (`jq -r '[.tool_input.command, .session_id] | @tsv``) or parse both in the one node process that already runs when the gate passes; the sed fallback path can stay as-is.

28. [ ] **performance-reviewer** | `lib/process-identity.js:25` | resource-leak
   processStartIdentity unconditionally calls processIsZombie, which spawns `ps -o stat=` — one process spawn per liveness probe — before consulting /proc. On Linux, /proc/<pid>/stat field 3 already carries the process state (zombie check without any spawn), and on macOS the subsequent lstart probe spawns `ps` again, so each identity probe costs up to two process spawns. These probes run inside the runner's 1s gate/poll loops and the mutation-entry wait loop, i.e. continuously while any contention exists.
   *Recommendation:* On Linux, read the state field from the same /proc/<pid>/stat buffer already parsed for starttime and treat state 'Z' as dead, eliminating the extra ps spawn. On macOS, the lstart `ps` output alone can serve (a dead pid errors); consider caching identities for a short TTL in polling loops that probe the same pid repeatedly.

29. [ ] **security-reviewer** | `hooks/pin-session-selection.sh:51` | injection
   PLUGIN_ROOT is interpolated directly into a node -e string literal (require('${PLUGIN_ROOT}/lib/project-context')). A plugin installation path containing a single quote (or backslash) breaks out of the string literal and executes arbitrary embedded JavaScript. The path is operator-chosen, so this is hardening rather than an external attack surface, but the same pattern is repeated across hooks.
   *Recommendation:* Pass PLUGIN_ROOT via environment (PLUGIN_ROOT=... node -e "... require(process.env.PLUGIN_ROOT + '/lib/project-context') ...") instead of string interpolation.

30. [ ] **security-reviewer** | `lib/owned-lock.js:86` | insecure-design
   A lock recorded on a foreign host (holderDead requires lockHolder.host === os.hostname()) can never be proven dead, so it is reaped purely on age (staleMs, default 5 min) even while its holder is alive — for example with a git common directory on a shared/network filesystem used from two machines. The validation-session open lock has the same property. This silently breaks mutual exclusion for cross-host checkouts of the same repository.
   *Recommendation:* Either document the single-host assumption explicitly in the ownership protocol (references/validation-session-protocol.md) and refuse cross-host reaping until a configurable longer cross-host staleness window elapses, or add a host-aware grace multiplier for foreign-host holders.

31. [ ] **security-reviewer** | `lib/validation-session.js:1217` | sensitive-data-exposure
   The owner bearer capability is accepted and passed as a CLI argument (heartbeat-loop --owner-token <token>, open --owner-token ...), and sessionBusyMessage (line 640) explicitly instructs users to put --owner-token <capability> on the command line. argv is readable by every local user via ps(1)/procfs (CWE-598), which contradicts the plan's requirement that the raw token be 'passed through controlled local invocation state/environment' and omitted from diagnostics.
   *Recommendation:* Accept the capability via an environment variable (e.g., GROUNDWORK_VALIDATION_OWNER_TOKEN) or stdin, and update sessionBusyMessage and skills/validate documentation to never place the token in an argument vector.

32. [ ] **security-reviewer** | `lib/validation-session.js:659` | cryptographic-failures
   saveRunnerCapability writes the plaintext owner token with mode only at creation (writeFileSync {mode: 0o600}) and chmods only when the file did not previously exist. If runner-capability.json already exists with looser permissions (e.g., created by an older version or restored by a tool applying umask), the bearer capability stays world/group-readable.
   *Recommendation:* chmod 0o600 unconditionally after every write (the chmod is already wrapped in a best-effort try), independent of the existed flag.

33. [ ] **spec-alignment-checker** | `lib/validation-session.js:768` | specification-gap
   The plan invariant 'Every validation mutation is token-authenticated, serialized, and compare-and-swap guarded' is enforced for checkpoint/begin-fixer/complete-fixer/complete/heartbeat-* via withRunLock (mutation lock + reload + authenticate + revision bump), but the open-path writes — the authorized-resume heartbeat refresh (line ~768-780), the stale-takeover epoch mint (line ~787-800), and the fixer-inflight->fixer-prepared recovery write in recoverOrResume (line ~697-712) — write state directly via atomicWriteJson while holding only the slot open lock, not the run's .mutation.lock. In a narrow interleaving, a just-resumed old heartbeat worker that loaded pre-takeover state inside withRunLock could commit its revision after the takeover write, resurrecting the stale owner's tokenDigest. The window requires a worker whose lastBeat is already older than the 2h staleness window to beat again exactly during takeover, so it is theoretical, and all realistic takeover cases (crashed/dead worker) are safe.
   *Recommendation:* Route the resume/takeover/recovery state writes through the same mutation-lock discipline (acquire .mutation.lock, reload, then write), or have the takeover path acquire .mutation.lock before minting the successor epoch so an in-flight old-worker beat serializes against it and fails authentication.

34. [ ] **test-quality-reviewer** | `tests/groundwork-run.test.js:1450` | implementation-coupling
   The identity-delegation test slices the runner source between 'function activeProjectOwners' and 'function acquireRepositoryGate' and asserts the body lacks '`task/${' and ".worktrees', holder.taskId". Function-boundary slicing breaks silently if either anchor function is renamed or reordered (indexOf returns -1 and the slice is empty, making the assertion vacuously true).
   *Recommendation:* Guard the anchors: assert indexOf('function activeProjectOwners') !== -1 and that the end index is greater than the start index before slicing, so a refactor fails loudly instead of turning the check into an always-pass.

35. [ ] **test-quality-reviewer** | `tests/groundwork-run.test.js:7180` | missing-test
   Plan slice 4 requires the capability to be absent from reporter artifacts/events ('never in reporter events'). The runner-arbitration tests assert the retained capability file is mode 0600 and never stored for sessions the runner does not own, but no test asserts reporter events / run-reporting output exclude the owner token.
   *Recommendation:* Extend 'runner-owned continuation resumes through its retained capability' (or the capability-leak test in tests/validation-session.test.js) to run one report emission with the token in scope and assert the produced report/event stream does not contain it.

36. [ ] **test-quality-reviewer** | `tests/pi-extension.test.js:263` | logic-in-test
   assert.ok(!/name:\s*\\?/.test('') && !projectContext.includes('- name:')) — the first conjunct runs a regex against the empty string, which is always false, so !false is always true. It is dead logic (likely a refactoring leftover) that makes the line read as if two checks exist when only one does.
   *Recommendation:* Delete the always-true conjunct and keep the real assertion: assert.ok(!projectContext.includes('- name:'), 'project-context.ts must not parse the list-style schema itself').

37. [ ] **test-quality-reviewer** | `tests/project-context.test.js:1304` | implementation-coupling
   'the pin hook never consults shared pane state for a pin decision' asserts on hook source text (!hook.includes('restorePaneSelection') / !hook.includes('>= snap')). This couples the test to exact identifier spelling and will silently stop guarding if the hook is refactored to an equivalent call under a different name, while passing today even if a renamed arbitration path is reintroduced.
   *Recommendation:* Keep it only as a supplementary policy lint (like path-safety), but rely on the existing behavioral tests (same-second arbitration test at line 1111 already pins the invariant). Consider asserting the outcome only, or move the source scan into tests/path-safety.test.js where source-scanning is the declared policy.

38. [ ] **test-quality-reviewer** | `tests/skills-core.test.js:1` | missing-test
   lib/skills-core.js resolveTemplateVariables() was changed in this delta to emit the absolute project_root (slice 2 contract), but no test asserts the new absolute output for this function. Only the parallel implementation in lib/resolve-template-vars.js is covered (tests/plans-dir.test.js hook wiring). The two copies of the binding contract can now diverge without a failing test.
   *Recommendation:* Add one focused test in tests/skills-core.test.js asserting resolveTemplateVariables('{{project_root}}') yields the absolute project root (and '{{specs_dir}}' absolute), mirroring the plans-dir hook assertion — or consolidate both resolvers on one tested implementation.

39. [ ] **test-quality-reviewer** | `tests/validation-session.test.js:1122` | non-deterministic
   The takeover-serialization test's negative check waits a fixed 2s window for an 'unfenced takeover' epoch bump and treats timeout as proof of serialization. On a severely loaded machine a buggy (unfenced) taker might not publish within 2s, letting the bug false-pass this specific assertion.
   *Recommendation:* Acceptable as-is because the load-bearing final-state assertions (epoch bumped, tokenDigest rotated after the old owner's direct publish) independently catch the bug — they are what failed on pre-repair code. Optionally raise the window or comment that the final assertions are the real fence proof.

40. [ ] **test-quality-reviewer** | `tests/validation-session.test.js:1171` | missing-test
   withHeartbeatLock's defensive fallback to withRunLock (unrecognized owner shape / non-v2 state on the lightweight read) and releaseOpenLockVerified's unreadable-file leave-alone branch (lib/validation-session.js) are exercised only implicitly, not by dedicated tests.
   *Recommendation:* Add one test writing a malformed owner object to the state file and asserting a beat still succeeds via the fully verified path; add one test making the lockfile unreadable before release and asserting it is left in place.

41. [ ] **test-quality-reviewer** | `tests/validation-session.test.js:1222` | implementation-coupling
   assert.strictEqual(counter.gitSpawns, 1) couples the test to the exact number of git invocations inside loadSession; a behavior-preserving refactor that legitimately issues two git calls would break it.
   *Recommendation:* Fine to keep since the exact count is the regression being pinned (pre-repair doubled it to 2); if loadSession's git usage ever becomes an implementation detail, relax to counter.gitSpawns <= 1 or assert the delta relative to a control path.

42. [ ] **test-quality-reviewer** | `tests/validation-session.test.js:760` | non-deterministic
   The live-heartbeat test sleeps a fixed 400ms and asserts lastBeat changed (beat interval 100ms via GROUNDWORK_VALIDATION_BEAT_MS). Under heavy CI load a 400ms window can pass without an observed beat, producing an intermittent failure — the only fixed-sleep-as-assertion-margin in the otherwise barrier-deterministic suite.
   *Recommendation:* Replace the sleep+compare with the suite's existing waitFor() helper: waitFor(() => heartbeatState(created.runDir).lastBeat !== before, 10000, 'heartbeat advancement'). Same idea applies to the real-time staleness wait at line 799, which already uses waitFor correctly.
