#!/usr/bin/env bash
input=$(cat)

# Parse renderer input and stable settings in one jq process. @sh keeps eval data-only.
settings_file="$HOME/.claude/settings.json"
[ -f "$settings_file" ] || settings_file=/dev/null
parsed_input=$(printf '%s' "$input" | jq -r --rawfile settings "$settings_file" '
[
    (.cwd // ""),
    (.model.display_name // .model.id // "unknown"),
    (.context_window.used_percentage // ""),
    (.context_window.context_window_size // 0),
    (if .context_window.current_usage != null then
        ((.context_window.current_usage.input_tokens // 0)
         + (.context_window.current_usage.cache_creation_input_tokens // 0)
         + (.context_window.current_usage.cache_read_input_tokens // 0))
     else 0 end),
    (($settings | try fromjson catch {}) | .effortLevel // "default")
] | map(tostring | @sh) |
"cwd=\(.[0])\nmodel=\(.[1])\nused=\(.[2])\nctx_size=\(.[3])\nctx_used_abs=\(.[4])\neffort=\(.[5])"
' 2>/dev/null)
eval "$parsed_input"
: "${cwd:=}" "${model:=unknown}" "${used:=}" "${ctx_size:=0}" "${ctx_used_abs:=0}" "${effort:=default}"

# -- Bells-and-whistles mute indicator ----------------------------------------
speaker_symbol=""
BNW_INSTALL_PATH=""
installed_plugins="$HOME/.claude/plugins/installed_plugins.json"
if [ -f "$installed_plugins" ]; then
    BNW_INSTALL_PATH=$(jq -r '
        [.plugins | to_entries[]
         | select(.key | contains("bells-and-whistles"))
         | .value[0].installPath // empty][0] // empty
    ' "$installed_plugins" 2>/dev/null)
fi

if [ -n "$BNW_INSTALL_PATH" ]; then
    MUTE_DIR=$(dirname "$BNW_INSTALL_PATH")
    MY_TTY=""
    if [ -n "$TMUX_PANE" ]; then
        MY_TTY=$(tmux display-message -t "$TMUX_PANE" -p '#{pane_tty}' 2>/dev/null)
    else
        _raw=$(ps -o tty= -p $$ 2>/dev/null | tr -d ' ')
        [ -n "$_raw" ] && [ "$_raw" != "?" ] && MY_TTY="/dev/$_raw"
    fi
    TTY_ID=""
    [ -n "$MY_TTY" ] && TTY_ID=$(echo "$MY_TTY" | sed 's|^/dev/||; s|/|_|g')

    is_muted=0
    if [ -n "$TTY_ID" ] && [ -f "${MUTE_DIR}/.mute_tty_${TTY_ID}" ]; then
        is_muted=1
    elif [ -f "${MUTE_DIR}/.mute_all" ]; then
        is_muted=1
    fi

    if [ "$is_muted" -eq 1 ]; then
        speaker_symbol=$'\xf0\x9f\x94\x87'
    else
        speaker_symbol=$'\xf0\x9f\x94\x8a'
    fi
fi

sha1_digest() {
    python3 -c 'import hashlib, sys; print(hashlib.sha1(sys.stdin.buffer.read()).hexdigest())'
}

# Git info
git_info=""
if git -C "$cwd" rev-parse --git-dir > /dev/null 2>&1; then
    git_root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)
    git_repo=${git_root##*/}
    git_branch=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null || git -C "$cwd" rev-parse --short HEAD 2>/dev/null)

    git_pr=""
    if command -v gh > /dev/null 2>&1; then
        pr_cache_dir="$HOME/.claude/statusline-pr-cache"
        pr_cache_hash=$(printf '%s\n%s' "$git_root" "$git_branch" | sha1_digest)
        pr_cache_key=${pr_cache_hash:0:20}
        pr_cache="$pr_cache_dir/$pr_cache_key"
        mkdir -p "$pr_cache_dir" 2>/dev/null
        if [ -f "$pr_cache" ]; then
            pr_num=$(cat "$pr_cache" 2>/dev/null)
            [ -n "$pr_num" ] && git_pr="#${pr_num}"
        fi
        pr_cache_age=999999
        if [ -f "$pr_cache" ]; then
            pr_cache_age=$(( $(date +%s) - $(date -r "$pr_cache" +%s 2>/dev/null || echo 0) ))
        fi
        pr_attempt="${pr_cache}.attempt"
        pr_attempt_age=999999
        if [ -f "$pr_attempt" ]; then
            pr_attempt_age=$(( $(date +%s) - $(date -r "$pr_attempt" +%s 2>/dev/null || echo 0) ))
        fi
        pr_lock="${pr_cache}.lock"
        if [ -d "$pr_lock" ]; then
            pr_lock_age=$(( $(date +%s) - $(date -r "$pr_lock" +%s 2>/dev/null || echo 0) ))
            [ "$pr_lock_age" -ge 60 ] && rmdir "$pr_lock" 2>/dev/null
        fi
        if [ "$pr_cache_age" -ge 60 ] && [ "$pr_attempt_age" -ge 60 ] && \
                mkdir "$pr_lock" 2>/dev/null; then
            : > "$pr_attempt"
            nohup env GIT_OPTIONAL_LOCKS=0 python3 -c '
import os, subprocess, sys
root, cache, lock = sys.argv[1:4]
try:
    try:
        result = subprocess.run(
            ["gh", "pr", "view", "--json", "number", "--jq", ".number"],
            cwd=root, capture_output=True, text=True, timeout=3, check=False)
        number = result.stdout.strip() if result.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        number = ""
    tmp = f"{cache}.{os.getpid()}"
    try:
        with open(tmp, "w") as handle:
            handle.write(number)
        os.replace(tmp, cache)
    except OSError:
        pass
finally:
    try:
        os.rmdir(lock)
    except OSError:
        pass
' "$git_root" "$pr_cache" "$pr_lock" \
                </dev/null >/dev/null 2>&1 &
        fi
    fi
fi

# Groundwork project indicator
gw_segment=""
gw_root="${git_root:-$cwd}"
if [ -f "${gw_root}/.groundwork.yml" ]; then
        gw_project=""
        gw_cwd_hash=$(printf '%s' "$cwd" | sha1_digest)
        gw_cwd_hash_key="cwd-${gw_cwd_hash:0:12}"

        # 1. Resolve pane key
        gw_pane_tty=""
        if [ -n "$TMUX_PANE" ]; then
            gw_pane_tty=$(tmux display-message -t "$TMUX_PANE" -p '#{pane_tty}' 2>/dev/null)
        fi
        if [ -z "$gw_pane_tty" ] || [ "$gw_pane_tty" = "?" ]; then
            gw_pane_tty=""
            _pid=$$
            while [ "$_pid" -gt 1 ]; do
                _raw=$(ps -o tty= -p "$_pid" 2>/dev/null | tr -d ' ')
                if [ -n "$_raw" ] && [ "$_raw" != "?" ]; then
                    gw_pane_tty="/dev/$_raw"
                    break
                fi
                _new_pid=$(ps -o ppid= -p "$_pid" 2>/dev/null | tr -d ' ')
                if [ -z "$_new_pid" ] || [ "$_new_pid" = "$_pid" ]; then
                    break
                fi
                _pid="$_new_pid"
            done
        fi

        if [ -n "$gw_pane_tty" ] && [ "$gw_pane_tty" != "?" ]; then
            gw_pane_key=$(echo "$gw_pane_tty" | sed 's|^/dev/||; s|/|_|g')
        else
            gw_pane_key="$gw_cwd_hash_key"
        fi

        # 2. Resolve main repo root
        gw_main_root="$gw_root"
        gw_common_dir=$(git -C "$cwd" rev-parse --git-common-dir 2>/dev/null)
        if [ -n "$gw_common_dir" ]; then
            case "$gw_common_dir" in
                /*) gw_abs_common="$gw_common_dir" ;;
                *)  gw_abs_common=$(cd "$cwd" 2>/dev/null && cd "$gw_common_dir" 2>/dev/null && pwd) ;;
            esac
            [ -n "$gw_abs_common" ] && gw_main_root=$(dirname "$gw_abs_common")
        fi

        # 3. Look up pane state — check both tty-derived and cwd-hash files,
        # pick the newer of the two. Handles the case where project-context.js
        # (sandboxed) wrote cwd-<hash> while the statusline would otherwise
        # resolve to pts_NN (or vice versa).
        gw_repo_slug=$(echo "$gw_main_root" | sed 's|/|_|g')
        gw_primary_file="$HOME/.claude/groundwork-state/panes/${gw_pane_key}__${gw_repo_slug}.json"
        gw_fallback_file="$HOME/.claude/groundwork-state/panes/${gw_cwd_hash_key}__${gw_repo_slug}.json"

        gw_chosen_file=""
        if [ "$gw_pane_key" = "$gw_cwd_hash_key" ]; then
            [ -f "$gw_primary_file" ] && gw_chosen_file="$gw_primary_file"
        elif [ -f "$gw_primary_file" ] && [ -f "$gw_fallback_file" ]; then
            ts_primary=$(jq -r '.timestamp // 0' "$gw_primary_file" 2>/dev/null)
            ts_fallback=$(jq -r '.timestamp // 0' "$gw_fallback_file" 2>/dev/null)
            if [ "${ts_fallback:-0}" -gt "${ts_primary:-0}" ]; then
                gw_chosen_file="$gw_fallback_file"
            else
                gw_chosen_file="$gw_primary_file"
            fi
        elif [ -f "$gw_primary_file" ]; then
            gw_chosen_file="$gw_primary_file"
        elif [ -f "$gw_fallback_file" ]; then
            gw_chosen_file="$gw_fallback_file"
        fi

        if [ -n "$gw_chosen_file" ]; then
            gw_project=$(jq -r '.project // empty' "$gw_chosen_file" 2>/dev/null)
        fi

        if [ -n "$gw_project" ]; then
            gw_project_selected=1
        else
            gw_project_selected=0
        fi
fi

# Context usage
format_tokens() {
    local n
    n=$(printf '%.0f' "$1")
    if [ "$n" -ge 1000000 ]; then
        printf '%sM' "$(( (n + 500000) / 1000000 ))"
    elif [ "$n" -ge 1000 ]; then
        printf '%sk' "$(( (n + 500) / 1000 ))"
    else
        printf '%s' "$n"
    fi
}
ctx_size_fmt=$(format_tokens "$ctx_size")
ctx_used_fmt=$(format_tokens "$ctx_used_abs")

BAR_WIDTH=10
FILLED_CHAR=$'\xe2\x96\x88'
EMPTY_CHAR=$'\xe2\x96\x91'
if [ -n "$used" ]; then
    used_int=$(printf "%.0f" "$used")
    filled=$(( used_int * BAR_WIDTH / 100 ))
    [ "$filled" -gt "$BAR_WIDTH" ] && filled=$BAR_WIDTH
    empty=$(( BAR_WIDTH - filled ))
    pct_str="${ctx_used_fmt}/${ctx_size_fmt} (${used_int}%)"
else
    filled=0
    empty=$BAR_WIDTH
    pct_str="--"
fi

bar_filled_part=""
bar_empty_part=""
i=0
while [ "$i" -lt "$filled" ]; do
    bar_filled_part="${bar_filled_part}${FILLED_CHAR}"
    i=$(( i + 1 ))
done
i=0
while [ "$i" -lt "$empty" ]; do
    bar_empty_part="${bar_empty_part}${EMPTY_CHAR}"
    i=$(( i + 1 ))
done

case "$cwd" in
    "$HOME"/*) cwd="~${cwd#"$HOME"}" ;;
    "$HOME")   cwd="~" ;;
esac

if [ -n "$used" ] && [ "$(printf "%.0f" "$used")" -ge 80 ]; then
    bar_color="\033[31m"
elif [ -n "$used" ] && [ "$(printf "%.0f" "$used")" -ge 50 ]; then
    bar_color="\033[33m"
else
    bar_color="\033[32m"
fi

# Anthropic usage API
USAGE_CACHE="$HOME/.claude/statusline-usage-cache.json"
USAGE_REFRESH_ATTEMPT="$HOME/.claude/statusline-usage-refresh.attempt"
USAGE_REFRESH_LOCK="$HOME/.claude/statusline-usage-refresh.lock"
session_util=""
weekly_util=""
session_resets_at=""
weekly_resets_at=""

refresh_usage_cache() {
    TOKEN=$(python3 -c "
import json, sys, subprocess, os
creds_json = None
creds_file = os.path.join(os.environ['HOME'], '.claude', '.credentials.json')
try:
    with open(creds_file) as f:
        creds_json = json.load(f)
except Exception:
    pass
if creds_json is None:
    try:
        raw = subprocess.check_output(
            ['security', 'find-generic-password', '-s', 'Claude Code-credentials', '-w'],
            stderr=subprocess.DEVNULL, text=True).strip()
        creds_json = json.loads(raw)
    except Exception:
        pass
if creds_json:
    print(creds_json['claudeAiOauth']['accessToken'])
else:
    sys.exit(1)
" 2>/dev/null) || return
    [ -n "$TOKEN" ] || return

    usage_json=$(printf 'Authorization: Bearer %s\nanthropic-beta: oauth-2025-04-20\n' "$TOKEN" | \
        curl -s --max-time 3 \
            "https://api.anthropic.com/api/oauth/usage" \
            -H @- 2>/dev/null) || return
    if printf '%s' "$usage_json" | jq -e '.five_hour.utilization != null' > /dev/null 2>&1; then
        cache_tmp="${USAGE_CACHE}.$$"
        printf '%s\n' "$usage_json" > "$cache_tmp" 2>/dev/null && mv "$cache_tmp" "$USAGE_CACHE"
    fi
}

run_usage_refresh() {
    trap 'rmdir "$USAGE_REFRESH_LOCK" 2>/dev/null' EXIT HUP INT TERM
    refresh_usage_cache
}

{
    usage_json=""
    cache_age=999999
    if [ -f "$USAGE_CACHE" ]; then
        usage_json=$(cat "$USAGE_CACHE")
        cache_age=$(( $(date +%s) - $(date -r "$USAGE_CACHE" +%s 2>/dev/null || echo 0) ))
    fi
    usage_attempt_age=999999
    if [ -f "$USAGE_REFRESH_ATTEMPT" ]; then
        usage_attempt_age=$(( $(date +%s) - $(date -r "$USAGE_REFRESH_ATTEMPT" +%s 2>/dev/null || echo 0) ))
    fi
    if [ -d "$USAGE_REFRESH_LOCK" ]; then
        usage_lock_age=$(( $(date +%s) - $(date -r "$USAGE_REFRESH_LOCK" +%s 2>/dev/null || echo 0) ))
        [ "$usage_lock_age" -ge 600 ] && rmdir "$USAGE_REFRESH_LOCK" 2>/dev/null
    fi
    if [ "$cache_age" -ge 300 ] && [ "$usage_attempt_age" -ge 300 ]; then
        mkdir -p "$HOME/.claude" 2>/dev/null
        if mkdir "$USAGE_REFRESH_LOCK" 2>/dev/null; then
            : > "$USAGE_REFRESH_ATTEMPT"
            export USAGE_CACHE USAGE_REFRESH_LOCK
            nohup bash -c "$(declare -f refresh_usage_cache); $(declare -f run_usage_refresh); run_usage_refresh" \
                </dev/null >/dev/null 2>&1 &
        fi
    fi

    if [ -n "$usage_json" ]; then
        parsed_usage=$(printf '%s' "$usage_json" | jq -r '
            [
                (.five_hour.utilization // ""),
                (.seven_day.utilization // ""),
                (.five_hour.resets_at // ""),
                (.seven_day.resets_at // "")
            ] | map(tostring | @sh) |
            "session_util=\(.[0])\nweekly_util=\(.[1])\nsession_resets_at=\(.[2])\nweekly_resets_at=\(.[3])"
        ' 2>/dev/null)
        eval "$parsed_usage"
        [ -n "$session_util" ] && session_util=$(printf "%.0f" "$session_util")
        [ -n "$weekly_util"  ] && weekly_util=$(printf  "%.0f" "$weekly_util")
    fi

    # The usage API intermittently returns a null resets_at while utilization is
    # still present. Persist the last non-null reset timestamps (per field) and
    # reuse them when the current response omits them, so the reset countdown
    # doesn't flicker away.
    RESET_CACHE="$HOME/.claude/statusline-reset-cache.json"
    prev_session_reset=""
    prev_weekly_reset=""
    if [ -f "$RESET_CACHE" ]; then
        prev_session_reset=$(jq -r '.session // empty' "$RESET_CACHE" 2>/dev/null)
        prev_weekly_reset=$(jq -r  '.weekly  // empty' "$RESET_CACHE" 2>/dev/null)
    fi
    [ -z "$session_resets_at" ] && session_resets_at="$prev_session_reset"
    [ -z "$weekly_resets_at"  ] && weekly_resets_at="$prev_weekly_reset"
    if [ -n "$session_resets_at" ] || [ -n "$weekly_resets_at" ]; then
        jq -n \
            --arg session "$session_resets_at" \
            --arg weekly "$weekly_resets_at" \
            '{session: $session, weekly: $weekly}' > "$RESET_CACHE" 2>/dev/null
    fi
} 2>/dev/null

format_reset_times() {
    python3 -c '
import re
import sys
from datetime import datetime, timezone, timedelta

session_reset, weekly_reset = sys.argv[1:3]
timestamp_pattern = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$"
)

def format_reset_time(resets_at, mode, now_dt):
    if len(resets_at) > 64 or timestamp_pattern.fullmatch(resets_at) is None:
        return ""
    try:
        reset_dt = datetime.fromisoformat(resets_at.replace("Z", "+00:00"))
        diff = max(0, int((reset_dt - now_dt).total_seconds()))

        if diff < 3600:
            mins = (diff + 59) // 60
            return f" ({mins}m)"
        if mode == "session" or diff < 86400:
            hrs = diff // 3600
            mins = (diff % 3600 + 59) // 60
            if mins == 60:
                mins = 0
                hrs += 1
            if mins > 0:
                return f" ({hrs}h {mins}m)"
            return f" ({hrs}h)"

        reset_local = reset_dt.astimezone()
        now_local = now_dt.astimezone()
        hr = reset_local.strftime("%I").lstrip("0") + reset_local.strftime("%p")
        if reset_local.date() == (now_local + timedelta(days=1)).date():
            return f" (Tomorrow {hr})"
        day_name = reset_local.strftime("%A")
        month_name = reset_local.strftime("%B")
        return f" ({day_name} {reset_local.day} {month_name} {hr})"
    except Exception:
        return ""

now = datetime.now(timezone.utc)
print(
    format_reset_time(session_reset, "session", now)
    + "\x1f"
    + format_reset_time(weekly_reset, "weekly", now),
    end="",
)
' "$session_resets_at" "$weekly_resets_at" 2>/dev/null
}

session_reset_str=""
weekly_reset_str=""
if [ -n "$session_resets_at" ] || [ -n "$weekly_resets_at" ]; then
    reset_strings=$(format_reset_times)
    IFS=$'\x1f' read -r session_reset_str weekly_reset_str <<< "$reset_strings"
fi

# Sanitize every externally sourced display field in one process. The unit
# separator cannot survive clean(), so it is safe as the assignment delimiter.
sanitized_text=$(jq -nr \
    --arg model "$model" \
    --arg effort "$effort" \
    --arg cwd "$cwd" \
    --arg repo "${git_repo:-}" \
    --arg branch "${git_branch:-}" \
    --arg pr "${git_pr:-}" \
    --arg project "${gw_project:-}" '
    def clean:
        explode
        | map(select(. >= 32 and . != 127 and (. < 128 or . > 159)))
        | implode;
    [$model, $effort, $cwd, $repo, $branch, $pr, $project]
    | map(clean)
    | join("\u001f")
' 2>/dev/null)
IFS=$'\x1f' read -r model effort cwd git_repo git_branch git_pr gw_project <<< "$sanitized_text"

# LINE 1
printf "\033[35m%s\033[0m \033[2m(%s)\033[0m" "${model}" "${effort}"
if [ -n "$speaker_symbol" ]; then
    printf "  %s" "${speaker_symbol}"
fi

# LINE 2
printf "\n"
printf "${bar_color}Context: %s\033[0m\033[2m%s\033[0m ${bar_color}%s\033[0m" \
    "${bar_filled_part}" "${bar_empty_part}" "${pct_str}"
if [ -n "$session_util" ]; then
    printf "\033[2m |\033[0m \033[36mSession: %s%%\033[2m%s\033[0m" "${session_util}" "${session_reset_str}"
fi
if [ -n "$weekly_util" ]; then
    printf "\033[2m |\033[0m \033[35mWeekly: %s%%\033[2m%s\033[0m" "${weekly_util}" "${weekly_reset_str}"
fi

# LINE 3
printf "\n"
printf "\033[01;34m%s\033[00m" "${cwd}"
if [ -n "$git_repo" ]; then
    printf " \033[2m(\033[0m\033[33m%s\033[0m\033[2m:\033[0m\033[96m%s\033[0m" \
        "$git_repo" "$git_branch"
    [ -n "$git_pr" ] && printf " \033[35m%s\033[0m" "$git_pr"
    printf "\033[2m)\033[0m"
fi
if [ "${gw_project_selected:-}" = "1" ]; then
    printf " \033[2m|\033[0m \033[32mProject: %s\033[0m" "$gw_project"
elif [ "${gw_project_selected:-}" = "0" ]; then
    printf " \033[2m|\033[0m \033[2mNo Project Selected\033[0m"
fi
