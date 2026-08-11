# Debug: Codex vs Claude validation loop

## Status
Fixed and merged

## Symptoms
- User reports Groundwork validation+fix loops get stuck more often on Codex than historical Claude Code runs.
- Comparison target: local Claude and Codex session histories.
- User likely meant they recently switched from Claude Code to Codex; this will be verified from session dates and content.

## Reproduction
### Command Executed
```bash
node /tmp/analyze-validation-sessions.js claude
node /tmp/analyze-validation-sessions.js codex
```

The analyzer grouped Claude history by `/skills/validate` invocation and Codex history by Groundwork findings directory, then counted validation iterations, reviewer/fixer activity, completion, and coordination waits. Representative raw timelines were checked directly to guard against parser ambiguity.

### Actual Output
- Comparable post-2026-07-19 cohort: Claude 69 runs versus Codex 18 identifiable findings-directory runs.
- Claude: median 2 iterations, p90 3, maximum 8; 6/69 (8.7%) exceeded 3 iterations; 68/69 reached an approval terminal state.
- Codex: median 3 iterations, p90 8, maximum 11; 6/18 (33.3%) exceeded 3 iterations; 12/18 reached an approval terminal state.
- Codex 2026-08-06 example: 11 iterations, 91 reviewer runs, 10 fixer runs, 233 one-minute `wait_agent` calls, about 217 minutes.
- Codex 2026-08-10 example: six directly verified iterations, 51 reviewer runs, 6 fixer runs, 196 waits, and no terminal result in the captured root session.
- Typical Claude example (TASK-007): 2 iterations, 1 fixer, 17 native Agent calls, no model-turn polling. Re-review prompts named the exact prior finding and exact fix to verify.

Codex iteration tagging has one limitation: some reviewers read older findings files, so the analyzer can over-attribute a later iteration to their session. Aggregate distribution is directional; the 11-iteration run and the six-iteration incomplete timeline were verified directly.

### Expected Output
Codex validation loops should converge or terminate at rates comparable to Claude Code for similar Groundwork workflows.

### Matches User Report?
Yes. Codex has roughly 4x the observed share of validation runs exceeding three iterations, a materially longer tail, repeated task restarts, and orders of magnitude more root-agent coordination turns.

## Hypotheses

### Confirmed
- [x] Codex orchestration uses a constrained, manually polled fan-out rather than Claude's native parallel Agent gather. Eleven requested reviewers cannot fit the four-slot session limit.
- [x] The loop is unbounded and can expand its own review surface: fixes introduce architecture, schema, infrastructure, and test changes that trigger new findings.
- [x] Codex export loses Claude agent frontmatter semantics: `skills: groundwork:test-driven-development` and `maxTurns: 100` are absent from the installed TOML, while the fixer body still claims TDD is preloaded.
- [x] Fresh Codex reviewers receive findings paths/IDs but not a precise prior-finding and fix delta. Historical Claude runs supplied that detail and performed narrower rechecks.
- [x] Codex reviewer/fixer model heterogeneity contributes to inconsistent thresholds and fix quality, but is not sufficient by itself to explain the regression.

### Eliminated
- [x] Newer core validation workflow as the primary cause: the historical Claude 3.1.0 `validate` and `validation-fixer` files are byte-identical to current source.
- [x] Permission failures as the primary cause: concrete long loops progressed through successful writes/tests but kept generating new findings.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Located local histories | Claude project JSONL and Codex dated session directories exist | Cross-harness comparison is feasible |
| 2 | Compared post-2026-07-19 cohorts | `>3` iterations: Claude 8.7%, Codex 33.3%; p90: 3 versus 8 | Reported regression is visible in local history |
| 3 | Inspected Codex long runs | 196-233 one-minute waits; 51-91 reviewer runs | Root context is consumed by orchestration/polling |
| 4 | Traced 11-iteration run | Iteration 4 redesign caused 9/11 iteration-5 reviewers to reopen work across domains | Fix loop crossed into architecture/feature development |
| 5 | Inspected loop contract | `ALL approve`, no cap/budget; stuck key needs fields the orchestrator forbids itself to read | Termination safeguards are ineffective |
| 6 | Diffed Claude and Codex agent forms | Codex drops `skills` preload and `maxTurns`; representative fixer did not load TDD | Export changes fixer behavior and removes a bound |
| 7 | Compared re-review prompts | Claude prompts included prior finding + performed fix; Codex policy uses fresh context with paths/IDs | Codex reviewers tend to re-audit instead of verify a delta |
| 8 | Checked version history | Current and cached Claude 3.1.0 core files match | Harness adaptation, not source-version drift, dominates |
| 9 | Refreshed git history | `git fetch --all --prune` completed | Local commit comparison is current |

## Root Cause
**Verification level:** Corroborated

The primary cause is a workflow/harness topology mismatch amplified by a non-terminating repair policy. Groundwork asks for up to eleven simultaneous reviewers and passive aggregation. Codex has four total session slots, so validation is serialized into waves and the coordinator repeatedly performs one-minute `wait_agent` turns. That creates context churn and mutable shared state before fixing begins.

The repair state machine then requires unanimous approval forever, has no iteration/change/scope budget, and has a stuck detector that cannot derive its declared `[Agent]-[Category]-[File]-[Line]` key from the IDs it retains. Broad fixer changes increase the changed surface and cause previously clean domains to reopen. Codex-specific context isolation and lossy agent export further weaken continuity and TDD discipline. Model mapping contributes, but bad runs occurred both before and after the reviewer model split.

## Fix
- Kept validation uncapped.
- Preserved original finding identity across focused rechecks with explicit `resolved`, `persists`, and `regressed` lifecycle states.
- Passed coordinator-owned prior findings, structured fixer results, touched files, and scoped post-fix evidence to fresh reviewers without forking conversation history.
- Added read-only detection and an opt-in recommendation for `[agents].max_concurrent_threads_per_session = 12`; Groundwork never edits the global Codex configuration automatically.
- Replaced fixed-interval polling guidance with notification-driven long waits.
- Made Codex fixers load TDD explicitly and emit schema-validated result artifacts.
- Hardened findings/result paths, IDs, helper installation, and symlink boundaries.
- Mapped validation coordination and elevated cross-domain fixing to Sol/high, routine blocking validation work to Terra/high, and retained Sol/high for security review.

## Resolution
- Merged to `main` in `6b1b160`.
- `tests/validate-fixer-result.test.js`: 28 passed, 0 failed.
- `tests/install-config.test.js`: 59 passed, 0 failed with the statusline changes applied.
- `bash tests/run-tests.sh`: all suites passed.
- Targeted security, test-quality, and code-quality re-reviewers approved the final implementation.
