# Debug: maillist runner validation time

## Status
Root Cause Found

## Symptoms
- Groundwork runner tasks for ArtistAI `maillist` often appear to spend more than one hour in validation.
- Need phase/round timing and comparison with historical Claude sessions.

## Reproduction
### Command Executed
```bash
node /private/tmp/analyze-maillist-validation.mjs
node /private/tmp/gw_session_timing.js
```

Parsed runner `events.jsonl`/`transcript.jsonl` for maillist TASK-006..017 and raw Claude ArtistAI JSONL history.

### Actual Output
- 12 successful maillist validations: median 80.6m, mean 79.7m, 9/12 over 60m.
- Median 4 iterations; 8/12 exceeded 3. Mean 2.75 repair passes, 19.1 fixed findings, 21.7 reviewer calls.
- Ten runs with timestamped transcripts: repair-stage 55.0%, initial project-gate stage 14.6%, initial+closure review 27.1%, init/persistence 3.3%. Repair includes its required post-fix gate reruns.
- Median implementation phase 11.9m; median validation/implementation ratio 7.2x.
- TASK-017: 11.9m implementation, 95.1m validation, 5 iterations, 4 repairs, 20 fixes. Stage split: 59.1m repair, 24.0m review, 9.5m initial gates, 2.6m init/persistence. Five test+enforcer barriers consumed about 10.4m; setup/Ruff added about 0.9m.
- Historical Claude: 69-run iteration cohort median 2, p90 3, 8.7% over 3; timed sample median 19.0m per iteration and 36.0m for two-iteration validation. Current maillist median is 20.0m per iteration.

### Expected Output
Validation time should be attributable to concrete gates, reviewer rounds, repair, or orchestration overhead.

### Matches User Report?
Yes.

## Hypotheses

### Active
- [ ] Exact task-paired Claude/Codex A/B would separate task-mix effects from implementation quality.

### Eliminated
- [x] Current rounds are intrinsically slower than Claude: median per-iteration wall time is 20.0m versus 19.0m.
- [x] Setup/finalization is mislabeled as validation: phase boundaries are explicit; init/persistence is 3.3% of timed validation.
- [x] Full gates alone explain the hour: TASK-017's five barriers were about 11.3m including setup/Ruff, while repair+review was about 83m.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Parsed 13 validation attempts for TASK-006..017 | 12 pass; TASK-008 also had an earlier failed 89.4m attempt | Current cohort is measurable from durable runner state |
| 2 | Counted phase and iteration events | Median 4 receipt iterations; 8/12 over 3 | Raw receipts appear roughly twice Claude's usual reviewer-round count, pending counter normalization |
| 3 | Segmented timestamped validation transcripts | 55.0% repair, 27.1% review, 14.6% initial gates | Repair/re-review dominates wall time |
| 4 | Compared implementation/validation phase times | 11.9m vs 80.6m medians; validation 7.2x implementation | Work is shifting into the validation-fixer loop |
| 5 | Parsed raw Claude ArtistAI sessions | Per-round timing is similar; Claude usually converged in 2 rounds | Harness speed is not the primary current delta |
| 6 | Inspected TASK-017 | 20 fixes across 4 repair passes after an 11.9m implementation | Concrete example matches aggregate cause |
| 7 | Normalized current durable validation artifacts | 48 receipt iterations contain 34 reviewer batches and 14 gate-only cycles | Raw current `iterations` and historical Claude reviewer iterations are not identical counters; normalized current median is 3 reviewer batches versus Claude's 2 |
| 8 | Classified all 22 current closure findings | 20 `introduced-by-fix`, 1 `invalidated-prior-assumption`, 1 `initial-audit-miss` | Closure review is mostly catching fixer regressions, not reopening unchanged scope |
| 9 | Compared implementation handoffs | 8/10 timestamped current receipts did not claim both the full repository suite and enforcer green; TASK-017 handed off 4 passed/1 skipped focused tests | Codex often enters validation before deterministic integration evidence is complete |
| 10 | Compared representative implementation growth | Claude TASK-007: 429 initial additions, 548 after validation; Codex TASK-017: 487 initial additions, 1,387 after validation | Similar-sized initial changes diverged sharply because validation added about 119 versus 900 lines |
| 11 | Compared harness model topology | 29/30 historical Claude `work-on-next-task` root sessions ran an Opus-family model; only `task-executor` inherited it, while routine Claude reviewers/fixer explicitly used Sonnet. Current Codex maps task-executor and routine fixer/reviewers to Terra, simple reviewers to Luna, security/elevated fixing to Sol | Claude used Opus for implementation but not for nearly every validation agent; model topology alone cannot explain repair convergence |
| 12 | Inspected TASK-017 causal closure | Broad repair miswired security context models/declared fields; later closure repair corrected them | Concrete extra reviewer round was caused by repair implementation errors, despite exact closure briefs |
| 13 | Checked the implementation completion contract | Task executor says `All tests pass` and changed-file lint/static analysis; validate requires implementation complete/tests pass, but no core Groundwork step requires a repository-wide gate receipt before `RESULT: IMPLEMENTED` | Claude front-loaded full ArtistAI gates in representative runs; current Codex may defer them to validation without violating an explicit Groundwork phase boundary |
| 14 | Traced ArtistAI's explicit full-gate rule | `.clinerules/rules.md` gained the full repository completion gates on 2026-08-27, after the July Claude comparison sessions; the runner marks the task complete only after validation/finalization | The current repository requires full gates before task completion, but not specifically before the implementation-phase receipt |
| 15 | Compared validation placement | Historical Claude 3.1.0 validation had no mandatory pre-review project-gate barrier; current Codex validation policy runs the complete required gate set before reviewers and after every fixer | Claude commonly front-loaded gates into implementation; current Codex deliberately owns them in validation, producing gate-only receipt iterations |

## Root Cause
**Verification level:** Corroborated

Most current maillist validation wall time is spent repairing reviewer/gate findings and causally re-reviewing those repairs, not executing the repository test commands. The runner averages four receipt iterations and 19 fixes after a median 11.9-minute implementation phase. Four is partly an accounting artifact: 14/48 current iterations are gate-only cycles, leaving a median three actual reviewer batches versus Claude's historical median two. The remaining convergence gap is real. Codex frequently hands validation a focused-only implementation, and its repair agents then introduce defects: 20/22 closure blockers are explicitly `introduced-by-fix`. Historical Claude normally used an inherited Opus model for task implementation, but its routine reviewers and validation-fixer explicitly used Sonnet; it nevertheless spent materially longer in implementation, entered representative validations with full tests/enforcer green, and usually closed a multi-finding fixer batch in one pass. Current Codex tiers implementation/routine fixing to Terra and simple review to Luna, reserving Sol for security and elevated repairs. Task mix prevents a causal model-only claim, and an elevated Sol repair introduced TASK-017's closure defects. The artifact evidence therefore localizes the remaining failure to implementation completeness and multi-finding repair correctness, not reviewer scope drift, orchestration latency, gate runtime, or a proven single-model cause.

## Fix
No fix requested. If fewer validation iterations are the goal, candidate experiments are an explicit opt-in full-gate implementation receipt and a stronger task-executor model. Neither is currently a core Groundwork requirement. Preserve the current one comprehensive audit plus narrowly causal closure review, which is correctly detecting repair regressions.

## Resolution
Analysis complete; no runner change authorized.
