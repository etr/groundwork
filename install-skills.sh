#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Global state ---
declare -A SKILL_MAP       # skill-dir-name → installed-name
declare -A HAS_COMMAND     # skill-dir-name → 1 if command entry point
TARGETS=()
SCOPE=""
FORCE=false
DRY_RUN=false
SKILLS_ONLY=false
ALLOW_MANUAL_CLAUDE=false
SOURCE_DIR=""
BODY_SED_CMDS=""           # Pre-built sed commands for name mapping

# Counters
SKILL_COUNT=0
CMD_COUNT=0
AGENT_COUNT=0

# ============================================================
# CLI
# ============================================================

usage() {
    cat <<'EOF'
Usage: install-skills.sh [OPTIONS]

Install Groundwork skills and agents into AI coding tools.

Targets (at least one required):
  --claude-code    Install to Claude Code (recommends marketplace by default)
  --codex          Install to Codex CLI
  --opencode       Install to OpenCode
  --kiro           Install to Kiro
  --pi             Install to Pi coding agent

Scope (exactly one required):
  --global         Install to user-level config directory
  --project        Install to current project directory

Options:
  --force          Overwrite existing files
  --dry-run        Preview actions without making changes
  --skills-only    Install only skills (skip agents)
  --source DIR     Groundwork source dir (default: auto-detect from script location)
  --allow-manual-claude-code-install
                   Allow manual file-copy install for Claude Code
  --help           Show help

Examples:
  ./install-skills.sh --codex --global --dry-run
  ./install-skills.sh --kiro --project --force
  ./install-skills.sh --codex --opencode --global
  ./install-skills.sh --pi --global
  ./install-skills.sh --claude-code --global --allow-manual-claude-code-install
EOF
}

parse_args() {
    TARGETS=()
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --claude-code) TARGETS+=("claude-code") ;;
            --codex)       TARGETS+=("codex") ;;
            --opencode)    TARGETS+=("opencode") ;;
            --kiro)        TARGETS+=("kiro") ;;
            --pi)          TARGETS+=("pi") ;;
            --global)      SCOPE="global" ;;
            --project)     SCOPE="project" ;;
            --force)       FORCE=true ;;
            --dry-run)     DRY_RUN=true ;;
            --skills-only) SKILLS_ONLY=true ;;
            --allow-manual-claude-code-install) ALLOW_MANUAL_CLAUDE=true ;;
            --source)      shift; SOURCE_DIR="$1" ;;
            --help)        usage; exit 0 ;;
            *)             echo "Error: Unknown option: $1"; echo; usage; exit 1 ;;
        esac
        shift
    done

    if [[ ${#TARGETS[@]} -eq 0 ]]; then
        echo "Error: At least one target required (--claude-code, --codex, --opencode, --kiro, --pi)"
        exit 1
    fi

    if [[ -z "$SCOPE" ]]; then
        echo "Error: Scope required (--global or --project)"
        exit 1
    fi
}

# ============================================================
# Setup
# ============================================================

auto_detect_source() {
    if [[ -z "$SOURCE_DIR" ]]; then
        SOURCE_DIR="$SCRIPT_DIR"
    fi
    if [[ ! -d "$SOURCE_DIR/skills" ]]; then
        echo "Error: Cannot find skills/ directory in $SOURCE_DIR"
        exit 1
    fi
}

load_config() {
    local config="$SOURCE_DIR/install-config.txt"
    if [[ ! -f "$config" ]]; then
        echo "Error: Config file not found: $config"
        exit 1
    fi

    while IFS= read -r line; do
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// /}" ]] && continue

        local skill installed has_cmd
        skill=$(echo "$line" | sed 's/[[:space:]]*=.*//' | xargs)
        local rhs
        rhs=$(echo "$line" | sed 's/[^=]*=[[:space:]]*//')
        installed=$(echo "$rhs" | awk '{print $1}')
        has_cmd=$(echo "$rhs" | awk '{print $2}')

        SKILL_MAP["$skill"]="$installed"
        if [[ "$has_cmd" == "command" ]]; then
            HAS_COMMAND["$skill"]=1
        fi
    done < "$config"

    # Pre-build sed commands for groundwork:name → mapped-name
    # Order matters: more specific patterns first to avoid partial matches
    BODY_SED_CMDS=""

    # 1. Agent triple refs (groundwork:X:X → the X agent) — most specific
    for agent_dir in "$SOURCE_DIR"/agents/*/; do
        [[ ! -d "$agent_dir" ]] && continue
        local agent_name
        agent_name=$(basename "$agent_dir")
        BODY_SED_CMDS+="s|groundwork:${agent_name}:${agent_name}|the ${agent_name} agent|g;"
    done

    # 2. Skill name mappings: config keys + reverse aliases
    for skill in "${!SKILL_MAP[@]}"; do
        local mapped="${SKILL_MAP[$skill]}"
        if [[ "$mapped" != "drop" ]]; then
            # Primary: groundwork:<config-key> → <installed-name>
            BODY_SED_CMDS+="s|groundwork:${skill}|${mapped}|g;"
            # Reverse alias: if installed suffix differs from config key,
            # also map groundwork:<suffix> → <installed-name>
            local suffix="${mapped#groundwork-}"
            if [[ "$suffix" != "$skill" ]]; then
                BODY_SED_CMDS+="s|groundwork:${suffix}|${mapped}|g;"
            fi
        fi
    done

    # 3. Agent single refs (for agents not in skill map)
    for agent_dir in "$SOURCE_DIR"/agents/*/; do
        [[ ! -d "$agent_dir" ]] && continue
        local agent_name
        agent_name=$(basename "$agent_dir")
        if [[ -z "${SKILL_MAP[$agent_name]:-}" ]]; then
            BODY_SED_CMDS+="s|groundwork:${agent_name}|the ${agent_name} agent|g;"
        fi
    done
}

# ============================================================
# Destination paths
# ============================================================

get_dest_base() {
    local target="$1"
    case "$target" in
        claude-code)
            if [[ "$SCOPE" == "global" ]]; then echo "$HOME/.claude/plugins/groundwork"
            else echo ".claude/plugins/groundwork"; fi ;;
        codex)
            if [[ "$SCOPE" == "global" ]]; then echo "$HOME/.codex"
            else echo ".codex"; fi ;;
        opencode)
            if [[ "$SCOPE" == "global" ]]; then echo "$HOME/.config/opencode"
            else echo ".opencode"; fi ;;
        kiro)
            if [[ "$SCOPE" == "global" ]]; then echo "$HOME/.kiro"
            else echo ".kiro"; fi ;;
        pi)
            if [[ "$SCOPE" == "global" ]]; then echo "$HOME/.pi/agent"
            else echo ".pi"; fi ;;
    esac
}

# ============================================================
# Frontmatter & body helpers
# ============================================================

# Extract a single YAML frontmatter value (single-line only)
get_fm_value() {
    local content="$1" key="$2"
    echo "$content" | sed -n '/^---$/,/^---$/p' | grep "^${key}:" | head -1 | sed "s/^${key}:[[:space:]]*//"
}

# Extract body text (everything after second ---)
get_body() {
    echo "$1" | awk 'BEGIN{c=0} /^---$/{c++;if(c==2){f=1;next}} f{print}'
}

# Recursively inline required skill bodies into a parent skill.
# Appends dependency content as appendix sections.
# Uses _INLINE_VISITED (global within subshell) to prevent duplicates.
# Arguments: $1=skill directory name
inline_requires() {
    local skill_name="$1"
    local skill_file="$SOURCE_DIR/skills/$skill_name/SKILL.md"
    [[ ! -f "$skill_file" ]] && return

    local content
    content=$(<"$skill_file")
    local requires_line
    requires_line=$(get_fm_value "$content" "requires")
    [[ -z "$requires_line" ]] && return

    local deps dep
    IFS=',' read -ra deps <<< "$requires_line"
    for dep in "${deps[@]}"; do
        dep=$(echo "$dep" | xargs)  # trim whitespace
        [[ -z "$dep" ]] && continue
        [[ ":$_INLINE_VISITED:" == *":$dep:"* ]] && continue
        _INLINE_VISITED="$_INLINE_VISITED:$dep"

        # Recurse depth-first for transitive deps
        inline_requires "$dep"

        local dep_file="$SOURCE_DIR/skills/$dep/SKILL.md"
        [[ ! -f "$dep_file" ]] && continue
        local dep_content
        dep_content=$(<"$dep_file")
        local dep_body
        dep_body=$(get_body "$dep_content")
        local dep_name
        dep_name=$(get_fm_value "$dep_content" "name")

        echo ""
        echo "---"
        echo ""
        echo "## Appendix: ${dep_name:-$dep} Workflow"
        echo ""
        echo "> Follow these steps when the main workflow references this workflow."
        echo ""
        echo "$dep_body"
    done
}

# Rewrite frontmatter for target tool
transform_frontmatter() {
    local target="$1" component="$2" content="$3" installed_name="$4"
    local desc
    desc=$(get_fm_value "$content" "description")

    echo "---"
    case "$component" in
        skill)
            case "$target" in
                codex|kiro|pi)
                    echo "name: $installed_name"
                    echo "description: $desc"
                    ;;
                opencode)
                    echo "name: $installed_name"
                    echo "description: $desc"
                    ;;
            esac
            ;;
        agent)
            echo "name: $installed_name"
            echo "description: $desc"
            ;;
    esac
    echo "---"
}

# Apply body text transformations for non-Claude targets
transform_body() {
    local target="$1" content="$2"
    local task_repl="Adapt to your agent/automation capabilities."

    # Pi-specific tool name transforms (run before shared pipeline)
    if [[ "$target" == "pi" ]]; then
        content=$(echo "$content" | sed \
            -e 's|\bRead\b tool|read tool|g' \
            -e 's|\bEdit\b tool|edit tool|g' \
            -e 's|\bWrite\b tool|write tool|g' \
            -e 's|\bBash\b tool|bash tool|g' \
            -e 's|\bGlob\b tool|find tool|g' \
            -e 's|\bGrep\b tool|grep tool|g' \
            -e 's|`Read`|`read`|g' \
            -e 's|`Edit`|`edit`|g' \
            -e 's|`Write`|`write`|g' \
            -e 's|`Bash`|`bash`|g' \
            -e 's|`Glob`|`find`|g' \
            -e 's|`Grep`|`grep`|g' \
            -e 's|`Task`|`groundwork_agent`|g' \
            -e 's|the Task tool|the groundwork_agent tool|g' \
            -e 's|Task tool|groundwork_agent tool|g' \
            -e 's|Use Task tool|Use groundwork_agent tool|g' \
            -e 's|subagent_type|agent|g' \
        )
    fi

    # Build appendix-aware sed expressions conditionally per target
    local appendix_seds=()
    if [[ "$target" == "opencode" ]]; then
        # OpenCode: skill deps are inlined as appendix — name is lost, appendix has content
        appendix_seds=(
            -e 's|\*\*You MUST call the Skill tool now:\*\*.*|\*\*Follow the referenced workflow steps in the appendix below.\*\*|g'
            -e 's|Invoke the `\(groundwork:[^`]*\)` skill|Follow the \1 workflow steps (see appendix below)|g'
            -e 's|Invoke the `\([^`]*\)` skill|Follow the \1 workflow steps (see appendix below)|g'
            -e 's|[Ii]nvoke the skill `\([^`]*\)`|Follow the \1 workflow steps (see appendix below)|g'
            -e 's|[Ii]nvoke `\([^`]*\)` skill|Follow the \1 workflow steps (see appendix below)|g'
        )
    else
        # Codex/Kiro/Pi: no inlining — preserve skill name reference for BODY_SED_CMDS mapping
        appendix_seds=(
            -e 's|\*\*You MUST call the Skill tool now:\*\* `\([^`]*\)`|You MUST call the skill `\1` now.|g'
            -e 's|Invoke the `\(groundwork:[^`]*\)` skill|Follow the workflow steps in skill `\1`|g'
            -e 's|Invoke the `\([^`]*\)` skill|Follow the workflow steps in skill `\1`|g'
            -e 's|[Ii]nvoke the skill `\([^`]*\)`|Follow the workflow steps in skill `\1`|g'
            -e 's|[Ii]nvoke `\([^`]*\)` skill|Follow the workflow steps in skill `\1`|g'
        )
    fi

    echo "$content" | sed \
        -e 's|Skill(skill="\(groundwork:[^"]*\)"[^)]*)|the \1 workflow|g' \
        "${appendix_seds[@]}" \
        -e 's|[Ii]nvoke `\(the [^`]* workflow\)`|Follow \1 steps|g' \
        -e 's|AskUserQuestion|Ask the user|g' \
        -e 's|ExitPlanMode()|Proceed with implementation|g' \
        -e 's|context compaction|context management|g' \
        -e 's|subagent|sub-task|g' \
        -e 's|\${CLAUDE_PLUGIN_ROOT}|the plugin directory|g' \
        -e "${BODY_SED_CMDS:-.}" | \
    awk -v repl="$task_repl" '
        # Remove <EXTREMELY-IMPORTANT> blocks
        /<EXTREMELY-IMPORTANT>/ { in_xml=1; next }
        /<\/EXTREMELY-IMPORTANT>/ { in_xml=0; next }
        in_xml { next }

        # Task() blocks inside code fences: suppress and replace
        in_task && /^[[:space:]]*```/ {
            in_task = 0; in_fence = 0
            print "> " repl
            print ""
            next
        }
        in_task { next }

        /^[[:space:]]*```/ {
            if (in_fence) {
                # Closing fence (non-task)
                in_fence = 0
                print
                next
            }
            # Opening fence — buffer to check next line
            buffered = $0
            in_fence = 1
            next
        }

        buffered != "" {
            if ($0 ~ /^[[:space:]]*Task\(/) {
                in_task = 1
                buffered = ""
                next
            } else {
                print buffered
                buffered = ""
                print
                next
            }
        }

        { print }

        END { if (buffered != "") print buffered }
    '
}

# ============================================================
# File writing
# ============================================================

write_file() {
    local dest="$1" content="$2" label="$3"

    if [[ "$DRY_RUN" == true ]]; then
        echo "  [dry-run] $dest ($label)"
        return 0
    fi

    if [[ -f "$dest" && "$FORCE" != true ]]; then
        echo "  [skip] $dest (exists, use --force)"
        return 0
    fi

    mkdir -p "$(dirname "$dest")"
    printf '%s\n' "$content" > "$dest"
    echo "  [wrote] $dest ($label)"
}

# ============================================================
# Install: Claude Code
# ============================================================

install_claude_code() {
    local dest
    dest=$(get_dest_base "claude-code")

    if [[ "$DRY_RUN" == true ]]; then
        echo "  [dry-run] Would copy $SOURCE_DIR → $dest"
        return 0
    fi

    if [[ -d "$dest" && "$FORCE" != true ]]; then
        echo "  [skip] $dest (exists, use --force)"
        return 0
    fi

    mkdir -p "$(dirname "$dest")"
    if [[ "$FORCE" == true && -d "$dest" ]]; then
        rm -rf "$dest"
    fi
    cp -r "$SOURCE_DIR" "$dest"
    echo "  [copied] $SOURCE_DIR → $dest"
}

# ============================================================
# Install: Skills
# ============================================================

install_skills_for_target() {
    local target="$1"
    SKILL_COUNT=0

    for skill_dir in "$SOURCE_DIR"/skills/*/; do
        local skill_name
        skill_name=$(basename "$skill_dir")
        local skill_file="$skill_dir/SKILL.md"
        [[ ! -f "$skill_file" ]] && continue

        local installed="${SKILL_MAP[$skill_name]:-}"
        [[ -z "$installed" ]] && continue
        [[ "$installed" == "drop" ]] && continue

        local content
        content=$(<"$skill_file")
        local raw_body
        raw_body=$(get_body "$content")

        # Inline required skill bodies — only OpenCode needs appendix sections
        if [[ "$target" == "opencode" ]]; then
            local inlined_deps
            inlined_deps=$(_INLINE_VISITED="$skill_name"; inline_requires "$skill_name")
            if [[ -n "$inlined_deps" ]]; then
                raw_body="$raw_body
$inlined_deps"
            fi
        fi

        local new_fm new_body result
        new_fm=$(transform_frontmatter "$target" "skill" "$content" "$installed")
        new_body=$(transform_body "$target" "$raw_body")
        result="$new_fm
$new_body"

        local dest_base
        dest_base=$(get_dest_base "$target")
        local dest
        case "$target" in
            codex)    dest="$dest_base/skills/$installed/SKILL.md" ;;
            opencode) dest="$dest_base/skills/$installed/SKILL.md" ;;
            kiro)     dest="$dest_base/skills/$installed/SKILL.md" ;;
            pi)       dest="$dest_base/skills/$installed/SKILL.md" ;;
        esac

        write_file "$dest" "$result" "skill"
        ((SKILL_COUNT++)) || true
    done
}

# ============================================================
# Install: Commands (thin wrappers)
# ============================================================

install_commands_for_target() {
    # Commands are only relevant for Claude Code (which uses cp -r).
    # All non-Claude targets have directly discoverable skills with groundwork- prefix.
    CMD_COUNT=0
    return 0
}

# ============================================================
# Install: Agents
# ============================================================

install_agents_for_target() {
    local target="$1"
    AGENT_COUNT=0

    for agent_dir in "$SOURCE_DIR"/agents/*/; do
        local agent_name
        agent_name=$(basename "$agent_dir")
        local agent_file="$agent_dir/AGENT.md"
        [[ ! -f "$agent_file" ]] && continue

        local content
        content=$(<"$agent_file")
        local desc
        desc=$(get_fm_value "$content" "description")
        local new_body
        new_body=$(transform_body "$target" "$(get_body "$content")")

        local dest_base
        dest_base=$(get_dest_base "$target")

        case "$target" in
            codex)
                # Install as a skill with review- prefix (Codex has no native agent concept)
                local installed_name="review-${agent_name}"
                local new_fm
                new_fm=$(transform_frontmatter "$target" "skill" "$content" "$installed_name")
                local dest="$dest_base/skills/${installed_name}/SKILL.md"
                write_file "$dest" "$new_fm
$new_body" "review agent"
                ;;
            opencode)
                local new_fm
                new_fm=$(transform_frontmatter "$target" "agent" "$content" "$agent_name")
                local dest="$dest_base/agents/review-${agent_name}.md"
                write_file "$dest" "$new_fm
$new_body" "agent"
                ;;
            kiro)
                # JSON config + prompt file pair
                local json_content
                json_content=$(printf '{\n  "name": "%s",\n  "description": "%s",\n  "prompt": "file://./%s-prompt.md"\n}' \
                    "$agent_name" "$desc" "$agent_name")
                write_file "$dest_base/agents/${agent_name}.json" "$json_content" "agent config"
                write_file "$dest_base/agents/${agent_name}-prompt.md" "$new_body" "agent prompt"
                ;;
            pi)
                # Install as a skill with review- prefix (Pi has no native agent concept)
                local installed_name="review-${agent_name}"
                local new_fm
                new_fm=$(transform_frontmatter "$target" "skill" "$content" "$installed_name")
                local dest="$dest_base/skills/${installed_name}/SKILL.md"
                write_file "$dest" "$new_fm
$new_body" "review agent"
                ;;
        esac

        ((AGENT_COUNT++)) || true
    done
}

# ============================================================
# Install: Pi Extension
# ============================================================

install_pi_extension() {
    local dest_base
    dest_base=$(get_dest_base "pi")
    local ext_dir="$dest_base/extensions/groundwork"

    if [[ "$DRY_RUN" == true ]]; then
        echo "  [dry-run] $ext_dir/ (Pi extension)"
        return 0
    fi

    # Copy the pre-built extension from source
    if [[ -d "$SOURCE_DIR/pi-extension" ]]; then
        mkdir -p "$ext_dir/lib"
        cp "$SOURCE_DIR/pi-extension/"*.ts "$ext_dir/" 2>/dev/null || true
        cp "$SOURCE_DIR/pi-extension/lib/"*.ts "$ext_dir/lib/" 2>/dev/null || true
        echo "  [wrote] $ext_dir/ (Pi extension)"
    else
        echo "  [warn] Pi extension source not found at $SOURCE_DIR/pi-extension"
    fi
}

# ============================================================
# Summary
# ============================================================

print_summary() {
    local target="$1"
    echo ""
    echo "  Summary for $target:"
    if [[ ("$target" == "codex" || "$target" == "pi") && "$SKILLS_ONLY" != true && $AGENT_COUNT -gt 0 ]]; then
        echo "    Skills installed: $((SKILL_COUNT + AGENT_COUNT)) (includes $AGENT_COUNT review agents)"
    else
        echo "    Skills installed: $SKILL_COUNT"
    fi
    if [[ "$SKILLS_ONLY" != true && "$target" != "codex" && "$target" != "pi" ]]; then
        echo "    Agents installed: $AGENT_COUNT"
    fi
}

# ============================================================
# Main
# ============================================================

main() {
    parse_args "$@"
    auto_detect_source
    load_config

    echo "Groundwork Installer"
    echo "  Source: $SOURCE_DIR"
    echo "  Scope:  $SCOPE"
    [[ "$DRY_RUN" == true ]] && echo "  Mode:   DRY RUN"
    [[ "$FORCE" == true ]] && echo "  Mode:   FORCE overwrite"
    echo ""

    for target in "${TARGETS[@]}"; do
        echo "=== $target ==="
        echo ""

        if [[ "$target" == "claude-code" ]]; then
            if [[ "$ALLOW_MANUAL_CLAUDE" != true ]]; then
                echo "  For Claude Code, we recommend installing via the marketplace:"
                echo ""
                echo "    claude plugin marketplace add https://github.com/etr/groundwork-marketplace"
                echo "    claude plugin install groundwork"
                echo ""
                echo "  To use this installer instead, pass --allow-manual-claude-code-install"
                echo ""
                continue
            fi

            install_claude_code
            echo ""
            echo "  Summary for claude-code:"
            echo "    Full plugin copy (no transformation)"
            echo ""
            echo "  Note: Hooks require manual setup for each tool."
            echo ""
            continue
        fi

        install_skills_for_target "$target"

        if [[ "$SKILLS_ONLY" != true ]]; then
            install_commands_for_target "$target"
            install_agents_for_target "$target"
        fi

        # Pi: install the TypeScript extension for lifecycle integration
        if [[ "$target" == "pi" ]]; then
            install_pi_extension
        fi

        print_summary "$target"
        echo ""
        echo "  Note: Hooks require manual setup for each tool."
        echo ""
    done

    echo "Done."
}

main "$@"
