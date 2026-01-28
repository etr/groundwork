#!/bin/bash
# Groundwork Plugin - Instinct Notification Hook
#
# Checks for new instinct files created since last check and notifies the user.
#
# Error Recovery: Uses defensive error handling to never break Claude Code sessions.

# Error handling - log errors to debug file, never fail
DEBUG_LOG="${HOME}/.claude/groundwork-state/hook-errors.log"
mkdir -p "$(dirname "$DEBUG_LOG")" 2>/dev/null || true

log_error() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] instinct-notification: $1" >> "$DEBUG_LOG" 2>/dev/null || true
}

# Wrap main logic in function for error isolation
main() {
  STATE_DIR="${HOME}/.claude/groundwork-state"
  INSTINCTS_DIR="${HOME}/.claude/homunculus/instincts"
  LAST_CHECK_FILE="${STATE_DIR}/.instinct-notification-last-check"

  mkdir -p "$STATE_DIR" 2>/dev/null || true

  # Get last check timestamp (default to 0 if never checked)
  LAST_CHECK=0
  if [ -f "$LAST_CHECK_FILE" ]; then
    LAST_CHECK=$(cat "$LAST_CHECK_FILE" 2>/dev/null || echo "0")
  fi

  # Current timestamp
  CURRENT_TIME=$(date +%s)

  # Find new instinct files (created after last check)
  NEW_INSTINCTS=()

  for dir in personal inherited; do
    if [ -d "${INSTINCTS_DIR}/${dir}" ]; then
      while IFS= read -r file; do
        if [ -n "$file" ]; then
          # Get file modification time
          if [[ "$OSTYPE" == "darwin"* ]]; then
            FILE_TIME=$(stat -f "%m" "$file" 2>/dev/null || echo "0")
          else
            FILE_TIME=$(stat -c "%Y" "$file" 2>/dev/null || echo "0")
          fi

          if [ "$FILE_TIME" -gt "$LAST_CHECK" ]; then
            # Extract instinct name from filename
            INSTINCT_NAME=$(basename "$file" .md)
            NEW_INSTINCTS+=("$INSTINCT_NAME")
          fi
        fi
      done < <(find "${INSTINCTS_DIR}/${dir}" -name "*.md" -type f 2>/dev/null)
    fi
  done

  # Also check project-specific instincts
  if [ -d ".claude/instincts" ]; then
    while IFS= read -r file; do
      if [ -n "$file" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
          FILE_TIME=$(stat -f "%m" "$file" 2>/dev/null || echo "0")
        else
          FILE_TIME=$(stat -c "%Y" "$file" 2>/dev/null || echo "0")
        fi

        if [ "$FILE_TIME" -gt "$LAST_CHECK" ]; then
          INSTINCT_NAME=$(basename "$file" .md)
          NEW_INSTINCTS+=("${INSTINCT_NAME} (project)")
        fi
      fi
    done < <(find ".claude/instincts" -name "*.md" -type f 2>/dev/null)
  fi

  # Output notification if new instincts found
  if [ ${#NEW_INSTINCTS[@]} -gt 0 ]; then
    INSTINCT_LIST=$(printf ", %s" "${NEW_INSTINCTS[@]}")
    INSTINCT_LIST="${INSTINCT_LIST:2}"  # Remove leading ", "

    cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "Notification",
    "additionalContext": "New instincts discovered: ${INSTINCT_LIST}. Run /instinct-status to see all instincts."
  }
}
EOF
  else
    cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "Notification",
    "additionalContext": ""
  }
}
EOF
  fi

  # Update last check timestamp after output to avoid race condition
  echo "$CURRENT_TIME" > "$LAST_CHECK_FILE"
}

# Run main with error recovery - always exit 0
if ! main 2>&1; then
  log_error "Main function failed, outputting minimal response"
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "Notification",
    "additionalContext": ""
  }
}
EOF
fi

exit 0
