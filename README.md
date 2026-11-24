# Groundwork for ZCode

This repository branch is a generated ZCode marketplace (v3.12.0). Do not
edit it by hand — it is rebuilt by `build-zcode-marketplace.sh` in the
[main repository](https://github.com/etr/groundwork).

## Install

1. In ZCode: **Settings → Plugin Management → Discover → `+`**
2. Add the marketplace: `etr/groundwork#zcode-marketplace`
3. Install **Groundwork** (39 skills, 18 agents)

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

## Attribution

This plugin has sourced learnings and code from multiple sources:

### Superpowers
- **[superpowers](https://github.com/obra/superpowers)** by Jesse Vincent
  - The `using-groundwork` skill is based on the [using-superpowers skill](https://github.com/obra/superpowers/blob/main/skills/executing-plans/SKILL.md)
  - The general plugin structure and patterns were learned from studying this project

### Official Claude Plugins
- **[claude-plugins-official](https://github.com/anthropics/claude-plugins-official)** by Anthropic
  - claude-md-management plugin

### Impeccable
- **[impeccable](https://github.com/pbakaus/impeccable)** by Paul Bakaus ([impeccable.style](https://impeccable.style))
  - License: Apache 2.0 (itself based on Anthropic's [frontend-design skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design))
  - The design system skill's reference guides for color & contrast, interaction design, motion design, spatial design, typography, and UX writing are adapted from Impeccable's domain-specific reference files
  - The design consistency checker agent's interaction quality, UX writing quality, and expanded accessibility checks are derived from these references

### Clean Code summary
- **[Summary of *Clean Code* by Robert C. Martin](https://gist.github.com/wojteklu/73c6914cc446146b8b533c0988cf8d29)** by Wojtek Lu, summarizing Robert C. Martin's *Clean Code* (Prentice Hall, 2008)
  - The clean-code principles reference (`references/clean-code-principles.md`) follows its structure and wording; the comment-slop rules and the pointer to the testing checklist are this project's own

### Research Methodology
- **[get-shit-done](https://github.com/glittercowboy/get-shit-done)** by glittercowboy
  - The researcher agent's "Training as Hypothesis" guidance is adapted from this project's research methodology

### Skills for Real Engineers
- **[mattpocock/skills](https://github.com/mattpocock/skills)** by Matt Pocock
  - License: MIT, Copyright (c) 2026 Matt Pocock — notice under [Third-party MIT notices](#third-party-mit-notices)
  - The interview protocol in `understanding-feature-requests` is adapted from its `grilling` skill
  - The `retro` and `improve-codebase-architecture` skills are adapted from the skills of the same names, and the deep-module vocabulary from `codebase-design`
  - In `debug`, the reproduction-loop menu, ranked hypotheses, and instrumentation tagging are adapted from `diagnosing-bugs`; the tautological-test rubric is adapted from `tdd`
  - The pull-request body shape in `finalize-task` follows its `pr` skill
  - The skill-authoring guidance in `docs/developing-skills.md` draws on its `writing-for-agents` skill

### HumanLayer
- **[humanlayer/skills](https://github.com/humanlayer/skills)** by HumanLayer
  - License: MIT, Copyright (c) 2026 HumanLayer — notice under [Third-party MIT notices](#third-party-mit-notices)
  - The summary-as-visual, before/after evidence, and merge-danger shape of the pull-request body in `finalize-task` originates with its `show-me` skill (by Dex Horthy)

### Third-party MIT notices

The portions adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (Copyright (c) 2026 Matt Pocock) and [humanlayer/skills](https://github.com/humanlayer/skills) (Copyright (c) 2026 HumanLayer) are used under the MIT License:

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files, to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
