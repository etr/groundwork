# Debug: Codex monorepo project selection after clear

## Status
Active

## Symptoms
- Codex loses the selected Groundwork project in a monorepo, especially after clearing the conversation.
- Selecting a project in one tmux tab can change the effective project in another tab.
- No exact error text reported.

## Reproduction
### Command Executed
```bash
CODEX_HOME=/private/tmp/gw-clear-repro.FT6sn3/codex-home \
  node lib/project-context-cli.js select web --harness codex
# cwd: /private/tmp/gw-clear-repro.FT6sn3

CODEX_HOME=/private/tmp/gw-clear-repro.FT6sn3/codex-home \
  node lib/project-context-cli.js resolve --harness codex
# cwd: /private/tmp/gw-clear-repro.FT6sn3/apps/web
```

### Actual Output
```json
{"project_name":"web","selection_required":false,"state_file":".../cwd-9758b0953e58__...json"}
{"project_name":"","selection_required":true,"state_file":".../cwd-c06c569f9dbc__...json"}
```

### Expected Output
The persisted `web` selection resolves from any directory in the same checkout and after Codex clears conversation context.

### Matches User Report?
Yes. The runtime loses an existing selection when Codex's process context yields a different fallback key; when multiple tabs fall back to the same cwd key, their selections cross. Current user state contains `ttys*`, `cwd-*`, and `??` keys for one monorepo.

## Hypotheses

### Active
- [ ] Verify the direct tmux environment identity fix across the full suite and independent reviewers.

### Eliminated

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Located project-context implementation, export tests, and select-project skill | Codex has a bundled project context runtime and explicit install tests | The failure is in persistence semantics rather than missing export support |
| 2 | Inspected `~/.codex/groundwork-state/panes` | One monorepo has state under `ttys*`, several `cwd-*`, and `??` keys | Codex execution contexts do not provide one stable pane identity |
| 3 | Selected at repo root, resolved from package cwd | State filename changed with cwd hash and resolve required selection again | Cwd fallback directly causes loss of selection |
| 4 | Resolved again at repo root | `web` selection restored from the original state file | Persisted data is intact; lookup identity is the failing boundary |
| 5 | Inspected the Codex subprocess environment | `TMUX` and `TMUX_PANE` are present | A stable pane identity is already available without process-tree discovery |
| 6 | Called `tmux display-message` from the Codex sandbox | Failed with `Operation not permitted` connecting to the tmux socket | The existing tmux fast path discards stable env identity and falls into shared/unstable fallback keys |
| 7 | Selected/resolved with two different `TMUX_PANE` values | Worktree-scoped draft returned the first pane's project in the second pane | Repository-only scope contradicts required tab isolation |

## Root Cause
**Verification level:** Verified

`getPaneKey()` sees `TMUX_PANE` but shells out to `tmux display-message` to derive the pane TTY. Codex's sandbox cannot access the tmux server socket, so that stable identity is discarded. The later process-tree lookup can also fail, leaving a cwd hash: cwd changes lose the selection, while separate tabs at the same cwd share and overwrite it. Conversation clearing removes the model's in-memory project context and exposes whichever incorrect persistent lookup follows.

## Fix
Derive a filesystem-safe pane key by hashing `TMUX` plus `TMUX_PANE` directly. This avoids the sandboxed tmux socket entirely, remains stable across `/clear` and cwd changes, and differs across panes and tmux servers. Preserve the existing TTY/process and cwd fallback chain for non-tmux environments.

## Resolution
Pending.
