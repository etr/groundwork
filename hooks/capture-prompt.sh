#!/bin/bash
# Continuous Learning - User Prompt Capture
#
# Captures user prompts for pattern analysis.
# Claude Code passes hook data via stdin as JSON.
#
# Hook config (in hooks/hooks.json):
# {
#   "hooks": {
#     "UserPromptSubmit": [{
#       "matcher": "*",
#       "hooks": [{ "type": "command", "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/capture-prompt.sh" }]
#     }]
#   }
# }
#
# Error Recovery: Uses defensive error handling to never break Claude Code sessions.

# Error handling - log errors to debug file, never fail
DEBUG_LOG="${HOME}/.claude/groundwork-state/hook-errors.log"
mkdir -p "$(dirname "$DEBUG_LOG")" 2>/dev/null || true

log_error() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] capture-prompt: $1" >> "$DEBUG_LOG" 2>/dev/null || true
}

# Wrap main logic in function for error isolation
main() {
  CONFIG_DIR="${HOME}/.claude/homunculus"
  PROMPTS_FILE="${CONFIG_DIR}/user-prompts.jsonl"
  MAX_FILE_SIZE_MB=5

  # Ensure directory exists
  mkdir -p "$CONFIG_DIR"

  # Skip if disabled
  if [ -f "$CONFIG_DIR/disabled" ]; then
    exit 0
  fi

  # Read JSON from stdin (Claude Code hook format)
  INPUT_JSON=$(cat)

  # Exit if no input
  if [ -z "$INPUT_JSON" ]; then
    exit 0
  fi

  # Parse using python (more reliable than jq for complex JSON)
  PARSED=$(echo "$INPUT_JSON" | python3 -c '
import json
import sys

try:
    data = json.load(sys.stdin)

    # Extract fields - Claude Code hook format
    prompt = data.get("prompt", data.get("user_prompt", ""))
    session_id = data.get("session_id", "unknown")

    # Skip empty prompts
    if not prompt or not prompt.strip():
        print(json.dumps({"parsed": False, "reason": "empty"}))
        sys.exit(0)

    # Truncate very long prompts
    prompt_truncated = prompt[:5000]

    # Look for correction/feedback patterns
    is_correction = False
    correction_markers = [
        "no,", "wrong", "that'\''s not", "actually", "instead",
        "I meant", "try again", "don'\''t", "stop", "wait",
        "not what I", "you should", "please fix"
    ]
    prompt_lower = prompt.lower()
    for marker in correction_markers:
        if marker in prompt_lower:
            is_correction = True
            break

    print(json.dumps({
        "parsed": True,
        "prompt": prompt_truncated,
        "session": session_id,
        "is_correction": is_correction
    }))
except Exception as e:
    print(json.dumps({"parsed": False, "error": str(e)}))
')

  # Check if parsing succeeded
  PARSED_OK=$(echo "$PARSED" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('parsed', False))")

  if [ "$PARSED_OK" != "True" ]; then
    exit 0
  fi

  # Archive if file too large
  if [ -f "$PROMPTS_FILE" ]; then
    file_size_mb=$(du -m "$PROMPTS_FILE" 2>/dev/null | cut -f1)
    if [ "${file_size_mb:-0}" -ge "$MAX_FILE_SIZE_MB" ]; then
      archive_dir="${CONFIG_DIR}/prompts.archive"
      mkdir -p "$archive_dir"
      archive_name="user-prompts-$(date +%Y%m%d-%H%M%S)-$$.jsonl"
      mv "$PROMPTS_FILE" "$archive_dir/$archive_name" 2>/dev/null || true
    fi
  fi

  # Build and write observation
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  echo "$PARSED" | python3 -c "
import json
import sys
import os

parsed = json.load(sys.stdin)
timestamp = '$timestamp'
prompts_file = '$PROMPTS_FILE'

observation = {
    'timestamp': timestamp,
    'event': 'user_prompt',
    'prompt': parsed['prompt'],
    'session': parsed['session'],
    'is_correction': parsed['is_correction']
}

with open(prompts_file, 'a') as f:
    f.write(json.dumps(observation) + '\n')
"
}

# Run main with error recovery - always exit 0
# User prompt hooks should be silent (no output expected)
if ! main 2>&1; then
  log_error "Main function failed"
fi

exit 0
