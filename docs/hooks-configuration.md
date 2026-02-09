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

**Triggers:** After `Bash` tool use

**Purpose:**
- Verifies commits align with specs/tasks.md after `git commit`

**File:** `hooks/check-commit-alignment.sh`

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
- Preserves critical skill state before compaction
- Reports active tasks, current skill, pending observations
- Injects state summary into compacted context

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

All hook state files are stored in:
- `/tmp/claude-groundwork/` - Tool counters (cleaned after 7 days)
- `~/.claude/` - Security warning state (cleaned after 30 days)
