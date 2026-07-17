#!/usr/bin/env bash
input=$(cat)
cwd=$(echo "$input" | jq -r '.cwd')

# -- Bells-and-whistles mute indicator ----------------------------------------
speaker_symbol=""
BNW_INSTALL_PATH=$(python3 - <<'PYEOF' 2>/dev/null
import json, sys, os
try:
    data = json.load(open(os.path.join(os.environ['HOME'], '.claude/plugins/installed_plugins.json')))
    plugins = data.get('plugins', {})
    for key, entries in plugins.items():
        if 'bells-and-whistles' in key:
            if entries and isinstance(entries, list):
                print(entries[0].get('installPath', ''))
            sys.exit(0)
except Exception:
    pass
PYEOF
)

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

# Model display name and effort level
model=$(echo "$input" | jq -r '.model.display_name // .model.id // "unknown"')
effort=$(jq -r '.effortLevel // "default"' ~/.claude/settings.json 2>/dev/null)

# Git info
git_info=""
if git -C "$cwd" rev-parse --git-dir > /dev/null 2>&1; then
    git_root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)
    git_repo=$(basename "$git_root")
    git_branch=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null || git -C "$cwd" rev-parse --short HEAD 2>/dev/null)

    git_pr=""
    if command -v gh > /dev/null 2>&1; then
        pr_num=$(GIT_OPTIONAL_LOCKS=0 gh pr view --json number --jq '.number' 2>/dev/null)
        [ -n "$pr_num" ] && git_pr="#${pr_num}"
    fi

    if [ -n "$git_pr" ]; then
        git_info=" \033[2m(\033[0m\033[33m${git_repo}\033[0m\033[2m:\033[0m\033[96m${git_branch}\033[0m \033[35m${git_pr}\033[0m\033[2m)\033[0m"
    else
        git_info=" \033[2m(\033[0m\033[33m${git_repo}\033[0m\033[2m:\033[0m\033[96m${git_branch}\033[0m\033[2m)\033[0m"
    fi
fi

# Groundwork project indicator
gw_segment=""
gw_root="${git_root:-$cwd}"
if [ -d "$HOME/.claude/plugins/cache/groundwork-marketplace" ]; then
    if [ -f "${gw_root}/.groundwork.yml" ]; then
        gw_project=""

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
            gw_pane_key="cwd-$(printf '%s' "$cwd" | sha1sum | awk '{print substr($1,1,12)}')"
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
        gw_cwd_hash_key="cwd-$(printf '%s' "$cwd" | sha1sum | awk '{print substr($1,1,12)}')"
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
            gw_segment=" \033[2m|\033[0m \033[32mProject: ${gw_project}\033[0m"
        else
            gw_segment=" \033[2m|\033[0m \033[2mNo Project Selected\033[0m"
        fi
    fi
fi

# Context usage
used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
ctx_size=$(echo "$input" | jq -r '.context_window.context_window_size // 0')

format_tokens() {
    local n=$1
    if [ "$n" -ge 1000000 ]; then
        awk "BEGIN { printf \"%.0fM\", $n/1000000 }"
    elif [ "$n" -ge 1000 ]; then
        awk "BEGIN { printf \"%.0fk\", $n/1000 }"
    else
        echo "$n"
    fi
}
ctx_size_fmt=$(format_tokens "$ctx_size")

ctx_used_abs=$(echo "$input" | jq -r '
    if .context_window.current_usage != null then
        (.context_window.current_usage.input_tokens
         + .context_window.current_usage.cache_creation_input_tokens
         + .context_window.current_usage.cache_read_input_tokens)
    else 0 end')
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
for i in $(seq 1 "$filled"); do bar_filled_part="${bar_filled_part}${FILLED_CHAR}"; done
for i in $(seq 1 "$empty");  do bar_empty_part="${bar_empty_part}${EMPTY_CHAR}";   done

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
session_util=""
weekly_util=""
{
    use_cache=0
    if [ -f "$USAGE_CACHE" ]; then
        cache_age=$(( $(date +%s) - $(date -r "$USAGE_CACHE" +%s 2>/dev/null || echo 0) ))
        [ "$cache_age" -lt 300 ] && use_cache=1
    fi

    if [ "$use_cache" -eq 1 ]; then
        usage_json=$(cat "$USAGE_CACHE")
    else
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
" 2>/dev/null)
        if [ -n "$TOKEN" ]; then
            usage_json=$(curl -s --max-time 5 \
                "https://api.anthropic.com/api/oauth/usage" \
                -H "Authorization: Bearer $TOKEN" \
                -H "anthropic-beta: oauth-2025-04-20" 2>/dev/null)
            # Only cache a response with real (non-null) utilization. A null
            # response means "no data right now" — don't overwrite the cache,
            # so the previous good value is kept and reused below.
            if echo "$usage_json" | jq -e '.five_hour.utilization != null' > /dev/null 2>&1; then
                echo "$usage_json" > "$USAGE_CACHE" 2>/dev/null
            else
                usage_json=""
            fi
        fi
        # If the refresh failed (no token, timeout, null/invalid JSON), fall back
        # to the last cached response even if stale, so the usage segment doesn't
        # blink out on a transient error.
        if [ -z "$usage_json" ] && [ -f "$USAGE_CACHE" ]; then
            usage_json=$(cat "$USAGE_CACHE")
        fi
    fi

    if [ -n "$usage_json" ]; then
        session_util=$(echo "$usage_json" | jq -r '.five_hour.utilization // empty' 2>/dev/null)
        weekly_util=$(echo  "$usage_json" | jq -r '.seven_day.utilization  // empty' 2>/dev/null)
        session_resets_at=$(echo "$usage_json" | jq -r '.five_hour.resets_at // empty' 2>/dev/null)
        weekly_resets_at=$(echo "$usage_json" | jq -r '.seven_day.resets_at // empty' 2>/dev/null)
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
        printf '{"session":"%s","weekly":"%s"}\n' \
            "$session_resets_at" "$weekly_resets_at" > "$RESET_CACHE" 2>/dev/null
    fi
} 2>/dev/null

format_reset_time() {
    local resets_at="$1" mode="$2"
    python3 -c "
import sys
from datetime import datetime, timezone, timedelta

resets_at = '$resets_at'
mode = '$mode'

try:
    ra = resets_at.replace('Z', '+00:00')
    reset_dt = datetime.fromisoformat(ra)
    now_dt = datetime.now(timezone.utc)
    diff = int((reset_dt - now_dt).total_seconds())
    if diff < 0:
        diff = 0

    if diff < 3600:
        mins = (diff + 59) // 60
        print(f' ({mins}m)')
    elif mode == 'session' or diff < 86400:
        hrs = diff // 3600
        mins = (diff % 3600 + 59) // 60
        if mins == 60:
            mins = 0
            hrs += 1
        if mins > 0:
            print(f' ({hrs}h {mins}m)')
        else:
            print(f' ({hrs}h)')
    else:
        reset_local = reset_dt.astimezone()
        now_local = now_dt.astimezone()
        tomorrow = (now_local + timedelta(days=1)).date()
        reset_date = reset_local.date()
        hr = reset_local.strftime('%I').lstrip('0') + reset_local.strftime('%p')
        if reset_date == tomorrow:
            print(f' (Tomorrow {hr})')
        else:
            day_name = reset_local.strftime('%A')
            day_num = reset_local.day
            month_name = reset_local.strftime('%B')
            print(f' ({day_name} {day_num} {month_name} {hr})')
except Exception:
    pass
" 2>/dev/null
}

session_reset_str=""
weekly_reset_str=""
[ -n "$session_resets_at" ] && session_reset_str=$(format_reset_time "$session_resets_at" "session")
[ -n "$weekly_resets_at" ]  && weekly_reset_str=$(format_reset_time "$weekly_resets_at" "weekly")

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
printf "%b" "${git_info}"
printf "%b" "${gw_segment}"
