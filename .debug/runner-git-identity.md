# Debug: runner-git-identity

## Status
Fixed

## Symptoms
- Runner-owned commit fails with `Author identity unknown` after the user configures global `user.name` and `user.email`.
- Failure repeats in the preserved `TASK-188` worktree.

## Reproduction
### Command Executed
```bash
git init -q -b main
env GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null git \
  -c core.hooksPath=/dev/null \
  -c core.fsmonitor=false \
  -c commit.gpgsign=false \
  commit --allow-empty -m 'TASK-000: reproduce runner identity failure'
```

### Actual Output
```text
Author identity unknown
fatal: unable to auto-detect email address (got 'etr@Sebastianos-Air.(none)')
```

### Expected Output
Runner-owned commit succeeds using the invoking user's Git identity.

### Matches User Report?
Yes. Same identity error and exit status 128 as the runner-owned TASK-188 commit.

## Hypotheses

### Active
- None.

### Eliminated
- [x] The user's global identity was not saved: ordinary `git var GIT_AUTHOR_IDENT` resolves `Sebastiano Merlino <sebastiano@hey.com>`.
- [x] Global-config hardening must be removed: the fix preserves it and passes only resolved identity fields to commit-producing commands.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | User reran after setting global identity | Runner still reports no author identity | Identity is not visible to runner-owned commit; reason not yet isolated |
| 2 | Ran runner-equivalent commit in a temporary repository | Exact identity error, exit 128 | Failure is reproducible outside Lam |
| 3 | Removed only `GIT_CONFIG_GLOBAL=/dev/null` from the reproduction | Commit succeeded | Global-config suppression is the causal variable |

## Root Cause
**Verification level:** Verified

`execGit` sets `GIT_CONFIG_GLOBAL=/dev/null` on every Git subprocess. Runner-owned commits were added later through `sealPreparedCommit`, so they inherited the older read-operation hardening and lost the user's only configured author/committer identity. Removing that one environment override makes the same commit succeed, while keeping it reproduces the reported failure.

## Fix
Before a commit-producing Git command, resolve Git's effective author and committer identities through `git var`. Pass only the resolved name/email fields into the runner's otherwise sanitized Git environment. Keep `GIT_CONFIG_GLOBAL=/dev/null` for the actual commit and merge operations.

## Resolution
- Regression test: `runner seals prepared changes with a global-only Git identity` failed with the reported identity error before the fix and passes after it.
- `bash tests/run-tests.sh`: all suites passed.
- Installed the tested runner at `/Users/etr/.codex/groundwork-run.js`.
