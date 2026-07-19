# Groundwork Statusline for Codex

Use the requested action, `install` or `uninstall`. When no action was supplied, default to `install`.

When `$CODEX_HOME` is set, resolve the configuration file beneath it; otherwise use `$HOME/.codex`. The resulting file is `${CODEX_HOME:-$HOME/.codex}/config.toml`. Create its parent directory and the file only when an install needs them.

Groundwork owns exactly this native Codex setting:

```toml
[tui]
status_line = ["model-with-reasoning", "context-used", "used-tokens", "five-hour-limit", "weekly-limit", "current-dir", "git-branch"]
```

## Install

1. Read the existing `config.toml`, if present.
2. If `tui.status_line` already equals the exact Groundwork-owned value, make no configuration change and report that it is installed.
3. If another `tui.status_line` value exists, ask the user before replacing it. Stop without changing the file when they decline.
4. Add or replace only `tui.status_line`. Keep one `[tui]` table and preserve every unrelated TOML key and table exactly as configured.
5. Report that the native statusline is installed and will appear in a new Codex session.

## Uninstall

1. Read `config.toml`. If it or `tui.status_line` is absent, report that nothing is installed.
2. During uninstall, remove it only when it exactly matches the Groundwork-owned value. If it differs, leave the foreign setting untouched and report that Groundwork does not own it.
3. Preserve every unrelated TOML key and table. Leaving an otherwise empty `[tui]` table is safe.
4. Report that the statusline is removed and the change will appear in a new Codex session.
