# Debug: Runner Codex Approval Flags

## Status
Fixed

## Symptoms
- Codex planning exits with status 2 before any model work.
- Error: `the argument '--approve-for-me' cannot be used with '--sandbox <SANDBOX_MODE>'`.

## Reproduction
### Command Executed
`codex exec --ephemeral --approve-for-me --sandbox workspace-write -C /Users/etr/progs/artistai -`

### Actual Output
Codex exits 2 because `--approve-for-me` and `--sandbox` conflict.

### Expected Output
The adapter should select automatic approval with workspace-write exactly once.

### Matches User Report?
Yes. Same Codex parser error and exit status.

## Hypotheses

### Active

### Eliminated
- [x] User configuration causes the conflict: the installed CLI help defines the two flags as mutually exclusive at argument parsing.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Inspected `codex exec --help` on Codex 0.147.0 | `--approve-for-me` routes approvals using workspace-write | Explicit `--sandbox workspace-write` is redundant |
| 2 | Located `buildInvocation` | It emits both flags | Adapter constructs the invalid invocation |

## Root Cause
**Verification level:** Verified

The Codex adapter passes both `--approve-for-me` and `--sandbox workspace-write`. Codex 0.147.0 defines `--approve-for-me` as the combined automatic-review/workspace-write mode and rejects an additional sandbox selector.

## Fix
Retained `--approve-for-me` and removed the redundant `--sandbox workspace-write` pair. The combined flag preserves automatic approval review and workspace-write isolation.

## Resolution
- Regression test failed on the old argument vector, then passed after the change.
- Focused runner suite: 37 passed, 0 failed.
- Installed Codex 0.147.0 accepts the corrected argument vector.
