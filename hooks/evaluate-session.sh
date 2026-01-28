#!/bin/bash
# Continuous Learning - Session Evaluator
# Runs on Stop hook to signal the observer for pattern analysis
#
# Hook config (in hooks/hooks.json):
# {
#   "hooks": {
#     "Stop": [{
#       "matcher": "*",
#       "hooks": [{
#         "type": "command",
#         "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/evaluate-session.sh"
#       }]
#     }]
#   }
# }
#
# Error Recovery: Uses defensive error handling to never break Claude Code sessions.

# Error handling - log errors to debug file, never fail
DEBUG_LOG="${HOME}/.claude/groundwork-state/hook-errors.log"
mkdir -p "$(dirname "$DEBUG_LOG")" 2>/dev/null || true

log_error() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] evaluate-session: $1" >> "$DEBUG_LOG" 2>/dev/null || true
}

# Wrap main logic in function for error isolation
main() {
  # Use CLAUDE_PLUGIN_ROOT if available, otherwise calculate from script location
  if [ -n "$CLAUDE_PLUGIN_ROOT" ]; then
    PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
    CONFIG_FILE="${PLUGIN_ROOT}/skills/continuous-learning/config.json"
  else
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
    CONFIG_FILE="${PLUGIN_ROOT}/skills/continuous-learning/config.json"
  fi
  HOMUNCULUS_DIR="${HOME}/.claude/homunculus"
  MIN_SESSION_LENGTH=10

  # Load config if exists
  if [ -f "$CONFIG_FILE" ] && command -v jq &> /dev/null; then
    MIN_SESSION_LENGTH=$(jq -r '.min_session_length // 10' "$CONFIG_FILE")
  fi

  # Ensure directory exists
  mkdir -p "$HOMUNCULUS_DIR"

# Only process observations.jsonl - don't rely on CLAUDE_TRANSCRIPT_PATH
OBS_FILE="${HOMUNCULUS_DIR}/observations.jsonl"

if [ ! -f "$OBS_FILE" ]; then
  exit 0
fi

obs_count=$(wc -l < "$OBS_FILE" 2>/dev/null || echo "0")

# Skip short sessions
if [ "$obs_count" -lt "$MIN_SESSION_LENGTH" ]; then
  exit 0
fi

# Run analysis synchronously if threshold met
ANALYSIS_THRESHOLD=30

analysis_notice=""
if [ "$obs_count" -ge "$ANALYSIS_THRESHOLD" ] && [ -f "${PLUGIN_ROOT}/lib/analyze-observations.js" ]; then
  # Run analysis synchronously (quick operation)
  analysis_result=$(node "${PLUGIN_ROOT}/lib/analyze-observations.js" 2>/dev/null || echo '{"patterns":0}')
  patterns_found=$(echo "$analysis_result" | grep -o '"patterns":[0-9]*' | grep -o '[0-9]*' || echo "0")
  if [ "${patterns_found:-0}" -gt 0 ]; then
    analysis_notice=" Analyzed and found $patterns_found pattern(s)."
  fi
fi

# Output session completion via hook output
cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "Session with $obs_count observations completed.${analysis_notice} Run /instinct-status to see learnings."
  }
}
EOF
}

# Run main with error recovery - always exit 0
if ! main 2>&1; then
  log_error "Main function failed, outputting minimal response"
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": ""
  }
}
EOF
fi

exit 0
