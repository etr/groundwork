#!/usr/bin/env bash
# PostToolUse (Bash) hook for groundwork plugin
#
# In harnesses without terminal-pane identity (chat-window UIs such as ZCode),
# project selection state is shared across all chats. Per-chat snapshots fix
# the restore side; this hook fixes the write side: when THIS chat's Bash
# command persisted a project selection, the selector printed a
# groundwork-project-selection-v1 receipt, and that receipt appears in this
# hook invocation's own tool response, the hook pins it to this session.
#
# Trust model: shared pane state is NEVER an input to a pin decision — only
# the current invocation's verified successful receipt is. Failed, missing,
# malformed, or ambiguous responses are a no-op, and so is everything in a
# harness with real terminal-pane identity.
#
# The hook is command-gated: it exits before spawning node unless the executed
# command wrote a selection via persist-project.js or project-context-cli.js.
#
# Error Recovery: defensive error handling — never breaks sessions.

INPUT_JSON=$(cat 2>/dev/null || echo '{}')

# Extract the executed command (hook input provides tool_input.command)
COMMAND=$(echo "$INPUT_JSON" | jq -r '.tool_input.command // empty' 2>/dev/null)
if [ -z "$COMMAND" ]; then
  COMMAND=$(echo "$INPUT_JSON" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
fi

# Command gate: only selection-writing invocations matter
case "$COMMAND" in
  *persist-project.js*|*project-context-cli.js*select*) ;;
  *) exit 0 ;;
esac

SESSION_ID=$(echo "$INPUT_JSON" | jq -r '.session_id // empty' 2>/dev/null)
if [ -z "$SESSION_ID" ]; then
  SESSION_ID=$(echo "$INPUT_JSON" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
fi
if [ -z "$SESSION_ID" ]; then
  # ZCode injects the session id as a hook environment variable
  SESSION_ID="${CLAUDE_SESSION_ID}"
fi
[ -z "$SESSION_ID" ] && exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Pin strictly from this invocation's tool response: extract receipt-shaped
# JSON from the response text, require exactly one, validate it against this
# repository's .groundwork.yml mapping, and pin it to this session.
printf '%s' "$INPUT_JSON" | GROUNDWORK_SESSION_ID="$SESSION_ID" node -e "
  let raw = '';
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    try {
      const pc = require('${PLUGIN_ROOT}/lib/project-context');
      if (pc.hasPaneIdentity()) process.exit(0);
      const payload = JSON.parse(raw || '{}');
      const response = payload.tool_response;
      if (!response || typeof response !== 'object') process.exit(0);
      const text = typeof response.stdout === 'string' ? response.stdout
        : (typeof response.output === 'string' ? response.output : null);
      if (text === null) process.exit(0);
      const receipts = pc.extractSelectionReceipts(text);
      if (receipts.length !== 1) process.exit(0);
      pc.pinSessionSelection(pc.getSessionId(), receipts[0]);
    } catch (e) {}
    process.exit(0);
  });
" 2>/dev/null || true

exit 0
