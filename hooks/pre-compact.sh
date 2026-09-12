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

# Error handling - log errors to debug file, never fail. State-directory
# resolution lives in ONE shared spelling: hooks/state-dir-lib.sh. This hook
# runs once per compaction event, so it resolves the directory eagerly.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "${SCRIPT_DIR}/state-dir-lib.sh"
groundwork_resolve_state_dir
STATE_DIR="$_GW_STATE_DIR"
DEBUG_LOG="${STATE_DIR}/hook-errors.log"
mkdir -p "$(dirname "$DEBUG_LOG")" 2>/dev/null || true

log_error() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] pre-compact: $1" >> "$DEBUG_LOG" 2>/dev/null || true
}

# Wrap main logic in function for error isolation
main() {

# Read hook input from stdin and extract session_id
INPUT_JSON=$(cat 2>/dev/null || echo '{}')
SESSION_ID=$(echo "$INPUT_JSON" | jq -r '.session_id // empty' 2>/dev/null)
if [ -z "$SESSION_ID" ]; then
  SESSION_ID=$(echo "$INPUT_JSON" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
fi
if [ -z "$SESSION_ID" ]; then
  # ZCode injects the session id as a hook environment variable
  SESSION_ID="${CLAUDE_SESSION_ID}"
fi

# Extract any context we should preserve
# The hook output will be included in the compacted context

# Build preservation context
CONTEXT_ITEMS=()

# Check for active tasks
# Note: Claude Code doesn't expose CLAUDE_TODO_FILE to hooks, so we check
# the known default location for task state. This path is internal to Claude Code
# and may change in future versions.
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
# (No writer exists for current-skill.txt; the historical read was removed.)

# Check for active project context from session file
if [ -n "$SESSION_ID" ] && [ -f "${PLUGIN_ROOT}/lib/project-context.js" ]; then
  PROJECT_JSON=$(GROUNDWORK_SESSION_ID="$SESSION_ID" node -e "
    try {
      const pc = require('${PLUGIN_ROOT}/lib/project-context');
      const s = pc.restoreSelection(pc.getSessionId());
      if (s) console.log(JSON.stringify(s));
    } catch(e) {}
  " 2>/dev/null || echo "")
  if [ -n "$PROJECT_JSON" ]; then
    ACTIVE_PROJECT=$(echo "$PROJECT_JSON" | sed -n 's/.*"projectName":"\([^"]*\)".*/\1/p')
    ACTIVE_ROOT=$(echo "$PROJECT_JSON" | sed -n 's/.*"projectPath":"\([^"]*\)".*/\1/p')
    if [ -n "$ACTIVE_PROJECT" ]; then
      CONTEXT_ITEMS+=("Active project: $ACTIVE_PROJECT")
    fi
    if [ -n "$ACTIVE_ROOT" ]; then
      CONTEXT_ITEMS+=("Project root: $ACTIVE_ROOT")
    fi
    # Pin the restored selection as this session's snapshot so the
    # post-compaction SessionStart restores per-chat state even where pane
    # identity is unavailable (chat-window harnesses share one pane key
    # across all chats). Freshest write wins, so a newer explicit selection
    # still overrides the pin.
    if [ -n "$ACTIVE_PROJECT" ] && [ -n "$ACTIVE_ROOT" ]; then
      GROUNDWORK_SESSION_ID="$SESSION_ID" node -e "
        try {
          const pc = require('${PLUGIN_ROOT}/lib/project-context');
          pc.persistSessionSelection(pc.getSessionId(), process.argv[1], process.argv[2]);
        } catch(e) {}
      " "$ACTIVE_PROJECT" "$ACTIVE_ROOT" 2>/dev/null || true
    fi
  fi
fi

# Build additional context for compaction
if [ ${#CONTEXT_ITEMS[@]} -gt 0 ]; then
  CONTEXT_STR=$(printf "%s\n" "${CONTEXT_ITEMS[@]}" | tr '\n' '; ')
  CONTEXT_STR="${CONTEXT_STR%%; }"

  # Persist state to file for session-start restoration (session-specific).
  # Without a session id there is no key the post-compaction reader could
  # match; a shared fallback file would let concurrent sessions clobber each
  # other's preserved context, so skip and warn instead.
  if [ -n "$SESSION_ID" ]; then
    PRESERVED_STATE_FILE="${STATE_DIR}/preserved-context-${SESSION_ID}.txt"
    echo "$CONTEXT_STR" > "$PRESERVED_STATE_FILE" 2>/dev/null || true
  else
    log_error "No session id available; skipping preserved-context persistence"
  fi

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
