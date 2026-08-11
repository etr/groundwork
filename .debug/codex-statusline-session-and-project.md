# Debug: Codex statusline session and project

## Status
Fixed

## Symptoms
- Codex `used-tokens` survives `/clear` and compaction while `context-used` resets.
- The selected Groundwork project is absent in monorepos.

## Reproduction
### Command Executed
```bash
codex --no-alt-screen -c 'tui.status_line=["context-used","used-tokens","project-name"]'
# Submit one minimal turn, then run /clear.

CODEX_HOME=<tmp>/codex-home node lib/project-context-cli.js select web --harness codex
CODEX_HOME=<tmp>/codex-home node lib/project-context-cli.js resolve --harness codex
```

### Actual Output
Before `/clear`, Codex rendered:

```text
Context 4% used · 14.1K used · groundwork
```

After `/clear`, the new thread rendered:

```text
Context 0% used · groundwork
```

The real project resolver independently returned:

```json
{"project_name":"web","project_root":"apps/web","selection_required":false}
```

### Expected Output
- Only current-context usage is shown; cumulative thread usage is not presented as current context.
- The active Groundwork project is visible when one is selected.

### Matches User Report?
Yes for the semantic mismatch: `used-tokens` reports cumulative thread usage while `context-used` reports the current context. `/clear` itself resets both on Codex 0.147.0; compaction preserves cumulative usage by design. The selected Groundwork project remains unavailable to Codex's native statusline.

## Hypotheses

### Active
- [ ] None.

### Eliminated
- [x] Groundwork persistence is failing: eliminated because the actual Codex resolver restored `web` with `selection_required:false`.
- [x] Codex `project-name` can represent the Groundwork selection: eliminated because Codex derives it from the Git/config project root.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Located Codex statusline source and tests | Codex installation configures native fields including `used-tokens`, `current-dir`, and `git-branch` | Both symptoms likely originate in native-field selection rather than Claude renderer logic |
| 2 | Ran Codex 0.147.0 with `context-used`, `used-tokens`, and `project-name` | After one turn: `Context 4% used · 14.1K used · groundwork`; after `/clear`: `Context 0% used · groundwork` | `used-tokens` is a different cumulative metric; current Codex does reset it on a true `/clear` |
| 3 | Selected and resolved `web` through the actual portable resolver | Resolver returned `project_name:web`, but Codex's native project value remained repository-derived | Groundwork state is healthy; the native statusline has no integration point for it |
| 4 | Inspected installed Codex binary labels and official `openai/codex` renderer | `used-tokens` is described as total tokens used in session; project root is derived from Git or `.codex` config | Native field semantics directly explain both observations |
| 5 | Re-ran Codex with the corrected native field list after a real turn | `Context 4% used` rendered with limits/cwd/branch and no cumulative token segment | The corrected field selection removes the misleading metric at runtime |

## Root Cause
**Verification level:** Verified

The Codex export selected `used-tokens`, a cumulative thread/session counter, as though it were Claude's current-context token count. Context compaction resets the context percentage but intentionally leaves this cumulative counter intact. A true `/clear` starts a new Codex thread and resets it on Codex 0.147.0.

Groundwork project selection is persisted correctly. Codex's native statusline accepts only fixed built-in fields; its project field derives the Git/config project root and cannot read Groundwork's pane-scoped selection file. Codex currently exposes no command-backed custom statusline item, so exact project parity is unavailable through plugin configuration.

## Fix
- Removed `used-tokens` from the current Groundwork-owned Codex statusline value.
- Added migration and uninstall recognition for the legacy value that contained `used-tokens`.
- Made the install workflow and getting-started guide state the native custom-project limitation instead of implying exact Claude parity.
- Added installer regression coverage for the current value, limitation report, and legacy migration.

## Resolution
- `node tests/install-config.test.js`: 47 passed, 0 failed.
- `bash tests/run-tests.sh`: all suites passed.
- Corrected Codex runtime reproduction: current-context percentage remained and cumulative used tokens were absent after a real turn.
- Exact selected-project rendering remains blocked by Codex's fixed native statusline API; Groundwork project persistence itself is verified healthy.
