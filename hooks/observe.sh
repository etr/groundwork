#!/bin/bash
# Continuous Learning v2 - Observation Hook
#
# Captures tool use events for pattern analysis.
# Claude Code passes hook data via stdin as JSON, including a 'hook_type' field
# that indicates whether this is a PreToolUse or PostToolUse event.
#
# Hook config (in hooks/hooks.json):
# {
#   "hooks": {
#     "PostToolUse": [{
#       "matcher": "*",
#       "hooks": [{ "type": "command", "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/observe.sh" }]
#     }]
#   }
# }
#
# The script automatically detects pre/post from the JSON input - no arguments needed.
#
# Error Recovery: Uses defensive error handling to never break Claude Code sessions.

# Error handling - log errors to debug file, never fail
DEBUG_LOG="${HOME}/.claude/groundwork-state/hook-errors.log"
mkdir -p "$(dirname "$DEBUG_LOG")" 2>/dev/null || true

log_error() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] observe: $1" >> "$DEBUG_LOG" 2>/dev/null || true
}

# Wrap main logic in function for error isolation
main() {
  # Use CLAUDE_PLUGIN_ROOT if available, otherwise calculate from script location
  if [ -n "$CLAUDE_PLUGIN_ROOT" ]; then
    CONFIG_FILE="${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning/config.json"
  else
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    CONFIG_FILE="$(dirname "$SCRIPT_DIR")/skills/continuous-learning/config.json"
  fi
  CONFIG_DIR="${HOME}/.claude/homunculus"
  OBSERVATIONS_FILE="${CONFIG_DIR}/observations.jsonl"
  export OBSERVATIONS_FILE
  MAX_FILE_SIZE_MB=10

  # Load config if exists
  if [ -f "$CONFIG_FILE" ] && command -v jq &> /dev/null; then
    MAX_FILE_SIZE_MB=$(jq -r '.observation.max_file_size_mb // 10' "$CONFIG_FILE")
  fi

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
# Use stdin piping to avoid code injection via heredoc interpolation
PARSED=$(echo "$INPUT_JSON" | python3 -c '
import json
import sys

try:
    data = json.load(sys.stdin)

    # Extract fields - Claude Code hook format
    hook_type = data.get("hook_type", "unknown")  # PreToolUse or PostToolUse
    tool_name = data.get("tool_name", data.get("tool", "unknown"))
    tool_input = data.get("tool_input", data.get("input", {}))
    tool_output = data.get("tool_output", data.get("output", ""))
    session_id = data.get("session_id", "unknown")

    # Truncate large inputs/outputs
    if isinstance(tool_input, dict):
        tool_input_str = json.dumps(tool_input)[:5000]
    else:
        tool_input_str = str(tool_input)[:5000]

    if isinstance(tool_output, dict):
        tool_output_str = json.dumps(tool_output)[:5000]
    else:
        tool_output_str = str(tool_output)[:5000]

    # Determine event type
    event = "tool_start" if "Pre" in hook_type else "tool_complete"

    print(json.dumps({
        "parsed": True,
        "event": event,
        "tool": tool_name,
        "input": tool_input_str if event == "tool_start" else None,
        "output": tool_output_str if event == "tool_complete" else None,
        "session": session_id
    }))
except Exception as e:
    print(json.dumps({"parsed": False, "error": str(e)}))
')

# Check if parsing succeeded
PARSED_OK=$(echo "$PARSED" | python3 -c "import json,sys; print(json.load(sys.stdin).get('parsed', False))")

if [ "$PARSED_OK" != "True" ]; then
  # Fallback: log raw input for debugging
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "{\"timestamp\":\"$timestamp\",\"event\":\"parse_error\",\"raw\":$(echo "$INPUT_JSON" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()[:1000]))')}" >> "$OBSERVATIONS_FILE"
  exit 0
fi

# Archive if file too large
if [ -f "$OBSERVATIONS_FILE" ]; then
  file_size_mb=$(du -m "$OBSERVATIONS_FILE" 2>/dev/null | cut -f1)
  if [ "${file_size_mb:-0}" -ge "$MAX_FILE_SIZE_MB" ]; then
    archive_dir="${CONFIG_DIR}/observations.archive"
    mkdir -p "$archive_dir"
    # Use PID suffix to avoid race conditions with concurrent hooks
    archive_name="observations-$(date +%Y%m%d-%H%M%S)-$$.jsonl"
    mv "$OBSERVATIONS_FILE" "$archive_dir/$archive_name" 2>/dev/null || true
  fi
fi

# Build and write observation
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Detect project root (directory with .claude/)
PROJECT_ROOT=""
if [ -d ".claude" ]; then
  PROJECT_ROOT="$(pwd)"
fi

# Use stdin piping to avoid code injection via heredoc interpolation
# Export vars so python can access them via os.environ
export TIMESTAMP="$timestamp"
export PROJECT_ROOT="$PROJECT_ROOT"
echo "$PARSED" | python3 -c '
import json
import sys
import os

parsed = json.load(sys.stdin)
timestamp = os.environ.get("TIMESTAMP", "")
observations_file = os.environ.get("OBSERVATIONS_FILE", "")
project_root = os.environ.get("PROJECT_ROOT", "")

observation = {
    "timestamp": timestamp,
    "event": parsed["event"],
    "tool": parsed["tool"],
    "session": parsed["session"]
}

if parsed["input"]:
    observation["input"] = parsed["input"]
if parsed["output"]:
    observation["output"] = parsed["output"]
if project_root:
    observation["project_root"] = project_root

with open(observations_file, "a") as f:
    f.write(json.dumps(observation) + "\n")
'

# Note: Observer daemon architecture removed - analysis runs synchronously
# at session start or via /instinct-status --analyze
}

# Run main with error recovery - always exit 0
# Observation hooks should be silent (no output expected)
if ! main 2>&1; then
  log_error "Main function failed"
fi

exit 0
