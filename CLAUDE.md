# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Groundwork is a Claude Code plugin that provides a skills library for structured development workflows. It contains 10 skills and 13 commands for planning, TDD, debugging, and synchronization.

## Project Structure

This is a **Claude Code plugin**, not a traditional software project. No build step is required.

```
groundwork/
├── .claude-plugin/plugin.json  # Plugin manifest
├── skills/                     # Markdown-based workflow skills (SKILL.md files)
├── commands/                   # User-invoked slash commands
├── hooks/                      # Event-driven automation (SessionStart, PreCompact)
├── lib/                        # JavaScript utilities
└── docs/                       # Documentation templates
```

## Component Formats

### Skills (`skills/<name>/SKILL.md`)
```markdown
---
name: skill-name
description: Use when [condition] - [what it does]
requires: optional-skill-1, optional-skill-2
---
[Skill content in markdown]
```

The optional `requires` field declares skill dependencies. These are validated by `lib/validate-plugin.js`.

### Commands (`commands/<name>.md`)
```markdown
---
allowed-tools: Bash(specific:*), Grep, Read
argument-hint: "[optional-args]"
---
[Command implementation]
```

## Development Workflow

### Testing Changes Locally

1. Symlink or copy the plugin to `~/.claude/plugins/groundwork`
2. Restart Claude Code or run `/init` to reload
3. Test skills via the `Skill` tool or slash commands

### Adding a New Skill

1. Create `skills/<skill-name>/SKILL.md`
2. Add YAML frontmatter with `name` and `description`
3. Write the skill content following existing patterns
4. Test with `/skill-name` or the Skill tool

### Hook Events

The plugin uses these hook events:
- **SessionStart**: Loads skill context, checks for updates, detects project state
- **PreCompact**: Preserves skill state before context compaction

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
| `lib/validate-plugin.js` | Plugin validation (frontmatter, references, permissions) |
| `lib/check-updates.js` | Git-based update checking (throttled to 1x/day) |
| `lib/frontmatter.js` | YAML frontmatter parsing utilities |

## External Dependencies

- `git` - Repository operations
- `gh` - GitHub CLI for PR workflows
- `node` - JavaScript runtime (for hooks and lib)
