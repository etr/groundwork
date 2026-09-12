# Hooks Configuration

Groundwork uses Claude Code hooks for automation. This guide explains the available hooks and how to configure them.

## Default Hooks

The plugin includes these hooks in `hooks/hooks.json`:

### SessionStart Hook

**Triggers:** Session startup, resume, clear, compact

**Purpose:**
- Creates required directories
- Validates dependencies
- Detects project state
- Loads skill context

**File:** `hooks/session-start.sh`

### PostToolUse Hook

**Triggers:** After `Bash` and `Skill` tool use

**Purpose (Bash):**
- `hooks/check-commit-alignment.sh` — verifies commits align with specs/tasks.md after `git commit`
- `hooks/pin-session-selection.sh` — when this chat's Bash command persisted a project selection, adopts that write into the per-chat snapshot so a later clear/compaction restores what this chat actually selected

**Purpose (Skill):**
- `lib/resolve-template-vars.js` — injects resolved `{{template}}` variable values after a skill loads

**File:** `hooks/check-commit-alignment.sh`, `hooks/pin-session-selection.sh`, `lib/resolve-template-vars.js`

### SubagentStop Hook

**Triggers:** After any subagent completes (*)

**Purpose:**
- Validates agent output format

**File:** `hooks/validate-agent-output.sh`

### PreToolUse Hook

Currently empty — reserved for future use.

### PreCompact Hook

**Triggers:** Before context compaction (*)

**Purpose:**
- Preserves per-session context before compaction: active task count and the active project selection
- Pins the session's selection snapshot so the post-compaction SessionStart restores this chat's state (no skill-state file is read — no writer exists for one)

**File:** `hooks/pre-compact.sh`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_SESSION_ID` | (auto) | Used for session-scoped state |
| `GROUNDWORK_SKIP_UPDATE_CHECK` | 0 | Set to 1 to skip update checking |
| `GROUNDWORK_DEBUG` | 0 | Set to 1 to enable verbose hook output |

## Hook Output Format

Hooks communicate via JSON on stdout:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Context to inject..."
  }
}
```

## Troubleshooting

### Hook Not Running

1. Check file permissions: `chmod 755 hooks/*.sh`
2. Verify paths use `${CLAUDE_PLUGIN_ROOT}`
3. Check dependencies (node, python3)

## Files Location

Hook state files live in the harness-resolved Groundwork state directory, printed by `lib/state-dir.js` (hooks source `hooks/state-dir-lib.sh` to resolve it):
- Claude Code: `~/.claude/groundwork-state/` (or `$CLAUDE_CONFIG_DIR/groundwork-state/`)
- ZCode / Codex: `$ZCODE_HOME/groundwork-state/` / `$CODEX_HOME/groundwork-state/`

When `node` is unavailable, hooks fall back to the historical `~/.claude/groundwork-state/` location. Per-event hooks (PostToolUse Bash, SubagentStop) resolve the directory lazily — only their error-logging path needs it — so their success path spawns no node.
