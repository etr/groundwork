# Debug: TASK-071 validation runaway

## Status
Fixed

## Symptoms
- Codex validation for `~/progs/artistai`, TASK-071, reached fixer iteration 7.
- A fully approved loop was followed by an enforcer fix, then validation restarted and expanded again.

## Reproduction
### Command Executed
Parsed the live Codex root session and its child fixer sessions:

```text
node -e '<extract assistant, agent, spawn, gate, and polling events>' \
  /Users/etr/.codex/sessions/2026/08/10/rollout-2026-08-10T20-08-24-019feeca-ecc2-7522-bc3d-d1b707463dab.jsonl
```

Inspected the actual enforcer invocations and outputs persisted at root-session ordinals 1240–1440 and 1812–1858. This is the live failing execution, not a simulation. Did not rerun enforcer because another Codex session is actively mutating the same TASK-071 worktree.

### Actual Output
- Iteration 5: `5 approve / 0 request-changes` at 04:26:47.
- Coordinator then ran full tests and `scripts/enforcer.py`, despite Groundwork step 4.5 saying `ALL approve -> PASS, return success`.
- First enforcer pass found six local structural/format failures plus network-only failures.
- `validation_fixer_enforcer` changed eight files, including a handler module split.
- Post-fix enforcer was run through `tail -n 120`. Its summary said `40/44 checks passed`, but the retained tail showed only cloudformation, private-import, and code-duplication failures. The earlier `typed-signatures` failure section was dropped.
- Coordinator incorrectly reported that only one local private-import violation remained, fixed it, and launched iteration 6.
- Iteration 6: seven focused reviewers approved.
- A later enforcer run retained the missing section and reported seven `typed-signatures` violations in the enforcer-created/refactored files.
- `validation_fixer_typed_signatures` changed eleven files. Iteration 7 then found a new major production fallback inconsistency introduced by that refactor.
- The iteration-7 fixer then changed two files and launched five iteration-8 reviewers (code, test, architecture, performance, simplification).
- Root-session totals at the latest observation: 58 spawns, 59 follow-ups, 35 fixed 30-second shell polls.

### Expected Output
Required repository gates should be green before a review batch is allowed to become terminal. A final full gate run should be a read-only confirmation, not the first discovery of accumulated structural failures.

### Matches User Report?
Yes. Direct timeline: iter5 fully approved -> enforcer mutation -> iter6 fully approved -> hidden enforcer failures discovered -> typed-contract mutation -> iter7 new major -> fixer iter7 -> iter8 focused review.

## Hypotheses

### Active
- [ ] Cross-cutting fix batches running on Terra/high rather than Sol/high increase regression risk. Corroborated but not independently causal.

### Eliminated
- [x] Concurrency remained at four: runtime and session developer context report 12 agent slots plus the root (13 total).
- [x] Old installation: the session loaded the installed continuity/concurrency policy and used `fork_turns=none` targeted rechecks.
- [x] Full reviewer-suite reruns: iterations 2–7 were domain-targeted, though broad structural changes caused seven domains to be selected.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Read installed skill | Step 4.5 says all approve means PASS/return; tests are a prerequisite | Review-loop terminal state and repo final gates are not integrated |
| 2 | Parse root timeline | Iter5 approved, then enforcer ran and mutated source | Approval was treated as provisional |
| 3 | Inspect post-fix enforcer command | Output piped through `tail -n 120` | Early failures could be hidden |
| 4 | Compare summary and retained failures | 40/44 passed, but only three failed checks visible | One failed check section was omitted and the mismatch ignored |
| 5 | Inspect later enforcer output | Missing failed check was `typed-signatures`, seven violations | Hidden gate failures directly caused the iter6 -> iter7 restart |
| 6 | Inspect fixer manifests/results | Enforcer and typed fixers reused clean reviewer manifests and returned `findings_fixed: []` | Stable finding identity does not cross the repo-gate boundary |
| 7 | Inspect model bindings | Coordinator Sol/high; both cross-cutting post-approval fixers Terra/high | Cross-cutting elevation policy was not applied |
| 8 | Inspect reviewer verdict rules and validator | Reviewer contracts intentionally allow approval with isolated majors; validator rejects every `approve` containing any major | The new validator imposed an incorrect global verdict invariant and caused repair follow-ups |
| 9 | Count orchestration calls | 58 spawns, 59 follow-ups, 35 shell polls; spawns serialized despite 13 slots | Added latency/context churn is independent of finding convergence |
| 10 | Compare historical Claude ArtistAI validation | Claude fixers reported all repo gates green before launching the next reviewer iteration; final gates were confirmation | Current Codex ordering, not the existence of a final gate, is the behavioral regression |
| 11 | Trace `validate-fixer-result.js` history and call sites | Added by Codex-parity commit `8cad070`; invoked only through Codex export policy/installer. Original Claude flow had direct coordinator parsing plus a non-blocking `SubagentStop` diagnostic hook | The strict artifact validator is a Codex-specific addition, not inherited Claude behavior |
| 12 | RED/GREEN verdict tests | Old validator rejected approve+major and accepted no-action request-changes after the first correction; narrowed rules now accept approved majors, reject approved criticals, and require request-changes to contain a critical/major | Verdict thresholds and fixer liveness are both preserved |
| 13 | Inspect transformed Codex workflow | Prepending policy left a legacy direct-path fixer block and ID-reconstruction rule in the detailed workflow | Replaced the detailed block with the manifest/result contract and removed direct ID construction |
| 14 | Full and export verification | Full repository suite passed; final Codex installer matrix passed 59/59; independent code review approved | Fix is verified across source and installed output |

## Root Cause
**Verification level:** Verified

The immediate restart was caused by lossy gate output. After the enforcer-driven refactor, Codex piped the full enforcer report through `tail -n 120`. The summary proved four checks failed, but the visible tail contained only three failure classes. Codex ignored that inconsistency, declared local failures reduced to one, and ran iteration 6. The omitted fourth failure was `typed-signatures` with seven violations. The next wider enforcer capture exposed them after iteration 6 had approved, forcing the typed-contract fixer and iteration 7.

The systemic cause is gate ordering/state design. ArtistAI's AGENTS instructions require full tests and enforcer before completion, while `groundwork-validate` models tests as a prerequisite and declares reviewer approval terminal. Codex accumulated reviewer fixes, waited for reviewer convergence, then ran the repo gate. Any gate-driven source fix necessarily invalidated approval. Those gate findings were not entered into the stable-ID manifest; clean reviewer manifests were reused with zero requested IDs. This created untracked mutation/re-review cycles rather than one continuous validation state machine.

Amplifiers: cross-cutting post-approval fixes ran on Terra/high instead of the policy's Sol/high elevation; the new validator contradicts agent-specific verdict thresholds by rejecting valid `approve` responses containing isolated majors; agent fan-out was serialized; long shell jobs were polled every 30 seconds.

## Fix
- Narrowed validator verdict enforcement: approve may contain reviewer-threshold-allowed majors, never criticals; request-changes must contain an actionable critical/major.
- Added stable finding fingerprints and ledger references without weakening path, symlink, schema, count, or ID checks.
- Added a concrete project-gate barrier before the first review and after every fixer mutation. Gate output is retained completely and gate failures become `project-gates` manifest findings.
- Replaced the exported Codex skill's legacy direct findings-path fixer block with the validated manifest/result-file contract.
- Restricted fix scope to validator-authorized request-changes/gate IDs; approved majors persist as unworked.
- Made targeted re-review context, deterministic Sol/high cross-domain elevation, batched reviewer spawning, and notification-driven long waits executable policy.

## Resolution
Implemented and verified:

- `node tests/validate-fixer-result.test.js`: 34/34 passed.
- `node tests/apply-codex-skill-policy.test.js`: 5/5 passed.
- `node tests/install-config.test.js`: 59/59 passed.
- `bash tests/run-tests.sh`: all suites passed.
- `node lib/validate-plugin.js`: 0 errors; one pre-existing `Skill` hook-matcher warning.
- Independent code-quality re-review: approve.
