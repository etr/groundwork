# Debug: Runner Git ENOBUFS

## Status
Fixed

## Symptoms
- Installed runner exits before task execution with `RESULT: FAILURE | spawnSync git ENOBUFS`.
- Reported command: `node ~/.codex/groundwork-run.js task TASK-074 --harness codex --project artistai`.

## Reproduction
### Command Executed
From `/Users/etr/progs/artistai`, execute Node's `execFileSync` with the runner's exact safe Git arguments for `git ls-files --others --ignored --exclude-standard -z`.

### Actual Output
`Error: spawnSync git ENOBUFS`; the same Git command produces 26,809,173 bytes when streamed to `wc -c`.

### Expected Output
The runner should inspect repository state without buffering all Git output in the child-process API.

### Matches User Report?
Yes. Exact error, executable, and Git argument vector match.

## Hypotheses

### Active

### Eliminated
- [x] Git itself fails: eliminated because the command completes and emits 26,809,173 bytes when stdout is streamed.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Ran exact `execFileSync` Git call in ArtistAI | `spawnSync git ENOBUFS` | Runner subprocess boundary reproduced |
| 2 | Streamed exact Git command to `wc -c` | 26,809,173 bytes | Output exceeds Node's default synchronous buffer |

## Root Cause
**Verification level:** Verified

`snapshotIgnoredFiles` obtains a potentially unbounded NUL-delimited path list through `execGit`, which uses `execFileSync` with Node's default output buffer. ArtistAI's 26.8 MB listing exceeds that buffer, so Node kills Git and reports `ENOBUFS` before snapshot processing begins.

## Fix
Added a bounded-memory Git record reader. Git writes NUL-delimited stdout to a mode-0600 file in a unique temporary directory; the runner reads 64 KiB chunks, dispatches complete records, and removes the temporary artifacts in `finally`. `snapshotIgnoredFiles` now consumes records through that path instead of `execFileSync` output capture.

## Resolution
- Regression test emits 1.2 MB through a real child-process boundary: passed.
- Exact ArtistAI listing processed through the fixed helper: 291,419 records, exit 0.
- Focused runner suite: 39 passed, 0 failed.
