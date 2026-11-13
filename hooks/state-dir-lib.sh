# Groundwork hooks — shared state-directory resolution (sourced, never run).
#
# One spelling of the bash fallback so the hooks cannot drift: the state
# directory resolves through the Node lib (harness-aware: CLAUDE_CONFIG_DIR /
# ZCODE_HOME / CODEX_HOME redirections) exactly like the Node writers, and
# falls back to the historical Claude Code location only when node cannot
# resolve it.
#
# Usage inside a hook:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
#   . "${SCRIPT_DIR}/state-dir-lib.sh"
#   groundwork_resolve_state_dir          # sets _GW_STATE_DIR (cached)
#   STATE_DIR="$_GW_STATE_DIR"            # eager — cold hooks only
#
# Per-event hooks (PostToolUse/SubagentStop) MUST call the resolver lazily
# (from their error path only): the node spawn costs tens of milliseconds
# and their success path never needs the directory. Cold hooks
# (SessionStart/PreCompact, once per session event) may resolve eagerly.
#
# The resolver sets a variable rather than printing because calling it inside
# a command substitution would run in a subshell and defeat the cache.

GROUNDWORK_HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${GROUNDWORK_HOOKS_DIR}/.." && pwd)"

_GW_STATE_DIR=""

# Resolve the harness-resolved state directory at most once per process and
# leave it in _GW_STATE_DIR.
groundwork_resolve_state_dir() {
  [ -n "$_GW_STATE_DIR" ] && return 0
  local resolved
  resolved="$(node "${PLUGIN_ROOT}/lib/state-dir.js" 2>/dev/null || true)"
  [ -n "$resolved" ] || resolved="${HOME}/.claude/groundwork-state"
  _GW_STATE_DIR="$resolved"
}
