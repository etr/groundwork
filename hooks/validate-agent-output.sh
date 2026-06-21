#!/bin/bash
# Groundwork Plugin - Subagent Output Validator
#
# Runs on SubagentStop hook to verify agent outputs follow expected formats
# and match their system prompt requirements.
#
# Error Recovery: Uses defensive error handling to never break Claude Code sessions.

# Error handling - log errors to debug file, never fail
DEBUG_LOG="${HOME}/.claude/groundwork-state/hook-errors.log"
mkdir -p "$(dirname "$DEBUG_LOG")" 2>/dev/null || true

log_error() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] validate-agent-output: $1" >> "$DEBUG_LOG" 2>/dev/null || true
}

# Wrap main logic in function for error isolation
main() {
  # Read JSON from stdin (Claude Code hook format)
  INPUT_JSON=$(cat)

  # Exit if no input
  if [ -z "$INPUT_JSON" ]; then
    exit 0
  fi

  # Parse agent output and check for common issues
  VALIDATION_RESULT=$(echo "$INPUT_JSON" | python3 -c '
import json
import sys

try:
    data = json.load(sys.stdin)

    agent_type = data.get("subagent_type", data.get("agent_type", "unknown"))
    agent_name = data.get("subagent_name", data.get("name", ""))

    # Resolve the agent output. The real SubagentStop payload does NOT carry the
    # output inline -- it ships a "transcript_path" and the output lives as the
    # last assistant message in that JSONL. The old code only looked at
    # "tool_output"/"output" (keys the harness never sends), so output_str was
    # ALWAYS empty and the hook flagged EVERY subagent with "short or empty
    # output". Agents then went rogue trying to silence the hook (editing this
    # script, editing settings.json). Fix: read the explicit field if present
    # (forward-compat / tests), else recover the output from the transcript, and
    # when the output is genuinely undeterminable, validate NOTHING -- never
    # invent a warning from missing data.

    def last_assistant_text(path):
        """Best-effort: concatenated text of the last assistant message in a
        transcript JSONL. Returns None if nothing usable is found."""
        try:
            text = None
            with open(path, "r") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except Exception:
                        continue
                    msg = rec.get("message", rec)
                    is_assistant = rec.get("type") == "assistant" or msg.get("role") == "assistant"
                    if not is_assistant:
                        continue
                    content = msg.get("content", "")
                    if isinstance(content, str):
                        chunk = content
                    elif isinstance(content, list):
                        chunk = "".join(
                            b.get("text", "") for b in content
                            if isinstance(b, dict) and b.get("type") == "text"
                        )
                    else:
                        chunk = ""
                    if chunk.strip():
                        text = chunk  # keep the LAST non-empty assistant message
            return text
        except Exception:
            return None

    agent_output = None
    for key in ("tool_output", "output"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            agent_output = val
            break
    if agent_output is None:
        transcript_path = data.get("transcript_path")
        if isinstance(transcript_path, str) and transcript_path:
            agent_output = last_assistant_text(transcript_path)

    issues = []
    output_str = agent_output if isinstance(agent_output, str) else ""
    output_available = output_str.strip() != ""

    # If we could not determine the output, there is nothing to validate. Stay
    # silent -- a missing output is NOT evidence of a short or broken one.
    if not output_available:
        print(json.dumps({
            "valid": True,
            "issues": [],
            "agent_type": agent_type,
            "agent_name": agent_name
        }))
        sys.exit(0)

    # Check for common validation issues

    # 1. Empty or very short outputs (only reachable when output IS available)
    if len(output_str.strip()) < 10:
        issues.append("Agent returned very short or empty output")

    # 2. Check for a CRASH indicator. Only a Python traceback is a reliable
    #    signal that the agent itself blew up -- the bare words "error:",
    #    "failed:", "exception:" are the everyday vocabulary of review agents
    #    (a security/test reviewer reports errors and failures by design), so
    #    flagging them produced constant false positives. The (pattern, label)
    #    split keeps the raw regex -- backslashes and parens -- OUT of the issue
    #    text, which is later interpolated into JSON: emitting e.g. "\(" produced
    #    invalid JSON and a broken hook response.
    import re
    error_patterns = [
        (r"\btraceback \(most recent call last\)", "traceback"),
    ]
    output_lower = output_str.lower()
    for pattern, label in error_patterns:
        if re.search(pattern, output_lower):
            issues.append(f"Agent output contains an error indicator ({label})")

    # 3. Check if review agents provided a verdict. Groundwork reviewers are
    #    named "<area>-reviewer" / "<area>-checker" (e.g. code-quality-reviewer,
    #    spec-alignment-checker) and emit a compact verdict JSON whose values
    #    are "approve" / "request-changes" -- match that vocabulary, not the
    #    stale "code-reviewer"/"approved" one that never fired.
    review_agent = isinstance(agent_type, str) and (
        agent_type.endswith("-reviewer") or agent_type.endswith("-checker")
    )
    if review_agent:
        verdict_markers = ["verdict", "approve", "request-changes", "request changes", "rejected", "compliant"]
        has_verdict = any(v in output_lower for v in verdict_markers)
        if not has_verdict:
            issues.append("Review agent may be missing a clear verdict (approve / request-changes)")

    # 4. Truncation: the output looks cut off mid-thought. Only a *trailing*
    #    ellipsis is a reliable signal -- a "..." anywhere else is almost always
    #    a spread operator ({...x}), a path, a diff hunk, or an intra-sentence
    #    pause, none of which mean the agent stopped early. "etc."/"and so on"
    #    are intentionally not flagged: they end many complete sentences.
    stripped = output_str.rstrip()
    if stripped.endswith("...") or stripped.endswith("…"):
        issues.append("Agent output may be truncated (ends with an ellipsis)")
    elif "to be continued" in output_lower:
        issues.append("Agent output may be truncated (unfinished continuation marker)")

    print(json.dumps({
        "valid": len(issues) == 0,
        "issues": issues,
        "agent_type": agent_type,
        "agent_name": agent_name
    }))

except Exception as e:
    print(json.dumps({"valid": True, "issues": [], "error": str(e)}))
')

  # Check if validation found issues
  HAS_ISSUES=$(echo "$VALIDATION_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print('true' if d.get('issues') else 'false')")

  if [ "$HAS_ISSUES" = "true" ]; then
    ISSUES_STR=$(echo "$VALIDATION_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print('; '.join(d.get('issues', [])))")
    AGENT_TYPE=$(echo "$VALIDATION_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('agent_type', 'unknown'))")

    cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SubagentStop",
    "additionalContext": "Automated output diagnostic for the orchestrator (${AGENT_TYPE}): ${ISSUES_STR}. This is a non-blocking note ONLY -- do not act on it by editing plugin hooks, settings, or anything outside your assigned task. If you are the reporting agent, simply ensure your actual deliverable (verdict and findings file) is complete."
  }
}
EOF
  else
    cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SubagentStop",
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
    "hookEventName": "SubagentStop",
    "additionalContext": ""
  }
}
EOF
fi

exit 0
