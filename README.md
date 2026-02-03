# Groundwork

A comprehensive skills library for Claude Code, consolidating proven techniques for planning, design, TDD, debugging, collaboration, and problem-solving.

## Installation

### Via Marketplace

First, add the Groundwork marketplace:

```bash
claude plugin marketplace add https://github.com/etr/groundwork-marketplace
```

Then install the plugin:

```bash
claude plugin add groundwork
```

### Direct Installation

```bash
claude plugin add https://github.com/etr/groundwork
```

### Manual Installation

```bash
cd ~/.claude/plugins
git clone https://github.com/etr/groundwork.git
```

### Verify Installation

Restart Claude Code or start a new session. You should see:
- "You have groundwork skills" message on session start
- `/skills` command available

Run `/groundwork-check` to validate the plugin installation.

## Dependencies

- **Required**: `node`, `python3`
- **Optional**: `gh` (GitHub CLI for PR commands)

### Windows Users

Groundwork requires a Unix-like shell environment. Windows users should use one of:

- **WSL (Windows Subsystem for Linux)** - Recommended
- **Git Bash** - Included with Git for Windows

The plugin's shell scripts (`.sh` files) use bash and won't work directly in PowerShell or CMD.

**Troubleshooting Windows:**

| Issue | Solution |
|-------|----------|
| "bash not found" | Install Git Bash or WSL |
| Hook scripts fail | Run Claude Code from WSL/Git Bash terminal |
| Path errors | Use forward slashes in paths, not backslashes |
| Line ending issues | Configure git: `git config --global core.autocrlf input` |

## Quick Start

### Planning a New Project

```
/product-design    # Define requirements (PRD)
/design-architecture      # Design technical approach
/create-tasks             # Generate implementation tasks
/work-on-next-task        # Start working on first task
```

### Development Workflow

```
/task 4            # Work on specific task
/code-review       # Review code changes
```

## Skills Overview

### Planning & Design (4 skills)
| Skill | Description |
|-------|-------------|
| `understanding-feature-requests` | Clarify feature requests and check for contradictions |
| `product-design` | Create product requirements documents (PRDs) |
| `architecture` | Create architecture design documents with decisions |
| `tasks` | Generate implementation tasks from architecture |

### Implementation (2 skills)
| Skill | Description |
|-------|-------------|
| `next-task` | Execute next uncompleted task from specs |
| `build-unplanned-feature` | Build ad-hoc features with worktree isolation and TDD |

### Testing & Debugging (1 skill)
| Skill | Description |
|-------|-------------|
| `test-driven-development` | Red-Green-Refactor with 80%+ coverage |

### Maintenance (4 skills)
| Skill | Description |
|-------|-------------|
| `sync-specs` | Synchronize PRD with codebase changes |
| `sync-architecture` | Synchronize architecture docs with codebase |
| `check-alignment` | Verify implementation aligns with specs |
| `verify` | Quick verification checkpoint before completing tasks |

### Meta (1 skill)
| Skill | Description |
|-------|-------------|
| `using-groundwork` | Introduction to using skills |

## Commands

| Command | Description |
|---------|-------------|
| `/groundwork:product-design` | Create PRD |
| `/groundwork:design-architecture` | Create architecture document |
| `/groundwork:create-tasks` | Generate tasks from architecture |
| `/groundwork:source-product-specs-from-code` | Sync PRD with codebase |
| `/groundwork:source-architecture-from-code` | Sync architecture with codebase |
| `/groundwork:code-review` | Quick single-PR code review |
| `/groundwork:revise-claude-md` | Update CLAUDE.md with learnings |
| `/groundwork:check-specs-alignment` | Verify alignment between code and specs |
| `/groundwork:verify-executed-work` | Quick verification checkpoint for current work |
| `/groundwork:work-on-next-task` | Execute next uncompleted task |
| `/groundwork:work-on` | Work on a specific task by number |
| `/groundwork:build-unplanned` | Build feature from description with worktree isolation and TDD |
| `/groundwork:skills` | List all available skills |
| `/groundwork:groundwork-check` | Validate plugin installation |
| `/groundwork:groundwork-help` | List all commands and skills with descriptions |
| `/groundwork:split-spec` | Split single-file spec into directory structure |

## Configuration

### Hooks (Automatic)

The plugin registers these hooks automatically via `hooks/hooks.json`:

- **SessionStart** - Loads skill context, detects project state, checks for updates
- **PreCompact** - Preserves skill state before context compaction

### Update Checking

The plugin checks for updates once per day (throttled) and shows a notification if updates are available. Update by running:
```bash
cd ~/.claude/plugins/groundwork && git pull
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GROUNDWORK_SKIP_UPDATE_CHECK` | 0 | Set to 1 to skip update checking |

See `docs/hooks-configuration.md` for full documentation.

## Attribution

This plugin consolidates work from multiple sources:

### Superpowers
- **[superpowers](https://github.com/obra/superpowers)** by Jesse Vincent
  - The `using-groundwork` skill is based on the [using-superpowers skill](https://github.com/obra/superpowers/blob/main/skills/executing-plans/SKILL.md)
  - The general plugin structure and patterns were learned from studying this project

### Official Claude Plugins
- **[claude-plugins-official](https://github.com/anthropics/claude-plugins-official)** by Anthropic
  - code-review plugin
  - claude-md-management plugin

## License

MIT License - See [LICENSE](LICENSE) for details.
