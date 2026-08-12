# Debug: Runner Rejects Virtualenv Python Symlink

## Status
Fixed

## Symptoms
- Runner exits before planning with `RESULT: FAILURE | Ignored symlink resolves outside its worktree: /Users/etr/progs/artistai/.venv/bin/python`.
- `.venv/bin/python` is a standard virtualenv interpreter symlink.

## Reproduction
### Command Executed
`node /Users/etr/progs/claude-groundwork/groundwork/bin/groundwork-run.js task TASK-074 --harness codex --project artistai` from `/Users/etr/progs/artistai`.

### Actual Output
`RESULT: FAILURE | Ignored symlink resolves outside its worktree: /Users/etr/progs/artistai/.venv/bin/python`

### Expected Output
The ignored virtualenv symlink should not prevent the runner from reaching the planning phase.

### Matches User Report?
Yes. Exact command path and failure reproduced.

## Hypotheses

### Active

### Eliminated
- [x] The link is malformed or dangling: it resolves to an existing uv-managed CPython executable.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Ran the source runner against ArtistAI | Exact reported failure | Reproduced through the real runner path |
| 2 | Inspected `.venv/bin/python` | Absolute link to uv-managed `python3.12`, regular file | Ordinary virtualenv layout, not malformed repository state |

## Root Cause
**Verification level:** Verified

The ignored-content seal rejects every ignored symlink whose referent is outside the worktree. That policy conflates repository-integrity sealing with ownership of external files. Standard virtualenvs use absolute interpreter symlinks outside the repository, so valid repositories fail preflight.

The runner should not read ignored contents at all. Ignored virtual environments and build caches are disposable, can contain absolute links, and can contain hundreds of thousands of files. Repository integrity is provided by sealing tracked and nonignored untracked state, refs, worktrees, Git controls, and submodules. A lightweight ignored-path-set seal can detect additions/removals without following links or reading cache contents.

## Fix
Changed ignored-state sealing to hash only NUL-delimited relative paths. It no longer follows ignored symlinks or opens ignored file contents.

## Resolution
- Regression: external virtualenv interpreter symlink reaches the phase boundary.
- Regression: unreadable ignored cache content reaches the phase boundary.
- Real ArtistAI preflight: `TASK-074 failed: PHASE_REACHED`, confirming the entire preflight completed and invoked the stubbed phase boundary.
- Focused runner suite: 37 passed, 0 failed.
