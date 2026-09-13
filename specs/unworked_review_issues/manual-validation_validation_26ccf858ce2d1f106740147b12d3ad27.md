# Unworked Review Issues

**Run:** 2026-09-13 00:13:20
**Task:** manual-validation
**Total:** 27 (0 critical, 0 major, 27 minor)

## Minor

1. [ ] **coordinator** | `bin/groundwork-run.js:1001` | blocking-io
   waitForMutationEntry polls inspectMutationEntry + processStartIdentity starting at a 10ms interval (doubling to 250ms). At 10ms, each poll can spawn up to two `ps` processes (see finding 3), so the first moments of lease-mutation contention can produce ~100-200 process spawns per waiting runner.
   *Recommendation:* Start the backoff at 25-50ms instead of 10ms (the mutation critical section is file I/O, rarely sub-25ms), or probe liveness at a lower frequency than entry-presence (entry disappearance via a cheap stat/read can stay fast; the ps-based liveness check only needs to run every few hundred ms).

2. [ ] **coordinator** | `bin/groundwork-run.js:1408` | blocking-io
   The repository-gate writer loop calls liveLeaseFiles(readers) every 1s while readers hold the gate; each iteration reclaims staging entries (readdir + lstat scan) and runs inspectLease + processStartIdentity (ps spawns on macOS) for every reader lease. With R concurrent readers the waiting writer performs O(R) process-spawn chains per second for the whole read duration.
   *Recommendation:* Cache the previous poll's live reader set and re-probe identities at a lower cadence (e.g. every 5s) with a fast existence check (readdir/stat only) each second, or apply a short liveness-probe TTL per pid. Correctness is unaffected — this is pure spawn-rate reduction on a wait path.

3. [ ] **coordinator** | `bin/groundwork-run.js:1411` | code-smell
   Pointless try/catch around releaseIntent() whose handler only rethrows the same error (catch (error) { throw error; }).
   *Recommendation:* Call releaseIntent() directly without the try/catch.

4. [ ] **coordinator** | `bin/groundwork-run.js:53` | code-smell
   createWorktreeIdentity({ execGit: (cwd, args) => execGit(cwd, args) }) wraps execGit in a lambda that silently drops the third (options) argument. If the shared factory ever passes options (env/raw), they vanish here with no error.
   *Recommendation:* Pass execGit directly, or forward all arguments ((...invoke) => execGit(...invoke)) so options cannot be silently discarded.

5. [ ] **coordinator** | `bin/groundwork-run.js:832` | code-smell
   In phaseChildLeases(), the guard !owner || !sameLeaseIdentity(owner, owner) is a tautology: sameLeaseIdentity(x, x) is true for any truthy x, so the condition reduces to !owner and the sameLeaseIdentity call suggests a validation that is not actually performed.
   *Recommendation:* Replace with if (!leasePath || !owner) throw ... — or, if field-level shape validation of owner was intended, validate the specific required fields.

6. [ ] **coordinator** | `hooks/pin-session-selection.sh:24` | blocking-io
   The pin hook runs on every Bash PostToolUse and always spends one `cat` plus one `jq` spawn (plus a second jq for session_id when the gate passes) before its command gate exits. The gating is good (node never spawns for unrelated commands), but the fixed per-tool-use cost is two process spawns where one would do.
   *Recommendation:* Extract tool_input.command and session_id with a single jq invocation (`jq -r '[.tool_input.command, .session_id] | @tsv``) or parse both in the one node process that already runs when the gate passes; the sed fallback path can stay as-is.

7. [ ] **coordinator** | `hooks/pin-session-selection.sh:51` | injection
   PLUGIN_ROOT is interpolated directly into a node -e string literal (require('${PLUGIN_ROOT}/lib/project-context')). A plugin installation path containing a single quote (or backslash) breaks out of the string literal and executes arbitrary embedded JavaScript. The path is operator-chosen, so this is hardening rather than an external attack surface, but the same pattern is repeated across hooks.
   *Recommendation:* Pass PLUGIN_ROOT via environment (PLUGIN_ROOT=... node -e "... require(process.env.PLUGIN_ROOT + '/lib/project-context') ...") instead of string interpolation.

8. [ ] **coordinator** | `lib/atomic-write.js:62` | code-readability
   publishFileSyncExclusive's JSDoc says options are 'Passed through to writeFileSyncAtomic', but the function re-implements the temp write inline and only honors options.mkdir itself; the doc misdescribes the actual contract.
   *Recommendation:* Correct the JSDoc to describe the inline behavior (or genuinely delegate the temporary write to writeFileSyncAtomic and return the published path).

9. [ ] **coordinator** | `lib/atomic-write.js:65` | needless-repetition
   publishFileSyncExclusive duplicates the open-temp/write/fsync/close block of writeFileSyncAtomic (lines 29-41) instead of sharing it; the two copies must stay in step on the O_EXCL/0o600/fsync discipline.
   *Recommendation:* Extract a shared writeTemporary(directory, file, data, options) helper returning the temporary path, and build both the rename path and the exclusive link path on top of it.

10. [ ] **coordinator** | `lib/owned-lock.js:119` | naming
   pathBasename(file) is a one-line wrapper around path.basename used twice; it adds indirection without adding meaning.
   *Recommendation:* Inline path.basename(lockFile) at the two call sites and delete the wrapper.

11. [ ] **coordinator** | `lib/owned-lock.js:86` | insecure-design
   A lock recorded on a foreign host (holderDead requires lockHolder.host === os.hostname()) can never be proven dead, so it is reaped purely on age (staleMs, default 5 min) even while its holder is alive — for example with a git common directory on a shared/network filesystem used from two machines. The validation-session open lock has the same property. This silently breaks mutual exclusion for cross-host checkouts of the same repository.
   *Recommendation:* Either document the single-host assumption explicitly in the ownership protocol (references/validation-session-protocol.md) and refuse cross-host reaping until a configurable longer cross-host staleness window elapses, or add a host-aware grace multiplier for foreign-host holders.

12. [ ] **coordinator** | `lib/process-identity.js:25` | resource-leak
   processStartIdentity unconditionally calls processIsZombie, which spawns `ps -o stat=` — one process spawn per liveness probe — before consulting /proc. On Linux, /proc/<pid>/stat field 3 already carries the process state (zombie check without any spawn), and on macOS the subsequent lstart probe spawns `ps` again, so each identity probe costs up to two process spawns. These probes run inside the runner's 1s gate/poll loops and the mutation-entry wait loop, i.e. continuously while any contention exists.
   *Recommendation:* On Linux, read the state field from the same /proc/<pid>/stat buffer already parsed for starttime and treat state 'Z' as dead, eliminating the extra ps spawn. On macOS, the lstart `ps` output alone can serve (a dead pid errors); consider caching identities for a short TTL in polling loops that probe the same pid repeatedly.

13. [ ] **coordinator** | `lib/project-context.js:600` | needless-repetition
   getPaneFilePath() and getSnapshotFilePath() (lines 600-681) duplicate the same legacy-slug selection plus `${key}__${slug}.json` filename construction; only the directory differs.
   *Recommendation:* Extract a shared keyFilePath(directory, key, repoRoot, options) helper used by both.

14. [ ] **coordinator** | `lib/validation-session.js:171` | code-structure
   validateCoordinatorStateFile() and validateFixerResultFile() call validateCoordinatorFile() (which already reads and JSON-parses the file at line 164) but discard the parsed object, then immediately re-read and re-parse the same file via readJson. Additionally, validateCoordinatorFile's name misleads: it is also the validator for fixer envelopes and results.
   *Recommendation:* Have the base validator return { basename, sha256, parsed } so callers validate the parsed schema without a second read, and rename it to something neutral like validateBoundedJsonArtifact.

15. [ ] **coordinator** | `lib/validation-session.js:435` | code-smell
   Dead conditional in the open-lock error message: the throw at line 431 only executes when lockHolderAlive(...) && !agedOut, so the ternary (agedOut ? '' : ' or remove a stale lock manually...') always selects the second arm.
   *Recommendation:* Remove the ternary and always append the 'remove a stale lock manually' clause.

16. [ ] **coordinator** | `lib/validation-session.js:594` | readability
   Two stacked JSDoc blocks now precede readSessionStateLightweight: lines 594-602 are withRunLock's original doc ('Serialize an authenticated state mutation...') left orphaned when the new function was inserted above it, followed by the new function's own doc at 603-608. The first block describes code 13 lines below, misleads readers of the hot-path helper, and reads as a copy-paste artifact.
   *Recommendation:* Move the 594-602 block down to sit directly above withRunLock (line 622), leaving only the 'Cheap state read for hot paths' doc on readSessionStateLightweight.

17. [ ] **coordinator** | `pi-extension/lib/project-context-core.js:103` | needless-repetition
   isContained() now exists in three private copies (pi-extension/lib/project-context-core.js, lib/project-context.js isContainedBy, bin/groundwork-run.js isContained). The pi copy is intentionally dependency-free and the runner bundle is intentionally standalone, so the duplication is defensible, but it is undocumented at the duplication sites.
   *Recommendation:* Leave the copies in place (bundle independence is load-bearing) but add a one-line comment at each noting the canonical semantics they must mirror, so the three cannot drift.

18. [ ] **coordinator** | `tests/groundwork-run.test.js:1450` | implementation-coupling
   The identity-delegation test slices the runner source between 'function activeProjectOwners' and 'function acquireRepositoryGate' and asserts the body lacks '`task/${' and ".worktrees', holder.taskId". Function-boundary slicing breaks silently if either anchor function is renamed or reordered (indexOf returns -1 and the slice is empty, making the assertion vacuously true).
   *Recommendation:* Guard the anchors: assert indexOf('function activeProjectOwners') !== -1 and that the end index is greater than the start index before slicing, so a refactor fails loudly instead of turning the check into an always-pass.

19. [ ] **coordinator** | `tests/groundwork-run.test.js:7180` | missing-test
   Plan slice 4 requires the capability to be absent from reporter artifacts/events ('never in reporter events'). The runner-arbitration tests assert the retained capability file is mode 0600 and never stored for sessions the runner does not own, but no test asserts reporter events / run-reporting output exclude the owner token.
   *Recommendation:* Extend 'runner-owned continuation resumes through its retained capability' (or the capability-leak test in tests/validation-session.test.js) to run one report emission with the token in scope and assert the produced report/event stream does not contain it.

20. [ ] **coordinator** | `tests/pi-extension.test.js:263` | logic-in-test
   assert.ok(!/name:\s*\\?/.test('') && !projectContext.includes('- name:')) — the first conjunct runs a regex against the empty string, which is always false, so !false is always true. It is dead logic (likely a refactoring leftover) that makes the line read as if two checks exist when only one does.
   *Recommendation:* Delete the always-true conjunct and keep the real assertion: assert.ok(!projectContext.includes('- name:'), 'project-context.ts must not parse the list-style schema itself').

21. [ ] **coordinator** | `tests/project-context.test.js:1304` | implementation-coupling
   'the pin hook never consults shared pane state for a pin decision' asserts on hook source text (!hook.includes('restorePaneSelection') / !hook.includes('>= snap')). This couples the test to exact identifier spelling and will silently stop guarding if the hook is refactored to an equivalent call under a different name, while passing today even if a renamed arbitration path is reintroduced.
   *Recommendation:* Keep it only as a supplementary policy lint (like path-safety), but rely on the existing behavioral tests (same-second arbitration test at line 1111 already pins the invariant). Consider asserting the outcome only, or move the source scan into tests/path-safety.test.js where source-scanning is the declared policy.

22. [ ] **coordinator** | `tests/skills-core.test.js:1` | missing-test
   lib/skills-core.js resolveTemplateVariables() was changed in this delta to emit the absolute project_root (slice 2 contract), but no test asserts the new absolute output for this function. Only the parallel implementation in lib/resolve-template-vars.js is covered (tests/plans-dir.test.js hook wiring). The two copies of the binding contract can now diverge without a failing test.
   *Recommendation:* Add one focused test in tests/skills-core.test.js asserting resolveTemplateVariables('{{project_root}}') yields the absolute project root (and '{{specs_dir}}' absolute), mirroring the plans-dir hook assertion — or consolidate both resolvers on one tested implementation.

23. [ ] **coordinator** | `tests/validation-session.test.js:1107` | test-quality
   The takeover test's key negative assertion waits 2000ms for an 'unfenced takeover' that must NOT happen, then asserts unfencedTakeover === false. Timing-based negative assertions are inherently load-sensitive: I observed this suite fail 3 tests on one run and 1 on the next while the repair files were being written concurrently, before three consecutive clean passes. The 2s window can false-positive (flag a correct serialization as unfenced) on a heavily loaded machine.
   *Recommendation:* Lengthen the negative window or make it load-tolerant (e.g., scale with an env override, or assert instead on the taker's observed blocking: after releasing the mutation lock, the takeover completing with epoch+1 and the old-owner record never reappearing is the deterministic part and is already asserted — the strict unfencedTakeover === false check is the only timing-fragile line and could be advisory).

24. [ ] **coordinator** | `tests/validation-session.test.js:1122` | non-deterministic
   The takeover-serialization test's negative check waits a fixed 2s window for an 'unfenced takeover' epoch bump and treats timeout as proof of serialization. On a severely loaded machine a buggy (unfenced) taker might not publish within 2s, letting the bug false-pass this specific assertion.
   *Recommendation:* Acceptable as-is because the load-bearing final-state assertions (epoch bumped, tokenDigest rotated after the old owner's direct publish) independently catch the bug — they are what failed on pre-repair code. Optionally raise the window or comment that the final assertions are the real fence proof.

25. [ ] **coordinator** | `tests/validation-session.test.js:1171` | missing-test
   withHeartbeatLock's defensive fallback to withRunLock (unrecognized owner shape / non-v2 state on the lightweight read) and releaseOpenLockVerified's unreadable-file leave-alone branch (lib/validation-session.js) are exercised only implicitly, not by dedicated tests.
   *Recommendation:* Add one test writing a malformed owner object to the state file and asserting a beat still succeeds via the fully verified path; add one test making the lockfile unreadable before release and asserting it is left in place.

26. [ ] **coordinator** | `tests/validation-session.test.js:1222` | implementation-coupling
   assert.strictEqual(counter.gitSpawns, 1) couples the test to the exact number of git invocations inside loadSession; a behavior-preserving refactor that legitimately issues two git calls would break it.
   *Recommendation:* Fine to keep since the exact count is the regression being pinned (pre-repair doubled it to 2); if loadSession's git usage ever becomes an implementation detail, relax to counter.gitSpawns <= 1 or assert the delta relative to a control path.

27. [ ] **coordinator** | `tests/validation-session.test.js:760` | non-deterministic
   The live-heartbeat test sleeps a fixed 400ms and asserts lastBeat changed (beat interval 100ms via GROUNDWORK_VALIDATION_BEAT_MS). Under heavy CI load a 400ms window can pass without an observed beat, producing an intermittent failure — the only fixed-sleep-as-assertion-margin in the otherwise barrier-deterministic suite.
   *Recommendation:* Replace the sleep+compare with the suite's existing waitFor() helper: waitFor(() => heartbeatState(created.runDir).lastBeat !== before, 10000, 'heartbeat advancement'). Same idea applies to the real-time staleness wait at line 799, which already uses waitFor correctly.
