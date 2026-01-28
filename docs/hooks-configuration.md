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

### Security Reminder Hook (PreToolUse)

**Triggers:** Edit, Write, MultiEdit operations

**Purpose:**
- Warns about security vulnerabilities
- Checks for dangerous patterns
- Session-scoped (warns once per file/rule)

**File:** `hooks/security_reminder_hook.py`

**Patterns detected:**
- GitHub Actions workflow injection
- `child_process.exec` (command injection)
- `eval()` (code injection)
- `dangerouslySetInnerHTML` (XSS)
- `document.write` (XSS)
- `.innerHTML =` (XSS)
- `pickle` (deserialization attacks)
- `os.system` (command injection)

### Strategic Compact Hook (PreToolUse)

**Triggers:** Edit, Write, MultiEdit, Read, Grep, Glob operations

**Purpose:**
- Counts tool calls
- Suggests `/compact` at logical intervals
- Helps manage context length

**File:** `hooks/suggest-compact.js`

**Configuration:**
Set `COMPACT_THRESHOLD` environment variable (default: 50)

### Continuous Learning Observation Hook (PostToolUse)

**Triggers:** All tool completions (*)

**Purpose:**
- Captures tool use events for pattern analysis
- Writes observations to `~/.claude/homunculus/observations.jsonl`
- Automatically archives when file exceeds size limit

**File:** `hooks/observe.sh`

**Enabled by default** - To disable, create `~/.claude/homunculus/disabled`

### Session Evaluation Hook (Stop)

**Triggers:** Session end (*)

**Purpose:**
- Evaluates session for learnable patterns
- Signals observer agent if running
- Creates pending analysis files for review

**File:** `hooks/evaluate-session.sh`

**Enabled by default**

### PreCompact Hook

**Triggers:** Before context compaction (*)

**Purpose:**
- Preserves critical skill state before compaction
- Reports active tasks, current skill, pending observations
- Injects state summary into compacted context

**File:** `hooks/pre-compact.sh`

## Manual Hook Configuration (Advanced)

Continuous learning hooks are now enabled by default via `hooks/hooks.json`.

If you need to manually configure hooks (e.g., for custom behavior), you can add them to `~/.claude/settings.json`:

### Custom Observer Configuration

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/observe.sh"
      }]
    }],
    "Stop": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/evaluate-session.sh"
      }]
    }]
  }
}
```

**Note:** Manual configuration in settings.json overrides plugin defaults.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COMPACT_THRESHOLD` | 50 | Tool calls before suggesting compact |
| `ENABLE_SECURITY_REMINDER` | 1 | Set to 0 to disable security hook |
| `CLAUDE_SESSION_ID` | (auto) | Used for session-scoped state |
| `GROUNDWORK_SKIP_UPDATE_CHECK` | 0 | Set to 1 to skip update checking |

### Agent Model Overrides

Override the model used by specific agents:

| Variable | Description |
|----------|-------------|
| `GROUNDWORK_PLAN_ADHERENCE_REVIEWER_MODEL` | Model for plan-adherence-reviewer agent |
| `GROUNDWORK_CODE_SIMPLIFIER_MODEL` | Model for code-simplifier agent |
| `GROUNDWORK_OBSERVER_MODEL` | Model for continuous learning observer |

Example:
```bash
export GROUNDWORK_PLAN_ADHERENCE_REVIEWER_MODEL=opus
export GROUNDWORK_OBSERVER_MODEL=haiku
```

Valid values: `haiku`, `sonnet`, `opus` (defaults vary by agent)

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

### Security Hook Blocking

The security hook exits with code 2 to block tool execution. After one warning per file/rule, subsequent edits proceed silently.

To disable temporarily:
```bash
export ENABLE_SECURITY_REMINDER=0
```

### Compact Suggestions Annoying

Adjust the threshold:
```bash
export COMPACT_THRESHOLD=100
```

## Files Location

All hook state files are stored in:
- `/tmp/claude-groundwork/` - Tool counters (cleaned after 7 days)
- `~/.claude/` - Security warning state (cleaned after 30 days)
- `~/.claude/homunculus/` - Learning observations
