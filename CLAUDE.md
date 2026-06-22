# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Groundwork is a Claude Code plugin that provides a skills library for structured development workflows. It contains 40 skills spanning the full lifecycle — discovery, domain modeling, architecture, planning, TDD, debugging, validation, and shipping. Every capability is a skill; there is no separate commands layer (skills are both user-invocable via `/groundwork:<name>` and, where appropriate, model-invocable).

The `using-groundwork` skill is the **lifecycle router**: it maps work → skill across every phase and is the only way the model can surface user-only leaves (which are invisible to it at call time). When authoring or editing a skill, see `docs/developing-skills.md` (contributor guide: anatomy, frontmatter, tier selection, authoring discipline, progressive disclosure).

## Project Structure

This is a **Claude Code plugin**, not a traditional software project. There is no build step for Claude Code use. A separate installer (`install-skills.sh`) *exports* the skills to other AI coding harnesses (see "Multi-target installation" below).

```
groundwork/
├── .claude-plugin/plugin.json  # Plugin manifest
├── skills/                     # Markdown-based workflow skills (SKILL.md files) — the only entry-point layer
├── agents/                     # Subagent definitions (AGENT.md files)
├── hooks/                      # Event-driven automation (SessionStart, PostToolUse, SubagentStop, PreCompact)
├── lib/                        # JavaScript utilities (+ co-located *.test.js)
├── references/                 # Runtime reference files loaded by skills/agents
│   ├── checklists/             # Shared checklists read by BOTH a producer skill and a reviewer agent (testing: test-driven-development ↔ test-quality-reviewer; accessibility: ux-design ↔ design-consistency-checker)
│   └── engineering-principles.md  # Named-principle vocabulary (deep modules, Hyrum's Law, Chesterton's Fence, …)
├── tests/                      # Node test suites; run via tests/run-tests.sh
├── docs/                       # User-facing documentation
├── install-skills.sh           # Multi-target export installer (Codex, OpenCode, Kiro, Pi)
├── install-config.txt          # Export exceptions (drops + renames); fail-closed by default
└── pi-extension/               # Pre-built TypeScript extension copied into Pi installs
```

## Component Formats

### Skills (`skills/<name>/SKILL.md`)
```markdown
---
name: skill-name
description: Use when [condition] - [what it does]
requires: optional-skill-1, optional-skill-2   # optional skill dependencies
argument-hint: "[optional-args]"               # optional, shown in slash autocomplete
allowed-tools: Bash(specific:*), Grep, Read    # optional, pre-approves tools
disable-model-invocation: true                 # optional, see invocation table below
user-invocable: false                          # optional, see invocation table below
---
[Skill content in markdown]
```

The optional `requires` field declares skill dependencies. These are validated by `lib/validate-plugin.js`.

#### Invocation control

Skills replaced the old commands layer. Three tiers, set via frontmatter:

| Tier | `user-invocable` | `disable-model-invocation` | User slash | Model auto | Callable by other skills | Examples |
|------|:--:|:--:|:--:|:--:|:--:|----------|
| **User workflow** (leaf) | (default) | `true` | ✅ | ❌ | ❌ | `design-product`, `create-tasks`, `review-pr` |
| **Chain / dual** | (default) | (default) | ✅ | ✅ | ✅ | `debug`, `work-on`, `plan-task`, `validate` |
| **Hidden library** | `false` | (default) | ❌ | ✅ | ✅ | `test-driven-development`, `use-git-worktree` |

> **Important:** `disable-model-invocation: true` also blocks programmatic `Skill()` calls from
> other skills. Never put it on a skill that appears in another skill's orchestration chain.

## Development Workflow

### Testing Changes Locally

1. Symlink or copy the plugin to `~/.claude/plugins/groundwork`
2. Restart Claude Code or run `/init` to reload
3. Test skills via the `Skill` tool or slash commands

### Adding a New Skill

1. Create `skills/<skill-name>/SKILL.md`
2. Add YAML frontmatter with `name` and `description`; set the invocation tier (see table above)
3. Write the skill content following existing patterns
4. Test with `/groundwork:<skill-name>` or the Skill tool

### Running Tests

```
bash tests/run-tests.sh
```

Runs every `tests/*.test.js` suite (plain Node `assert`, no dependencies). `tests/install-config.test.js` guards the export installer: skills↔config parity and zero Claude-Code-only leakage in generated output.

### Hook Events

The plugin uses these hook events (see `hooks/hooks.json`):
- **SessionStart** (`session-start.sh`): Loads skill context, checks for updates, detects project state
- **PostToolUse** (`check-commit-alignment.sh`, `resolve-template-vars.js`): Validates commit/spec alignment; resolves `{{template}}` vars
- **SubagentStop** (`validate-agent-output.sh`): Validates agent output format
- **PreCompact** (`pre-compact.sh`): Preserves skill state before context compaction

## Key Architectural Patterns

### Skill Shadowing
Personal skills in `~/.claude/skills/` override plugin skills with the same name. Use `groundwork:skill-name` prefix to force the plugin version.

### Frontmatter Parsing
`lib/skills-core.js` extracts YAML frontmatter from SKILL.md files. The frontmatter must be at the start of the file, delimited by `---`.

### Hooks Configuration
Hooks are defined in `hooks/hooks.json` and use `${CLAUDE_PLUGIN_ROOT}` for portable paths.

### Library Utilities

| File | Purpose |
|------|---------|
| `lib/skills-core.js` | Skill discovery, frontmatter parsing, path resolution |
| `lib/frontmatter.js` | YAML frontmatter parsing utilities |
| `lib/validate-plugin.js` | Plugin validation (frontmatter, references, permissions) |
| `lib/check-updates.js` | Git-based update checking (throttled to 1x/day) |
| `lib/project-context.js` | Active-project resolution (monorepo `.groundwork.yml`) |
| `lib/detect-project-state.js` | Detects specs/monorepo structure at SessionStart |
| `lib/spec-router.js`, `lib/specs-io.js` | Locate and read spec/architecture/task files |
| `lib/inject-specs.js` | Extracts features/NFRs/decisions from specs into context |
| `lib/resolve-template-vars.js` | Resolves `{{specs_dir}}` etc. in skill bodies (PostToolUse) |
| `lib/persist-project.js`, `lib/persist-unworked-findings.js` | Persist per-pane project + validation state |
| `lib/transform-agents.js` | Rewrites `Agent()` calls when exporting skills to other harnesses |
| `lib/utils.js` | Shared helpers |

## Multi-target installation

`install-skills.sh` exports the skills/agents to non-Claude harnesses (`--codex`, `--opencode`, `--kiro`, `--pi`; `--claude-code` recommends the marketplace). It is **fail-closed**: every skill in `skills/` is exported as `groundwork-<name>` automatically — `install-config.txt` lists only exceptions (`<name> = drop` or `<name> = <other-name>`), so a new skill can never be silently omitted.

During export it rewrites Claude-specific constructs to harness-neutral prose: `Skill(...)`/`Agent(...)` calls (via `lib/transform-agents.js`), `${CLAUDE_PLUGIN_ROOT}`, `/groundwork:` slash hints, tool names (Pi). Agents have no native equivalent on most targets, so they install as `review-`prefixed skills (Codex/Pi), standalone agent files (OpenCode), or JSON+prompt pairs (Kiro); Pi additionally gets `pi-extension/`. The script targets **bash 3.2 + BSD sed** (stock macOS) — avoid bash-4-only features (associative arrays, `mapfile`) and `;`-joined sed programs. `tests/install-config.test.js` enforces parity and no-leakage; run it after touching the installer or adding skills.

## External Dependencies

- `git` - Repository operations
- `gh` - GitHub CLI for PR workflows
- `node` - JavaScript runtime (for hooks, lib, and the export installer's transforms)
- `bash` (3.2+) - Hook and installer scripts
