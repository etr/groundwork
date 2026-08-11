#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Global state ---
OVERRIDES=""               # newline-delimited "skill-dir-name=installed-name" exceptions
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

# Resolve a skill-dir name to its installed name: an explicit override from
# install-config.txt if present, otherwise the fail-closed default
# (groundwork-<name>). Returns "drop" for skills excluded by the config.
# bash 3.2 compatible — no associative array.
installed_name() {
    local skill="$1" line
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        if [[ "${line%%=*}" == "$skill" ]]; then
            echo "${line#*=}"
            return
        fi
    done <<< "$OVERRIDES"
    echo "groundwork-${skill}"
}

should_export_skill() {
    local target="$1" skill="$2"
    [[ "$skill" != "statusline" || "$target" == "codex" ]]
}

load_config() {
    local config="$SOURCE_DIR/install-config.txt"

    # Fail-closed: every skill on disk exports as groundwork-<name> by default.
    # The config file lists only exceptions (drops and custom renames), so a
    # newly-added skill is exported automatically and can never be silently
    # omitted by forgetting to register it. Exceptions are kept as a small
    # newline-delimited string and consulted by installed_name().
    OVERRIDES=""
    if [[ -f "$config" ]]; then
        while IFS= read -r line; do
            [[ "$line" =~ ^[[:space:]]*# ]] && continue
            [[ -z "${line// /}" ]] && continue

            local lhs installed rhs
            lhs=$(echo "$line" | sed 's/[[:space:]]*=.*//' | xargs)
            rhs=$(echo "$line" | sed 's/[^=]*=[[:space:]]*//')
            installed=$(echo "$rhs" | awk '{print $1}')

            OVERRIDES+="${lhs}=${installed}"$'\n'
        done < "$config"
    fi

    # Pre-build sed commands for groundwork:name → mapped-name
    # Order matters: more specific patterns first to avoid partial matches
    BODY_SED_CMDS=""

    # 1. Agent triple refs (groundwork:X:X → the X agent) — most specific
    for agent_dir in "$SOURCE_DIR"/agents/*/; do
        [[ ! -d "$agent_dir" ]] && continue
        local agent_name
        agent_name=$(basename "$agent_dir")
        BODY_SED_CMDS+="s|groundwork:${agent_name}:${agent_name}|the ${agent_name} agent|g"$'\n'
    done

    # 2. Skill name mappings: every skill dir (default or overridden) + reverse aliases
    for skill_dir in "$SOURCE_DIR"/skills/*/; do
        [[ ! -d "$skill_dir" ]] && continue
        local skill mapped suffix
        skill=$(basename "$skill_dir")
        mapped=$(installed_name "$skill")
        if [[ "$mapped" != "drop" ]]; then
            # Primary: groundwork:<skill> → <installed-name>
            BODY_SED_CMDS+="s|groundwork:${skill}|${mapped}|g"$'\n'
            # Reverse alias: if installed suffix differs from skill name,
            # also map groundwork:<suffix> → <installed-name>
            suffix="${mapped#groundwork-}"
            if [[ "$suffix" != "$skill" ]]; then
                BODY_SED_CMDS+="s|groundwork:${suffix}|${mapped}|g"$'\n'
            fi
        fi
    done

    # 3. Agent single refs (for agents with no same-named skill)
    for agent_dir in "$SOURCE_DIR"/agents/*/; do
        [[ ! -d "$agent_dir" ]] && continue
        local agent_name
        agent_name=$(basename "$agent_dir")
        if [[ ! -d "$SOURCE_DIR/skills/$agent_name" ]]; then
            BODY_SED_CMDS+="s|groundwork:${agent_name}|the ${agent_name} agent|g"$'\n'
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
    echo "$content" | sed -n '/^---$/,/^---$/p' | sed -n "s/^${key}:[[:space:]]*//p" | head -1
}

# Extract body text (everything after second ---)
get_body() {
    echo "$1" | awk 'BEGIN{c=0} /^---$/{c++;if(c==2){f=1;next}} f{print}'
}

codex_model_for_claude() {
    local model="$1"
    case "$model" in
        ""|inherit) echo "" ;;
        sonnet) echo "gpt-5.6-terra" ;;
        'opus[1m]') echo "gpt-5.6-sol" ;;
        *)
            echo "Error: No Codex model mapping for Claude model '$model'" >&2
            return 1
            ;;
    esac
}

codex_effort_for_claude() {
    local effort="$1"
    case "$effort" in
        "") echo "" ;;
        low|medium|high|max) echo "$effort" ;;
        *)
            echo "Error: No Codex reasoning-effort mapping for Claude effort '$effort'" >&2
            return 1
            ;;
    esac
}

codex_model_for_agent() {
    local agent_name="$1" source_model="$2"
    case "$agent_name" in
        architecture-task-alignment-checker|code-simplifier|conventions-reviewer|design-task-alignment-checker|housekeeper|prd-task-alignment-checker)
            echo "gpt-5.6-luna"
            ;;
        architecture-alignment-checker|cloud-infrastructure-reviewer|code-quality-reviewer|design-consistency-checker|performance-reviewer|prd-architecture-checker|spec-alignment-checker|task-executor|test-quality-reviewer|validation-fixer)
            echo "gpt-5.6-terra"
            ;;
        researcher|security-reviewer)
            echo "gpt-5.6-sol"
            ;;
        *)
            codex_model_for_claude "$source_model"
            ;;
    esac
}

codex_effort_for_agent() {
    local agent_name="$1" source_effort="$2"
    case "$agent_name" in
        architecture-alignment-checker|architecture-task-alignment-checker|cloud-infrastructure-reviewer|code-quality-reviewer|code-simplifier|conventions-reviewer|design-consistency-checker|design-task-alignment-checker|housekeeper|performance-reviewer|prd-architecture-checker|prd-task-alignment-checker|researcher|security-reviewer|spec-alignment-checker|task-executor|test-quality-reviewer|validation-fixer)
            echo "high"
            ;;
        *)
            codex_effort_for_claude "$source_effort"
            ;;
    esac
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
    # Strip the Claude-Code-only slash-command hint ("Usage /groundwork:<name> ...").
    # Other harnesses have no /groundwork: slash command — they discover skills by
    # description match — so the clause is noise and would leak a "groundwork:" ref.
    desc=$(printf '%s' "$desc" | sed 's| *Usage /groundwork:.*$||')

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
    local target="$1" content="$2" component="${3:-skill}"
    local reference_root reference_sed
    if [[ "$component" == "agent" ]]; then
        reference_root="<agent-directory>/references"
    else
        reference_root="<skill-directory>/references"
    fi
    reference_sed='s|\${CLAUDE_PLUGIN_ROOT}/references|'"$reference_root"'|g'

    if [[ "$target" != "codex" ]]; then
        content=$(printf '%s\n' "$content" | sed '\|/groundwork:statusline|d')
    fi

    # Codex model names differ from Claude Code's. Keep source recommendations
    # native to Claude Code and translate only the Codex export.
    if [[ "$target" == "codex" ]]; then
        content=$(echo "$content" | sed \
            -e 's|Sonnet or Opus|Terra or Sol|g' \
            -e 's|sonnet or opus|terra or sol|g' \
            -e 's|Opus (1M context)|Sol|g' \
            -e 's|opus\[1m\]|sol|g' \
            -e 's|Haiku|Luna|g' \
            -e 's|haiku|luna|g' \
            -e 's|Sonnet|Terra|g' \
            -e 's|sonnet|terra|g' \
            -e 's|Opus|Sol|g' \
            -e 's|opus|sol|g'
        )
    fi

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

    echo "$content" | \
        node "$SOURCE_DIR/lib/transform-agents.js" --target "$target" | \
        sed \
        -e 's|Skill(skill="\(groundwork:[^"]*\)"[^)]*)|the \1 workflow|g' \
        -e "s|Skill(skill='\(groundwork:[^']*\)'[^)]*)|the \1 workflow|g" \
        "${appendix_seds[@]}" \
        -e 's|[Ii]nvoke `\(the [^`]* workflow\)`|Follow \1 steps|g' \
        -e 's|AskUserQuestion|Ask the user|g' \
        -e 's|ExitPlanMode()|Proceed with implementation|g' \
        -e 's|context compaction|context management|g' \
        -e 's|subagent|sub-task|g' \
        -e "$reference_sed" \
        -e 's|\${CLAUDE_PLUGIN_ROOT}|the plugin directory|g' \
        -e "${BODY_SED_CMDS:-.}"
}

translate_statusline_body() {
    cat "$SOURCE_DIR/skills/statusline/codex-skill-body.md"
}

portable_project_context_preamble() {
    local target="$1"
    cat <<EOF
## Portable Project Context

Before interpreting project-context placeholders in this workflow:

1. Resolve the directory containing this \`SKILL.md\`.
2. Run \`node <skill-directory>/scripts/project-context-cli.js resolve --harness ${target}\` from the repository working directory.
3. Use the returned JSON values as the exact bindings for \`{{project_name}}\`, \`{{project_root}}\`, and \`{{specs_dir}}\` everywhere below.
4. If \`selection_required\` is true, follow the \`groundwork-select-project\` workflow, then resolve again.

EOF
}

portable_runtime_context_preamble() {
    cat <<'EOF'
## Codex Runtime Context

Before applying any model or effort recommendation in this workflow:

1. Resolve the directory containing this `SKILL.md`.
2. Run `node <skill-directory>/scripts/runtime-context-cli.js --harness codex` from the repository working directory.
3. Use the returned `effort_level` and `model` values as the exact bindings for `{{effort_level}}` and the current model.
4. Do not infer either value from the generic assistant family label when the resolver returns a concrete value.

EOF
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

# Keep portable components self-contained without copying the entire shared tree.
write_portable_references() {
    local content="$1" dest_dir="$2"
    local references
    references=$(printf '%s\n' "$content" | awk '
        {
            line = $0
            marker = "${CLAUDE_PLUGIN_ROOT}/references/"
            while ((start = index(line, marker)) > 0) {
                line = substr(line, start + length(marker))
                if (match(line, /^[A-Za-z0-9._\/-]+/)) {
                    print "references/" substr(line, RSTART, RLENGTH)
                    line = substr(line, RLENGTH + 1)
                } else {
                    break
                }
            }
        }
    ' | sort -u)

    local reference source
    while IFS= read -r reference; do
        [[ -z "$reference" ]] && continue
        source="$SOURCE_DIR/$reference"
        [[ -f "$source" ]] || continue
        write_file "$dest_dir/$reference" "$(<"$source")" "reference"
    done <<< "$references"
}

write_codex_agent() {
    local dest="$1" content="$2" label="$3" dest_base="$4"

    if [[ "$DRY_RUN" == true ]]; then
        echo "  [dry-run] $dest ($label)"
        return 0
    fi

    local args=(--base "$dest_base" --dest "$dest")
    [[ "$FORCE" == true ]] && args+=(--force)

    local result
    result=$(printf '%s\n' "$content" | node "$SOURCE_DIR/lib/write-codex-agent.js" "${args[@]}")
    if [[ "$result" == "skipped" ]]; then
        echo "  [skip] $dest (exists, use --force)"
    else
        echo "  [wrote] $dest ($label)"
    fi
}

remove_legacy_codex_agent_skill() {
    local agent_name="$1" dest_base="$2"
    local legacy_skill="$dest_base/skills/review-${agent_name}/SKILL.md"

    if [[ "$DRY_RUN" == true ]]; then
        if [[ -e "$legacy_skill" || -L "$legacy_skill" ]]; then
            echo "  [dry-run] remove $legacy_skill (legacy agent skill)"
        fi
        return 0
    fi

    local result
    result=$(node "$SOURCE_DIR/lib/remove-legacy-codex-agent-skill.js" \
        --base "$dest_base" --skill "$legacy_skill")
    if [[ "$result" == "removed" ]]; then
        echo "  [removed] $legacy_skill (legacy agent skill)"
    fi
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
        should_export_skill "$target" "$skill_name" || continue

        local installed
        installed=$(installed_name "$skill_name")
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
        if [[ "$target" == "codex" && "$skill_name" == "statusline" ]]; then
            new_body=$(translate_statusline_body)
        else
            new_body=$(transform_body "$target" "$raw_body" "skill")
        fi
        if [[ "$target" == "codex" ]]; then
            new_body=$(printf '%s\n' "$new_body" | node \
                "$SOURCE_DIR/lib/apply-codex-skill-policy.js" --skill "$skill_name")
        fi

        local needs_project_runtime=false
        local needs_runtime_context=false
        if [[ "$target" == "codex" && ( "$raw_body" == *'{{effort_level}}'* || "$skill_name" == "validate" ) ]]; then
            needs_runtime_context=true
            new_body="$(portable_runtime_context_preamble)

$new_body"
        fi
        if [[ "$skill_name" == "select-project" ]]; then
            needs_project_runtime=true
            new_body=$(printf '%s' "$new_body" | sed \
                "s|node the plugin directory/lib/persist-project.js \"<selected-name>\"|node <skill-directory>/scripts/project-context-cli.js select \"<selected-name>\" --harness ${target}|")
        fi
        if [[ "$raw_body" == *'{{project_name}}'* || "$raw_body" == *'{{project_root}}'* || "$raw_body" == *'{{specs_dir}}'* ]]; then
            needs_project_runtime=true
            new_body="$(portable_project_context_preamble "$target")

$new_body"
        fi
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
        write_portable_references "$raw_body" "$(dirname "$dest")"
        if [[ "$needs_project_runtime" == true ]]; then
            local runtime_dir
            runtime_dir="$(dirname "$dest")/scripts"
            if [[ "$target" == "codex" ]]; then
                write_codex_agent "$runtime_dir/project-context-cli.js" "$(<"$SOURCE_DIR/lib/project-context-cli.js")" "project context runtime" "$dest_base"
                write_codex_agent "$runtime_dir/project-context.js" "$(<"$SOURCE_DIR/lib/project-context.js")" "project context runtime" "$dest_base"
            else
                write_file "$runtime_dir/project-context-cli.js" "$(<"$SOURCE_DIR/lib/project-context-cli.js")" "project context runtime"
                write_file "$runtime_dir/project-context.js" "$(<"$SOURCE_DIR/lib/project-context.js")" "project context runtime"
            fi
        fi
        if [[ "$needs_runtime_context" == true ]]; then
            local runtime_dir
            runtime_dir="$(dirname "$dest")/scripts"
            write_codex_agent "$runtime_dir/runtime-context-cli.js" "$(<"$SOURCE_DIR/lib/runtime-context-cli.js")" "runtime context resolver" "$dest_base"
        fi
        if [[ "$target" == "codex" && "$skill_name" == "validate" ]]; then
            local validator_dir
            validator_dir="$(dirname "$dest")/scripts"
            write_codex_agent "$validator_dir/validate-fixer-result.js" "$(<"$SOURCE_DIR/lib/validate-fixer-result.js")" "fixer result validator" "$dest_base"
        fi
        ((SKILL_COUNT++)) || true
    done
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
        local raw_body body_component new_body
        raw_body=$(get_body "$content")
        body_component="agent"
        [[ "$target" == "pi" ]] && body_component="skill"
        new_body=$(transform_body "$target" "$raw_body" "$body_component")

        if [[ "$target" == "codex" ]]; then
            new_body=$(printf '%s\n' "$new_body" | node \
                "$SOURCE_DIR/lib/apply-codex-skill-policy.js" --agent "$agent_name")
        fi

        local dest_base
        dest_base=$(get_dest_base "$target")
        local portable_dir="$dest_base/agents"

        case "$target" in
            codex)
                local claude_model claude_effort codex_model codex_effort
                claude_model=$(get_fm_value "$content" "model")
                claude_effort=$(get_fm_value "$content" "effort")
                codex_model=$(codex_model_for_agent "$agent_name" "$claude_model")
                codex_effort=$(codex_effort_for_agent "$agent_name" "$claude_effort")

                local render_args=(
                    --name "$agent_name"
                    --description "$desc"
                )
                [[ -n "$codex_model" ]] && render_args+=(--model "$codex_model")
                [[ -n "$codex_effort" ]] && render_args+=(--effort "$codex_effort")

                local codex_agent
                codex_agent=$(printf '%s' "$new_body" | node \
                    "$SOURCE_DIR/lib/render-codex-agent.js" "${render_args[@]}")
                local dest="$dest_base/agents/${agent_name}.toml"
                write_codex_agent "$dest" "$codex_agent" "agent" "$dest_base"
                if [[ "$agent_name" == "validation-fixer" ]]; then
                    write_codex_agent "$dest_base/agents/$agent_name/scripts/validate-fixer-result.js" \
                        "$(<"$SOURCE_DIR/lib/validate-fixer-result.js")" "fixer result validator" "$dest_base"
                fi
                remove_legacy_codex_agent_skill "$agent_name" "$dest_base"
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
                portable_dir="$dest_base/skills/${installed_name}"
                write_file "$dest" "$new_fm
$new_body" "review agent"
                ;;
        esac

        write_portable_references "$raw_body" "$portable_dir"

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
    if [[ "$target" == "pi" && "$SKILLS_ONLY" != true && $AGENT_COUNT -gt 0 ]]; then
        echo "    Skills installed: $((SKILL_COUNT + AGENT_COUNT)) (includes $AGENT_COUNT review agents)"
    else
        echo "    Skills installed: $SKILL_COUNT"
    fi
    if [[ "$SKILLS_ONLY" != true && "$target" != "pi" ]]; then
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
