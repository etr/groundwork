# Debug: GitHub Actions main failure

## Status
Fixed

## Symptoms
- GitHub Actions workflow `Test` fails on `main`.
- Latest failed run: `33456985302` for commit `3dd4e3b`.
- The preceding runs for `0b0e5e3` and `d5366e7` also failed; the most recent successful run was `31549217651` for `500a3c6`.
- An unchanged rerun of `33456985302` reproduced a Git-history assertion failure and two incomplete installer-fixture failures.

## Reproduction

### Command Executed
GitHub Actions executed:

```bash
bash tests/run-tests.sh
```

Local causal reproduction executed the real renderer with a temporary Git repository, a delayed fake `gh`, and a PID-recording `nohup`:

```bash
node /private/tmp/reproduce-statusline-background.js
```

### Actual Output
GitHub Actions:

```text
✗ strips actual terminal control bytes from project text
  ENOTEMPTY: directory not empty, rmdir '/tmp/gw-statusline-project-control-VSzZxj'
30 passed, 1 failed
```

Local causal reproduction:

```text
renderer_returned_with_background_pid=97787
late_cache_entries=8a6f1c8182a503ae6c2a,8a6f1c8182a503ae6c2a.attempt
```

### Expected Output
All steps in `.github/workflows/test.yml` complete successfully.

### Matches User Report?
Yes. GitHub reports a completed failure on the current `main` commit.

## Hypotheses

### Active
- None.

### Eliminated
- [x] The README-only commit caused the failure: two preceding commits also failed CI, and the failing assertion exercises only the statusline renderer.
- [x] The renderer failed to sanitize project text: both output assertions completed before the failure arose in `finally` cleanup.

## Evidence Log

| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Listed recent `main` workflow runs | Three consecutive failures beginning no later than `d5366e7`; prior run `500a3c6` passed | The README-only commit is not sufficient to explain when the failure began |
| 2 | Read the complete failing CI log | Both sanitization assertions passed; `fs.rmSync` raised `ENOTEMPTY` during test cleanup | The failure is teardown concurrency, not renderer output |
| 3 | Traced `runRenderer` into `statusline-command.sh` | Git repositories with `gh` available launch a detached Python PR-cache refresh | Tests inherit GitHub's installed `gh` unless they explicitly isolate it |
| 4 | Ran the real renderer with a delayed `gh` and recorded the refresh PID | The renderer returned while the child was alive; the child later wrote PR cache entries inside the temporary home | Detached refresh and immediate recursive cleanup are causally concurrent |
| 5 | Ran the full suite locally without changing the runner assertion | The runner test emitted `base` before the implementation commit in default `git log` output | The assertion depends on an unspecified traversal order, not the verified merge graph |
| 6 | Reran the unchanged GitHub job | Ubuntu reported missing `bin/groundwork-run.js` in both `createAgentFixture` tests | The partial source fixture predates the mandatory Codex runner export |

## Root Cause
**Verification level:** Verified

`runRenderer` inherits the host's `gh` and `nohup` for tests that do not care about background refresh. In a temporary Git repository, `statusline-command.sh` therefore starts a detached PR-cache writer and returns immediately. The test's `finally` block recursively deletes that same temporary directory while the child may still create or replace cache entries. On Ubuntu CI, that write landed during directory removal and caused `ENOTEMPTY`.

The real renderer/PID reproduction proves the child survives renderer return and performs the late write; the CI stack proves the corresponding cleanup race.

Two additional test defects were independently verified:

1. The four-phase runner test reads `git log` without a graph-order constraint and assumes the second-parent task chain precedes the first-parent base commit. Equal/near-equal commit timestamps allow Git to emit either parent first even though the graph is correct.
2. `createAgentFixture` builds a partial plugin source containing only agent transform files. Codex installation now always exports `bin/groundwork-run.js`, `lib/run-reporting.js`, and `lib/validation-session.js`; Ubuntu Bash fails when those fixture inputs are absent.

## Fix
Make the test renderer suppress `nohup` by default. Tests whose contract is background usage or PR refresh already provide an explicit fake `nohup` and continue exercising the real asynchronous path.

Assert runner commit subjects through `HEAD`, `HEAD^2`, and `HEAD^2^`, which encodes the merge ancestry under test without relying on display order.

Make the agent fixture a valid minimal Codex source by copying the external runner and its two support files.

## Resolution
- `node tests/statusline.test.js`: 31 passed, 0 failed.
- `node tests/groundwork-run.test.js`: 147 passed, 0 failed.
- `node tests/install-config.test.js`: 61 passed, 0 failed.
- `bash tests/run-tests.sh`: all test suites passed.
- Remaining GitHub workflow commands passed locally: plugin validation (0 errors, 1 pre-existing matcher warning), shell syntax, and JSON validity.
