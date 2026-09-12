# Groundwork for ZCode

This repository branch is a generated ZCode marketplace (v3.5.0). Do not
edit it by hand — it is rebuilt by `build-zcode-marketplace.sh` in the
[main repository](https://github.com/etr/groundwork).

## Install

1. In ZCode: **Settings → Plugin Management → Discover → `+`**
2. Add the marketplace: `etr/groundwork#zcode-marketplace`
3. Install **Groundwork** (37 skills, 18 agents)

Skills are invoked as `groundwork-<name>` (bare) or
`groundwork:groundwork-<name>` (qualified); agents as `<name>` or
`groundwork:<name>`.

## Differences from the Claude Code plugin

- Model recommendations use the GLM family (GLM at max reasoning, GLM-Flash)
  and refer to the model picker/settings — ZCode has no `/model` or
  `/effort` commands.
- Agents ship natively (`agents/*.md`); review agents no longer require the
  review-* skill shim of the file-based export.
- Hooks: ZCode supports exactly seven hook events, so the plugin ships
  SessionStart and PostToolUse hooks only. The Claude Code plugin's
  SubagentStop (agent output validation) and PreCompact (state preservation)
  hooks have no ZCode equivalent and are omitted.
- Update/uninstall are managed by ZCode's plugin system; re-check for updates
  after the `zcode-marketplace` branch moves.
