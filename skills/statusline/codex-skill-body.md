# Groundwork Statusline for Codex

Use the requested action, `install` or `uninstall`. When no action was supplied, default to `install`.

When `$CODEX_HOME` is set, resolve the configuration file beneath it; otherwise use `$HOME/.codex`. The resulting file is `${CODEX_HOME:-$HOME/.codex}/config.toml`. Create its parent directory and the file only when an install needs them.

The current Groundwork-owned native setting is:

```toml
[tui]
status_line = ["model-with-reasoning", "context-used", "five-hour-limit", "weekly-limit", "current-dir", "git-branch"]
```

This legacy Groundwork-owned value is recognized only for migration and uninstall:

```toml
[tui]
status_line = ["model-with-reasoning", "context-used", "used-tokens", "five-hour-limit", "weekly-limit", "current-dir", "git-branch"]
```

Codex supports only fixed native statusline fields. It cannot display the selected Groundwork monorepo project: Codex's native project field resolves the Git/config project root and cannot read Groundwork's persisted selection. Do not add `project-name`, which would mislabel the monorepo root as the selected Groundwork project.

## Install

1. Read the existing `config.toml`, if present.
2. If `tui.status_line` already equals the current Groundwork-owned value, make no configuration change and report that it is installed.
3. If `tui.status_line` equals the legacy Groundwork-owned value, replace it with the current value without asking.
4. If another `tui.status_line` value exists, ask the user before replacing it. Stop without changing the file when they decline.
5. Add or replace only `tui.status_line`. Keep one `[tui]` table and preserve every unrelated TOML key and table exactly as configured.
6. Report that the native statusline is installed and will appear in a new Codex session. Also report that Codex cannot display the selected Groundwork monorepo project until it supports custom statusline fields.

## Uninstall

1. Read `config.toml`. If it or `tui.status_line` is absent, report that nothing is installed.
2. During uninstall, remove it only when it exactly matches either the current or legacy Groundwork-owned value. If it differs, leave the foreign setting untouched and report that Groundwork does not own it.
3. Preserve every unrelated TOML key and table. Leaving an otherwise empty `[tui]` table is safe.
4. Report that the statusline is removed and the change will appear in a new Codex session.
