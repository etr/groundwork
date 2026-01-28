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

# ============================================
# Auto-Setup: Create required directories
# ============================================
HOMUNCULUS_DIR="${HOME}/.claude/homunculus"
mkdir -p "${HOMUNCULUS_DIR}/instincts/personal" 2>/dev/null || true
mkdir -p "${HOMUNCULUS_DIR}/instincts/inherited" 2>/dev/null || true
mkdir -p "${HOMUNCULUS_DIR}/evolved/agents" 2>/dev/null || true
mkdir -p "${HOMUNCULUS_DIR}/evolved/skills" 2>/dev/null || true
mkdir -p "${HOMUNCULUS_DIR}/evolved/commands" 2>/dev/null || true

# State directory for session restoration
STATE_DIR="${HOME}/.claude/groundwork-state"
mkdir -p "$STATE_DIR" 2>/dev/null || true

# ============================================
# Dependency Validation
# ============================================
missing_deps=""

if ! command -v node &> /dev/null; then
  missing_deps="${missing_deps}\n- node (required for hooks)"
fi

if ! command -v python3 &> /dev/null; then
  missing_deps="${missing_deps}\n- python3 (required for security hook)"
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
# Observations Analysis (Auto-triggered)
# ============================================
obs_notice=""
OBS_FILE="${HOMUNCULUS_DIR}/observations.jsonl"
LAST_ANALYSIS="${HOMUNCULUS_DIR}/.last-analysis"
ANALYSIS_THRESHOLD=30

if [ -f "$OBS_FILE" ] && [ -s "$OBS_FILE" ]; then
  obs_count=$(wc -l < "$OBS_FILE" 2>/dev/null || echo "0")

  # Check if analysis is needed (threshold reached and not analyzed recently)
  should_analyze=false
  if [ "$obs_count" -ge "$ANALYSIS_THRESHOLD" ]; then
    if [ ! -f "$LAST_ANALYSIS" ]; then
      should_analyze=true
    else
      # Check if last analysis was more than 1 hour ago
      last_analysis_time=$(stat -c %Y "$LAST_ANALYSIS" 2>/dev/null || stat -f %m "$LAST_ANALYSIS" 2>/dev/null || echo "0")
      current_time=$(date +%s)
      time_diff=$((current_time - last_analysis_time))
      if [ "$time_diff" -gt 3600 ]; then
        should_analyze=true
      fi
    fi
  fi

  # Run analysis in background if needed
  if [ "$should_analyze" = true ] && [ -f "${PLUGIN_ROOT}/lib/analyze-observations.js" ]; then
    (node "${PLUGIN_ROOT}/lib/analyze-observations.js" > /dev/null 2>&1 &)
    obs_notice="\n\n**Analyzing ${obs_count} observations** for patterns..."
  elif [ "$obs_count" -gt 100 ]; then
    obs_notice="\n\n**Note:** ${obs_count} observations collected. Run /instinct-status --analyze to process them."
  fi
fi

# ============================================
# Evolved Components Available
# ============================================
evolved_notice=""
evolved_dir="${HOMUNCULUS_DIR}/evolved"
evolved_count=0
for type in skills commands agents; do
  if [ -d "${evolved_dir}/${type}" ]; then
    count=$(find "${evolved_dir}/${type}" -name "*.md" -o -name "SKILL.md" 2>/dev/null | wc -l)
    evolved_count=$((evolved_count + count))
  fi
done

if [ "$evolved_count" -gt 0 ]; then
  evolved_notice="\n\n**${evolved_count} evolved components available.** Run /evolve --status to see them or copy to ~/.claude/ to activate."
fi

# ============================================
# Load and Inject Active Instincts
# ============================================
instincts_context=""
PROJECT_DIR="${PWD}"
MIN_CONFIDENCE=0.5

# Use Node.js helper for proper YAML frontmatter parsing
if [ -f "${PLUGIN_ROOT}/lib/load-instincts.js" ] && command -v node &> /dev/null; then
  # Build directory arguments with labels
  INSTINCT_DIRS=""
  [ -d "${HOMUNCULUS_DIR}/instincts/personal" ] && INSTINCT_DIRS="${INSTINCT_DIRS} ${HOMUNCULUS_DIR}/instincts/personal:personal"
  [ -d "${HOMUNCULUS_DIR}/instincts/inherited" ] && INSTINCT_DIRS="${INSTINCT_DIRS} ${HOMUNCULUS_DIR}/instincts/inherited:inherited"
  [ -d "${PROJECT_DIR}/.claude/instincts" ] && INSTINCT_DIRS="${INSTINCT_DIRS} ${PROJECT_DIR}/.claude/instincts:project"

  if [ -n "$INSTINCT_DIRS" ]; then
    # Load instincts via Node helper and format for display
    INSTINCTS_JSON=$(node "${PLUGIN_ROOT}/lib/load-instincts.js" $INSTINCT_DIRS --min-confidence=$MIN_CONFIDENCE 2>/dev/null || echo "[]")

    # Format instincts for context injection
    instincts_context=$(echo "$INSTINCTS_JSON" | python3 -c '
import json
import sys

try:
    instincts = json.load(sys.stdin)
    for i in instincts:
        conf = i.get("confidence", 0.5)
        print(f"- **{i[\"id\"]}** ({i[\"source\"]}, {conf}): {i[\"trigger\"]} → {i[\"action\"]}")
except:
    pass
' 2>/dev/null || echo "")
  fi
fi

# Build instincts notice
project_instincts_notice=""
if [ -n "$instincts_context" ]; then
  # Count loaded instincts
  instinct_count=$(echo -e "$instincts_context" | grep -c "^\-" || echo "0")
  project_instincts_notice="\n\n**Active Instincts (${instinct_count}):** These learned patterns should guide your behavior:\n${instincts_context}"
elif [ -d "${PROJECT_DIR}/.claude/instincts" ]; then
  project_instinct_count=$(find "${PROJECT_DIR}/.claude/instincts" -name "*.md" 2>/dev/null | wc -l)
  if [ "$project_instinct_count" -gt 0 ]; then
    project_instincts_notice="\n\n**${project_instinct_count} project-specific instincts found** (below confidence threshold). Run /instinct-status to see all."
  fi
fi

# ============================================
# New Instinct Notification
# ============================================
new_instinct_notice=""
INSTINCT_CHECK_FILE="${STATE_DIR}/.instinct-notification-last-check"

# Get last check timestamp (default to 0 if never checked)
last_instinct_check=0
if [ -f "$INSTINCT_CHECK_FILE" ]; then
  last_instinct_check=$(cat "$INSTINCT_CHECK_FILE" 2>/dev/null || echo "0")
fi

# Find new instinct files (created after last check)
new_instincts=()
for dir in personal inherited; do
  instinct_dir="${HOMUNCULUS_DIR}/instincts/${dir}"
  if [ -d "$instinct_dir" ]; then
    while IFS= read -r file; do
      if [ -n "$file" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
          file_time=$(stat -f "%m" "$file" 2>/dev/null || echo "0")
        else
          file_time=$(stat -c "%Y" "$file" 2>/dev/null || echo "0")
        fi
        if [ "$file_time" -gt "$last_instinct_check" ]; then
          instinct_name=$(basename "$file" .md)
          new_instincts+=("$instinct_name")
        fi
      fi
    done < <(find "$instinct_dir" -name "*.md" -type f 2>/dev/null)
  fi
done

# Also check project-specific instincts
if [ -d "${PROJECT_DIR}/.claude/instincts" ]; then
  while IFS= read -r file; do
    if [ -n "$file" ]; then
      if [[ "$OSTYPE" == "darwin"* ]]; then
        file_time=$(stat -f "%m" "$file" 2>/dev/null || echo "0")
      else
        file_time=$(stat -c "%Y" "$file" 2>/dev/null || echo "0")
      fi
      if [ "$file_time" -gt "$last_instinct_check" ]; then
        instinct_name=$(basename "$file" .md)
        new_instincts+=("${instinct_name} (project)")
      fi
    fi
  done < <(find "${PROJECT_DIR}/.claude/instincts" -name "*.md" -type f 2>/dev/null)
fi

# Build new instinct notice if any found
if [ ${#new_instincts[@]} -gt 0 ]; then
  instinct_list=$(printf ", %s" "${new_instincts[@]}")
  instinct_list="${instinct_list:2}"  # Remove leading ", "
  new_instinct_notice="\n\n**New instincts discovered:** ${instinct_list}. Run /instinct-status to see all instincts."
fi

# Update last check timestamp
echo "$(date +%s)" > "$INSTINCT_CHECK_FILE" 2>/dev/null || true

# ============================================
# Session State Restoration
# ============================================
restored_state=""
PRESERVED_STATE_FILE="${STATE_DIR}/preserved-context.txt"
if [ -f "$PRESERVED_STATE_FILE" ]; then
  preserved_content=$(cat "$PRESERVED_STATE_FILE" 2>/dev/null || echo "")
  if [ -n "$preserved_content" ]; then
    restored_state="\n\n**Restored from previous session:** ${preserved_content}"
    rm -f "$PRESERVED_STATE_FILE" 2>/dev/null || true
  fi
fi

# ============================================
# Project State Detection
# ============================================
specs_notice=""

# Detect what exists
has_prd=false; has_arch=false; has_tasks=false; has_code=false

[ -f "specs/product_specs.md" ] && has_prd=true
[ -f "specs/architecture.md" ] && has_arch=true
[ -f "specs/tasks.md" ] && has_tasks=true

# Check for code files (quick check - just see if any exist)
for ext in py ts js go rs java rb php c cpp tsx jsx; do
  if ls *.$ext 2>/dev/null | head -1 >/dev/null 2>&1; then
    has_code=true
    break
  fi
done
if [ "$has_code" = false ]; then
  if find . -maxdepth 3 \( -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.go" -o -name "*.rs" -o -name "*.java" -o -name "*.tsx" -o -name "*.jsx" \) 2>/dev/null | head -1 | grep -q .; then
    has_code=true
  fi
fi

# Generate suggestion message based on state
if $has_prd && $has_arch && $has_tasks; then
    specs_notice="\n\n**Project context available:** PRD, Architecture, Tasks in specs/. Use /next-task to work on the next task."
elif $has_prd && $has_arch; then
    specs_notice="\n\n**PRD and Architecture available.** Run /tasks to generate implementation tasks."
elif $has_prd; then
    specs_notice="\n\n**PRD available.** Run /architecture to design the technical approach based on your requirements."
elif $has_code; then
    specs_notice="\n\n**Project has code but no specs.** I can analyze your codebase to propose initial product specifications. Run /product-design to get started."
else
    specs_notice="\n\n**Getting started:** Run /product-design to define your product requirements."
fi

# Add gh warning, update notice, observations, evolved components, project instincts, new instincts, and restored state if applicable
specs_notice="${specs_notice}${gh_warning}${update_notice}${obs_notice}${evolved_notice}${project_instincts_notice}${new_instinct_notice}${restored_state}"

# ============================================
# Load using-groundwork skill content
# ============================================
using_groundwork_content=$(cat "${PLUGIN_ROOT}/skills/using-groundwork/SKILL.md" 2>&1 || echo "Error reading using-groundwork skill")

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

using_groundwork_escaped=$(escape_for_json "$using_groundwork_content")
warning_escaped=$(escape_for_json "$warning_message")
specs_notice_escaped=$(escape_for_json "$specs_notice")

# Output context injection as JSON
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<EXTREMELY_IMPORTANT>\nYou have groundwork skills.\n\n**Below is the full content of your 'groundwork:using-groundwork' skill - your introduction to using skills. For all other skills, use the 'Skill' tool:**\n\n${using_groundwork_escaped}\n\n${warning_escaped}${specs_notice_escaped}\n</EXTREMELY_IMPORTANT>"
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
