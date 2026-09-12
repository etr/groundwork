#!/usr/bin/env bash
# PostToolUse (Bash) hook for groundwork plugin
#
# In harnesses without terminal-pane identity (chat-window UIs such as ZCode),
# project selection state is shared across all chats. Per-chat snapshots fix
# the restore side; this hook fixes the write side: when THIS chat's Bash
# command persisted a project selection, adopt that write into this session's
# snapshot immediately, so a later clear/compaction restores what this chat
# actually selected — not another chat's newer write, and not a stale value.
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

# Adopt the freshest pane write into this session's snapshot. The freshness
# guard skips failed selections (pane untouched since the snapshot was pinned).
GROUNDWORK_SESSION_ID="$SESSION_ID" node -e "
  try {
    const pc = require('${PLUGIN_ROOT}/lib/project-context');
    if (pc.hasPaneIdentity()) process.exit(0);
    const sid = pc.getSessionId();
    const repoRoot = pc.getMainRepoRoot() || pc.getRepoRoot() || process.cwd();
    const pane = pc.restorePaneSelection(pc.getPaneKey(), repoRoot);
    const snap = pc.restoreSessionSelection(sid, repoRoot);
    if (pane && (!snap || pane.timestamp >= snap.timestamp)) {
      pc.persistSessionSelection(sid, pane.projectName, pane.projectPath);
    }
  } catch (e) {}
" 2>/dev/null || true

exit 0
