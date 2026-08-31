# Debug: Claude vs Codex Groundwork throughput

## Status
Root Cause Found

## Symptoms
- User reports that Groundwork implementation and validation in the ArtistAI monorepo felt materially faster under Claude Code than under Codex.
- Comparison should exclude the known excess Codex validation-round problem and isolate speed within comparable work.

## Reproduction
### Command Executed
- Parsed 95 Claude ArtistAI JSONL sessions and 1,695 Codex ArtistAI-rooted session files with `/private/tmp/gw_session_timing.js`.
- Deduplicated Codex turns by `turn_id`; separated tool time, model gaps, implementation outcomes, validation outcomes, and human pauses where the trace format allowed.
- Compared the July Claude validation skill with the installed Codex export and inspected current Codex concurrency/network configuration.

### Actual Output
- Model action after tool result: Claude median 5.4s (`n=10,421`); Codex median 2.7s (`n=41,386`).
- Two-iteration validation: historical Claude median 2,162.3s (`n=8`); all Codex median 2,165.1s (`n=7`).
- Two-iteration Codex validation since 2026-08-10: median 3,105.6s (`n=3`), 943.3s slower than historical Claude.
- Historical ArtistAI gates: tests 256.9s + enforcer 185.5s = 442.4s. Two complete gate barriers cost 884.8s, close to the observed recent delta.
- Claude work-on start to implemented: median 2,712.9s for runs under two hours (`n=19`). Adjacent Codex TASK-030/031/032 plan+implementation active times were about 3,125s, 2,079s, and 1,870s; median about 2,079s.
- Early Codex TASK-030 explicitly ran reviewer waves under three available slots. Current configuration sets 12 slots.
- Current Codex validation export requires the complete repository gate before the initial reviewer batch and after every fixer mutation. The Claude source workflow has no equivalent project-gate barrier.

### Expected Output
A timing decomposition that distinguishes harness/model latency from workflow policy and task-selection effects.

### Matches User Report?
Partially. Recent Codex validation is materially slower after controlling for iteration count; implementation and base model/tool cadence are not slower in the available traces.

## Hypotheses

### Active
- [ ] H5: Exact task-paired A/B validation would further quantify residual model/reviewer variance; historical tasks are not identical.

### Eliminated
- [x] H1: Codex base action latency is slower. Contradicted by 2.7s versus 5.4s median post-tool model gap.
- [x] H2: Codex implementation is generally slower. Contradicted by adjacent work-on samples and direct implementation outcomes.
- [x] H4 as the primary cause: repository growth contributes, but adjacent tasks and the policy-aligned 15-minute delta show it is not sufficient.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Resolved Codex runtime context | gpt-5.6-sol, high effort | No model-switch warning required; current diagnosis can proceed. |
| 2 | Parsed raw harness traces | Overall two-iteration medians are effectively equal; recent Codex median is about 15m44s slower | No general Codex speed deficit; a recent policy change matters. |
| 3 | Diffed validation workflows | Codex alone adds complete project gates before review and after every fixer | Confirmed systematic per-iteration tax. |
| 4 | Inspected early/current concurrency | Early trace: 3 slots; current config: 12 | Early reviewer waves were serialized; this cause is already fixed. |
| 5 | Inspected current egress profile | Narrow CloudFormation/npm allowlist is present | Repeated sandbox reruns should be reduced in new ArtistAI sessions. |

## Root Cause
**Verification level:** Corroborated

The user's recent validation-speed impression is correct, but the cause is not slower Codex inference. The remaining systematic delta is the Codex-specific complete-gate barrier: ArtistAI pays a roughly 7m22s repository gate before the first reviewer batch and again after each fixer mutation. For a two-iteration run, the predicted 14m45s tax closely matches the observed post-policy median regression of 15m43s.

Early Codex runs also serialized reviewer waves through three agent slots and repeatedly lost monorepo project context or hit AWS/npm sandbox barriers. Current configuration addresses concurrency and egress. Task mix remains a confounder: later Codex tasks include import/erasure/CI/Qwen cross-runtime work, while many Claude samples are narrower CRUD/frontend tasks.

Implementation traces do not support a Codex slowdown. Base model action latency is faster in Codex, and comparable plan+implementation phases overlap or favor Codex.

## Fix
Diagnosis only; no fix authorized or planned in this turn.

## Resolution
Diagnosis complete. No production/workflow fix was authorized. Best next optimization target: remove redundant complete-gate repetitions while preserving a final same-tree full-gate guarantee, or first reduce the ArtistAI gate from the historical 7m22s toward the already-documented target.
