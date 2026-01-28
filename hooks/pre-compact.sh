#!/bin/bash
# Groundwork Plugin - PreCompact Hook
#
# Preserves critical skill state before context compaction.
# This ensures important context survives the compaction process.
#
# What gets preserved:
# - Active task list (if using TaskCreate)
# - Current skill being executed
# - Key decision context from the session
#
# Error Recovery: Uses defensive error handling to never break Claude Code sessions.

# Error handling - log errors to debug file, never fail
DEBUG_LOG="${HOME}/.claude/groundwork-state/hook-errors.log"
mkdir -p "$(dirname "$DEBUG_LOG")" 2>/dev/null || true

log_error() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] pre-compact: $1" >> "$DEBUG_LOG" 2>/dev/null || true
}

# Wrap main logic in function for error isolation
main() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
  STATE_DIR="${HOME}/.claude/groundwork-state"

  mkdir -p "$STATE_DIR"

  # Read hook input from stdin
  INPUT_JSON=$(cat 2>/dev/null || echo '{}')

# Extract any context we should preserve
# The hook output will be included in the compacted context

# Build preservation context
CONTEXT_ITEMS=()

# Check for active tasks
# Note: Claude Code doesn't expose CLAUDE_TODO_FILE to hooks, so we check
# the known default location for task state
POTENTIAL_TODO_FILE="${HOME}/.claude/todos/current.json"
if [ -f "${POTENTIAL_TODO_FILE}" ]; then
  # Validate JSON before counting
  if python3 -c "import json; json.load(open('${POTENTIAL_TODO_FILE}'))" 2>/dev/null; then
    TASK_COUNT=$(grep -c '"status"[[:space:]]*:[[:space:]]*"in_progress"' "${POTENTIAL_TODO_FILE}" 2>/dev/null || echo "0")
  else
    TASK_COUNT="0"
    log_error "TODO file is not valid JSON"
  fi
  if [ "$TASK_COUNT" -gt 0 ]; then
    CONTEXT_ITEMS+=("Active tasks: $TASK_COUNT in progress")
  fi
fi

# Check for skill context file
SKILL_CONTEXT_FILE="${STATE_DIR}/current-skill.txt"
if [ -f "$SKILL_CONTEXT_FILE" ]; then
  CURRENT_SKILL=$(cat "$SKILL_CONTEXT_FILE" 2>/dev/null || echo "")
  if [ -n "$CURRENT_SKILL" ]; then
    CONTEXT_ITEMS+=("Active skill: $CURRENT_SKILL")
  fi
fi

# Check for continuous learning observations
OBS_FILE="${HOME}/.claude/homunculus/observations.jsonl"
if [ -f "$OBS_FILE" ]; then
  OBS_COUNT=$(wc -l < "$OBS_FILE" 2>/dev/null || echo "0")
  if [ "$OBS_COUNT" -gt 0 ]; then
    CONTEXT_ITEMS+=("Observations pending analysis: $OBS_COUNT")
  fi
fi

# Build additional context for compaction
if [ ${#CONTEXT_ITEMS[@]} -gt 0 ]; then
  CONTEXT_STR=$(printf "%s\n" "${CONTEXT_ITEMS[@]}" | tr '\n' '; ')
  CONTEXT_STR="${CONTEXT_STR%%; }"

  # Persist state to file for session-start restoration
  PRESERVED_STATE_FILE="${STATE_DIR}/preserved-context.txt"
  echo "$CONTEXT_STR" > "$PRESERVED_STATE_FILE" 2>/dev/null || true

  cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreCompact",
    "additionalContext": "Groundwork state before compaction: ${CONTEXT_STR}"
  }
}
EOF
else
  cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreCompact",
    "additionalContext": ""
  }
}
EOF
fi
}

# Run main with error recovery - always exit 0
if ! main 2>&1; then
  log_error "Main function failed, outputting minimal response"
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreCompact",
    "additionalContext": ""
  }
}
EOF
fi

exit 0
