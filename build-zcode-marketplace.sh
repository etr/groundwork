#!/usr/bin/env bash
set -euo pipefail

# Build the ZCode marketplace bundle for Groundwork.
#
# Runs the translated ZCode export (install-skills.sh --zcode-plugin: GLM
# model wording, native agents/*.md, per-skill references) and packages it as
# a self-contained marketplace whose plugin root IS the marketplace root:
#
#   marketplace.json          — marketplace manifest (plugin source: "./")
#   .zcode-plugin/plugin.json — plugin manifest (name: groundwork)
#   skills/, agents/, hooks/, lib/
#
# The output is committed to the orphan `zcode-marketplace` branch of
# etr/groundwork (see the push snippet at the end of this script). ZCode
# users install it with:
#
#   Settings -> Plugin Management -> Discover -> "+" ->
#     etr/groundwork#zcode-marketplace
#
# Usage: build-zcode-marketplace.sh [output-dir]   (default: dist/zcode-marketplace)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-$SCRIPT_DIR/dist/zcode-marketplace}"
MARKER=".zcode-plugin/plugin.json"

if [[ -e "$OUT_DIR" && ! -f "$OUT_DIR/$MARKER" ]]; then
    echo "Error: $OUT_DIR exists and is not a previously built bundle (missing $MARKER)." >&2
    echo "       Remove it first or pass a fresh directory." >&2
    exit 1
fi
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# --- 1. Run the translated export into a staging directory -----------------

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "Running zcode-plugin export..."
(
    cd "$STAGE"
    bash "$SCRIPT_DIR/install-skills.sh" --zcode-plugin --project --force \
        --source "$SCRIPT_DIR"
) >/dev/null

cp -R "$STAGE/.zcode/skills" "$OUT_DIR/skills"
if [[ -d "$STAGE/.zcode/agents" ]]; then
    cp -R "$STAGE/.zcode/agents" "$OUT_DIR/agents"
fi

# --- 2. Hooks: keep only the events ZCode supports --------------------------

mkdir -p "$OUT_DIR/hooks" "$OUT_DIR/lib"
node "$SCRIPT_DIR/lib/filter-zcode-hooks.js" "$SCRIPT_DIR/hooks/hooks.json" \
    > "$OUT_DIR/hooks/hooks.json"

# Copy the hook scripts the filtered hooks.json references. ${CLAUDE_PLUGIN_ROOT}
# expands inside ZCode plugin hooks, so the commands work as-is.
hook_scripts=$(sed -n 's|.*\${CLAUDE_PLUGIN_ROOT}/\(hooks/[A-Za-z0-9._-]*\).*|\1|p' \
    "$OUT_DIR/hooks/hooks.json" | sort -u)
if [[ -z "$hook_scripts" ]]; then
    echo "Error: filtered hooks.json references no hook scripts" >&2
    exit 1
fi
while IFS= read -r script; do
    [[ -z "$script" ]] && continue
    if [[ ! -f "$SCRIPT_DIR/$script" ]]; then
        echo "Error: hook script not found: $script" >&2
        exit 1
    fi
    cp "$SCRIPT_DIR/$script" "$OUT_DIR/$script"
done <<< "$hook_scripts"

# lib/ is referenced both by hook commands (resolve-template-vars.js) and by
# the hook scripts themselves (session-start.sh resolves PLUGIN_ROOT/lib/...).
for f in "$SCRIPT_DIR"/lib/*.js; do
    [[ "$f" == *.test.js ]] && continue
    cp "$f" "$OUT_DIR/lib/"
done

# --- 3. Manifests ------------------------------------------------------------

VERSION=$(node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  process.stdout.write(String(m.version || "0.0.0"));
' "$SCRIPT_DIR/.claude-plugin/plugin.json")

mkdir -p "$OUT_DIR/.zcode-plugin"
cat > "$OUT_DIR/.zcode-plugin/plugin.json" <<EOF
{
  "name": "groundwork",
  "version": "$VERSION",
  "description": "Groundwork skills library for ZCode: discovery, domain modeling, architecture, planning, TDD, debugging, validation, and shipping workflows — translated for GLM models, with native review agents.",
  "author": {
    "name": "Groundwork Contributors"
  },
  "license": "MIT",
  "homepage": "https://github.com/etr/groundwork",
  "repository": "https://github.com/etr/groundwork",
  "skills": "skills"
}
EOF

cat > "$OUT_DIR/marketplace.json" <<EOF
{
  "name": "groundwork-zcode",
  "plugins": [
    {
      "name": "groundwork",
      "version": "$VERSION",
      "displayName": "Groundwork",
      "description": "Groundwork skills library translated for ZCode: GLM model wording, native agents, marketplace-managed updates.",
      "source": "./"
    }
  ]
}
EOF

# --- 4. README ----------------------------------------------------------------

SKILL_COUNT=$(find "$OUT_DIR/skills" -name SKILL.md | wc -l | tr -d ' ')
AGENT_COUNT=$(find "$OUT_DIR/agents" -name '*.md' 2>/dev/null | wc -l | tr -d ' ')

cat > "$OUT_DIR/README.md" <<EOF
# Groundwork for ZCode

This repository branch is a generated ZCode marketplace (v$VERSION). Do not
edit it by hand — it is rebuilt by \`build-zcode-marketplace.sh\` in the
[main repository](https://github.com/etr/groundwork).

## Install

1. In ZCode: **Settings → Plugin Management → Discover → \`+\`**
2. Add the marketplace: \`etr/groundwork#zcode-marketplace\`
3. Install **Groundwork** ($SKILL_COUNT skills, $AGENT_COUNT agents)

Skills are invoked as \`groundwork-<name>\` (bare) or
\`groundwork:groundwork-<name>\` (qualified); agents as \`<name>\` or
\`groundwork:<name>\`.

## Differences from the Claude Code plugin

- Model recommendations use the GLM family (GLM at max reasoning, GLM-Flash)
  and refer to the model picker/settings — ZCode has no \`/model\` or
  \`/effort\` commands.
- Agents ship natively (\`agents/*.md\`); review agents no longer require the
  review-* skill shim of the file-based export.
- Hooks: ZCode supports exactly seven hook events, so the plugin ships
  SessionStart and PostToolUse hooks only. The Claude Code plugin's
  SubagentStop (agent output validation) and PreCompact (state preservation)
  hooks have no ZCode equivalent and are omitted.
- Update/uninstall are managed by ZCode's plugin system; re-check for updates
  after the \`zcode-marketplace\` branch moves.
EOF

# --- 5. Fail-closed sanity checks ---------------------------------------------

if grep -rqE '\b(Opus|Sonnet|Haiku|Fable)\b|opus\[1m\]|/effort high|/model (sonnet|opus)' "$OUT_DIR"; then
    echo "Error: Claude model names or commands leaked into the bundle:" >&2
    grep -rlE '\b(Opus|Sonnet|Haiku|Fable)\b|opus\[1m\]|/effort high|/model (sonnet|opus)' "$OUT_DIR" >&2
    exit 1
fi

if grep -q 'SubagentStop\|PreCompact' "$OUT_DIR/hooks/hooks.json"; then
    echo "Error: unsupported hook events survived filtering" >&2
    exit 1
fi

if [[ "$SKILL_COUNT" -eq 0 || "$AGENT_COUNT" -eq 0 ]]; then
    echo "Error: bundle is empty (skills=$SKILL_COUNT agents=$AGENT_COUNT)" >&2
    exit 1
fi

echo ""
echo "Bundle built at $OUT_DIR"
echo "  Skills: $SKILL_COUNT"
echo "  Agents: $AGENT_COUNT"
echo "  Version: $VERSION"
echo ""
echo "To publish (orphan branch, generated content only):"
echo "  W=\"\$(mktemp -d)/wt\""
echo "  git worktree add --detach \"\$W\" HEAD"
echo "  cd \"\$W\" && git checkout --orphan zcode-marketplace && git rm -rf ."
echo "  cp -R <bundle>/. . && git add -A"
echo "  git commit -m 'zcode marketplace: v$VERSION'"
echo "  git push -f origin zcode-marketplace"
