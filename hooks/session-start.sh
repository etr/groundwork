#!/usr/bin/env bash
# SessionStart hook for groundwork plugin
#
# Error Recovery: This hook uses defensive error handling to ensure it never
# breaks Claude Code sessions. All errors are logged rather than causing exit.

# Error handling - log errors to debug file, never fail
DEBUG_LOG="${HOME}/.claude/groundwork-state/hook-errors.log"
mkdir -p "$(dirname "$DEBUG_LOG")" 2>/dev/null || true

log_error() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] session-start: $1" >> "$DEBUG_LOG" 2>/dev/null || true
}

# Wrap main logic in function for error isolation
main() {
  # Determine plugin root directory
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
  PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# State directory for session restoration
STATE_DIR="${HOME}/.claude/groundwork-state"
mkdir -p "$STATE_DIR" 2>/dev/null || true

# Read session_id from hook stdin JSON (Claude Code provides this)
HOOK_INPUT=$(cat)
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty' 2>/dev/null)
if [ -z "$SESSION_ID" ]; then
  # sed fallback if jq is not available
  SESSION_ID=$(echo "$HOOK_INPUT" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
fi

# Persist session ID so skills can read it (they don't receive stdin JSON)
if [ -n "$SESSION_ID" ]; then
  echo "$SESSION_ID" > "${STATE_DIR}/current-session-id" 2>/dev/null || true
fi

# Raw TTY is still used by node scripts for project context
SESSION_TTY=$(ps -o tty= -p $PPID 2>/dev/null | tr -d ' ')

# Loaded announcement
loaded_message="**Groundwork loaded.** "

# ============================================
# Dependency Validation
# ============================================
missing_deps=""

if ! command -v node &> /dev/null; then
  missing_deps="${missing_deps}\n- node (required for hooks)"
fi

if ! command -v python3 &> /dev/null; then
  missing_deps="${missing_deps}\n- python3 (required for validation hooks)"
fi

# gh is optional but recommended
gh_warning=""
if ! command -v gh &> /dev/null; then
  gh_warning="\n\n**Note:** GitHub CLI (gh) not found. PR-related commands won't work. Install from https://cli.github.com/"
fi

# ============================================
# Legacy Skills Warning
# ============================================
warning_message=""
legacy_skills_dir="${HOME}/.config/groundwork/skills"
if [ -d "$legacy_skills_dir" ]; then
    warning_message="\n\n<important-reminder>IN YOUR FIRST REPLY AFTER SEEING THIS MESSAGE YOU MUST TELL THE USER: **WARNING:** Custom skills in ~/.config/groundwork/skills will not be read. Move custom skills to ~/.claude/skills instead. To make this message go away, remove ~/.config/groundwork/skills</important-reminder>"
fi

# Add missing deps warning
if [ -n "$missing_deps" ]; then
    warning_message="${warning_message}\n\n<important-reminder>**Missing Dependencies:** The following are required for full plugin functionality:${missing_deps}\nPlease install them to use all features.</important-reminder>"
fi

# ============================================
# Update Checking (throttled to 1x/day)
# ============================================
update_notice=""
if [ -f "${PLUGIN_ROOT}/lib/check-updates.js" ]; then
  update_result=$(node "${PLUGIN_ROOT}/lib/check-updates.js" 2>/dev/null || echo '{"available":false}')
  if echo "$update_result" | grep -q '"available":true'; then
    update_notice="\n\n**Plugin Update Available:** Run \`git pull\` in the groundwork plugin directory to get the latest features and fixes."
  fi
fi

# ============================================
# Session State Restoration
# ============================================
restored_state=""

# Try session-specific preserved context first, then fall back to legacy
if [ -n "$SESSION_ID" ]; then
  PRESERVED_STATE_FILE="${STATE_DIR}/preserved-context-${SESSION_ID}.txt"
else
  PRESERVED_STATE_FILE="${STATE_DIR}/preserved-context.txt"
fi

if [ -f "$PRESERVED_STATE_FILE" ]; then
  preserved_content=$(cat "$PRESERVED_STATE_FILE" 2>/dev/null || echo "")
  if [ -n "$preserved_content" ]; then
    restored_state="\n\n**Restored from previous session:** ${preserved_content}"
    rm -f "$PRESERVED_STATE_FILE" 2>/dev/null || true
  fi
fi

# ============================================
# Workflow State Restoration (checkpoint-and-compact)
# ============================================
workflow_restoration=""

if [ -n "$SESSION_ID" ]; then
  WORKFLOW_STATE_FILE="${STATE_DIR}/workflow-state-${SESSION_ID}.json"
  if [ -f "$WORKFLOW_STATE_FILE" ]; then
    # Read workflow state fields using jq, with sed fallback
    if command -v jq &> /dev/null; then
      wf_skill=$(jq -r '.skill // empty' "$WORKFLOW_STATE_FILE" 2>/dev/null)
      wf_step=$(jq -r '.resumeStep // empty' "$WORKFLOW_STATE_FILE" 2>/dev/null)
      wf_task=$(jq -r '.taskId // empty' "$WORKFLOW_STATE_FILE" 2>/dev/null)
      wf_worktree=$(jq -r '.additionalContext.worktreePath // empty' "$WORKFLOW_STATE_FILE" 2>/dev/null)
      wf_branch=$(jq -r '.additionalContext.branch // empty' "$WORKFLOW_STATE_FILE" 2>/dev/null)
      wf_base_branch=$(jq -r '.additionalContext.baseBranch // empty' "$WORKFLOW_STATE_FILE" 2>/dev/null)
      wf_batch_mode=$(jq -r '.additionalContext.batchMode // "false" | tostring' "$WORKFLOW_STATE_FILE" 2>/dev/null)
      wf_cwd=$(jq -r '.additionalContext.cwd // empty' "$WORKFLOW_STATE_FILE" 2>/dev/null)
      wf_additional=$(jq -r '.additionalContext | to_entries | map("  - **\(.key):** \(.value)") | join("\\n")' "$WORKFLOW_STATE_FILE" 2>/dev/null)
    else
      # sed fallback for basic field extraction
      wf_skill=$(sed -n 's/.*"skill"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$WORKFLOW_STATE_FILE" | head -1)
      wf_step=$(sed -n 's/.*"resumeStep"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$WORKFLOW_STATE_FILE" | head -1)
      wf_task=$(sed -n 's/.*"taskId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$WORKFLOW_STATE_FILE" | head -1)
      wf_worktree=$(sed -n 's/.*"worktreePath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$WORKFLOW_STATE_FILE" | head -1)
      wf_branch=$(sed -n 's/.*"branch"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$WORKFLOW_STATE_FILE" | head -1)
      wf_base_branch=$(sed -n 's/.*"baseBranch"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$WORKFLOW_STATE_FILE" | head -1)
      wf_batch_mode=$(sed -n 's/.*"batchMode"[[:space:]]*:[[:space:]]*\(true\|false\).*/\1/p' "$WORKFLOW_STATE_FILE" | head -1)
      wf_cwd=$(sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$WORKFLOW_STATE_FILE" | head -1)
      wf_additional=""
    fi

    # Delete state file immediately to prevent infinite restore loops
    rm -f "$WORKFLOW_STATE_FILE" 2>/dev/null || true

    if [ -n "$wf_skill" ] && [ -n "$wf_step" ]; then
      # Build task args for the skill call
      wf_task_args=""
      if [ -n "$wf_task" ]; then
        wf_task_args="${wf_task}"
      fi

      workflow_restoration="\\n\\n<workflow-restoration>\\nRESUME WORKFLOW NOW — IN YOUR FIRST REPLY you MUST resume the interrupted workflow.\\n\\n**Skill:** ${wf_skill}\\n**Resume at step:** ${wf_step}\\n**Task ID:** ${wf_task:-none}\\n\\n**Saved context:**\\n- **worktreePath:** ${wf_worktree}\\n- **branch:** ${wf_branch}\\n- **baseBranch:** ${wf_base_branch}\\n- **batchMode:** ${wf_batch_mode}\\n- **cwd:** ${wf_cwd}\\n\\n**Action:** Call \`Skill(skill=\\\"groundwork:${wf_skill}\\\", args=\\\"${wf_task_args}\\\")\` and skip directly to step ${wf_step} using the saved context above. Do NOT re-run earlier steps.\\n</workflow-restoration>"
    fi
  fi
fi

# ============================================
# Project State Detection (via Node for monorepo support)
# ============================================
specs_notice=""
project_context=""

if [ -f "${PLUGIN_ROOT}/lib/detect-project-state.js" ]; then
  project_state=$(GROUNDWORK_SESSION_TTY="$SESSION_TTY" timeout 3 node "${PLUGIN_ROOT}/lib/detect-project-state.js" 2>/dev/null || echo '{}')

  # Parse project state JSON
  is_monorepo=$(echo "$project_state" | grep -o '"isMonorepo":true' | head -1)
  project_name=$(echo "$project_state" | sed -n 's/.*"projectName":"\([^"]*\)".*/\1/p')
  has_prd=$(echo "$project_state" | grep -o '"hasPRD":true' | head -1)
  has_arch=$(echo "$project_state" | grep -o '"hasArchitecture":true' | head -1)
  has_tasks=$(echo "$project_state" | grep -o '"hasTasks":true' | head -1)

  # Set flags for downstream use
  [ -n "$has_prd" ] && has_prd=true || has_prd=false
  [ -n "$has_arch" ] && has_arch=true || has_arch=false
  [ -n "$has_tasks" ] && has_tasks=true || has_tasks=false
else
  # Fallback to bash detection
  has_prd=false; has_arch=false; has_tasks=false
  ([ -f "specs/product_specs.md" ] || [ -d "specs/product_specs" ]) && has_prd=true
  ([ -f "specs/architecture.md" ] || [ -d "specs/architecture" ]) && has_arch=true
  ([ -f "specs/tasks.md" ] || [ -d "specs/tasks" ]) && has_tasks=true
  is_monorepo=""
  project_name=""
fi

# Check for code files (quick check - just see if any exist)
has_code=false
if find . -maxdepth 3 \( \
  -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.go" -o -name "*.rs" \
  -o -name "*.java" -o -name "*.rb" -o -name "*.php" -o -name "*.c" -o -name "*.cpp" \
  -o -name "*.tsx" -o -name "*.jsx" -o -name "*.kt" -o -name "*.swift" -o -name "*.scala" \
  \) 2>/dev/null | head -1 | grep -q .; then
  has_code=true
fi

# Generate suggestion message based on state
if [ -n "$is_monorepo" ] && [ -n "$project_name" ]; then
  # Monorepo with project selected
  project_context="Project: ${project_name}. "
  if $has_prd && $has_arch && $has_tasks; then
    specs_notice="\n\n**${project_context}PRD, Architecture, Tasks available.** Use /groundwork:work-on-next-task to work on the next task."
  elif $has_prd && $has_arch; then
    specs_notice="\n\n**${project_context}PRD and Architecture available.** Run /groundwork:create-tasks to generate implementation tasks."
  elif $has_prd; then
    specs_notice="\n\n**${project_context}PRD available.** Run /groundwork:design-architecture to design the technical approach."
  else
    specs_notice="\n\n**${project_context}** No specs found. Run /groundwork:design-product to get started."
  fi
elif [ -n "$is_monorepo" ]; then
  # Monorepo detected but no project selected
  specs_notice="\n\n**Monorepo detected.** Run /groundwork:select-project or start a skill to choose a project."
elif $has_prd && $has_arch && $has_tasks; then
  specs_notice="\n\n**Project context available:** PRD, Architecture, Tasks in specs/. Use /groundwork:work-on-next-task to work on the next task."
elif $has_prd && $has_arch; then
  specs_notice="\n\n**PRD and Architecture available.** Run /groundwork:create-tasks to generate implementation tasks."
elif $has_prd; then
  specs_notice="\n\n**PRD available.** Run /groundwork:design-architecture to design the technical approach based on your requirements."
elif $has_code; then
  specs_notice="\n\n**Project has code but no specs.** I can analyze your codebase to propose initial product specifications. Run /product-design to get started."
else
  specs_notice="\n\n**Getting started:** Run /groundwork:design-product to define your product requirements."
fi

# Add gh warning, update notice, and restored state if applicable
specs_notice="${specs_notice}${gh_warning}${update_notice}${restored_state}"

# ============================================
# Spec Content Injection
# ============================================
specs_content=""
if $has_prd || $has_arch; then
  if [ -f "${PLUGIN_ROOT}/lib/inject-specs.js" ]; then
    specs_content=$(GROUNDWORK_SESSION_TTY="$SESSION_TTY" timeout 3 node "${PLUGIN_ROOT}/lib/inject-specs.js" 2>/dev/null || echo '')
  fi
fi

# Clean up stale session files (best-effort, non-blocking)
if [ -n "$SESSION_TTY" ] && [ -f "${PLUGIN_ROOT}/lib/project-context.js" ]; then
  GROUNDWORK_SESSION_TTY="$SESSION_TTY" node -e "try{require('${PLUGIN_ROOT}/lib/project-context').cleanupStaleSessions()}catch(e){}" 2>/dev/null || true
fi

# Escape outputs for JSON - use jq if available, fallback to bash
escape_for_json() {
    local input="$1"

    # Use jq if available - handles all edge cases (unicode, control chars)
    if command -v jq &> /dev/null; then
        printf '%s' "$input" | jq -Rs . | sed 's/^"//;s/"$//'
        return
    fi

    # Fallback: pure bash escaping
    local output=""
    local i char
    for (( i=0; i<${#input}; i++ )); do
        char="${input:$i:1}"
        case "$char" in
            $'\\') output+='\\\\' ;;
            '"') output+='\"' ;;
            $'\n') output+='\n' ;;
            $'\r') output+='\r' ;;
            $'\t') output+='\t' ;;
            *) output+="$char" ;;
        esac
    done
    printf '%s' "$output"
}

warning_escaped=$(escape_for_json "$warning_message")
specs_notice_escaped=$(escape_for_json "$specs_notice")
specs_content_escaped=$(escape_for_json "$specs_content")
workflow_restoration_escaped=$(escape_for_json "$workflow_restoration")

# Build product context section if we have spec content
product_context=""
if [ -n "$specs_content" ]; then
  product_context="\\n\\n<product-context>\\n${specs_content_escaped}\\n</product-context>"
fi

# Output context injection as JSON
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<groundwork-context>\n${loaded_message}${warning_escaped}${specs_notice_escaped}${product_context}\n</groundwork-context>${workflow_restoration_escaped}"
  }
}
EOF
}

# Run main with error recovery - always exit 0
if ! main 2>&1; then
  log_error "Main function failed, outputting minimal response"
  # Output minimal valid hook response on error
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": ""
  }
}
EOF
fi

exit 0
