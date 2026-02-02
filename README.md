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
/architecture      # Design technical approach
/tasks             # Generate implementation tasks
/next-task         # Start working on first task
```

### Development Workflow

```
/task 4            # Work on specific task
/code-review       # Review code changes
```

## Skills Overview

### Planning & Design (3 skills)
| Skill | Description |
|-------|-------------|
| `product-design` | Create product requirements documents (PRDs) |
| `architecture` | Create architecture design documents with decisions |
| `tasks` | Generate implementation tasks from architecture |

### Implementation (1 skill)
| Skill | Description |
|-------|-------------|
| `next-task` | Execute next uncompleted task from specs |

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
| `/product-design` | Create PRD |
| `/architecture` | Create architecture document |
| `/tasks` | Generate tasks from architecture |
| `/sync-specs` | Sync PRD with codebase |
| `/sync-architecture` | Sync architecture with codebase |
| `/code-review` | Quick single-PR code review |
| `/revise-claude-md` | Update CLAUDE.md with learnings |
| `/check-alignment` | Verify alignment between code and specs |
| `/verify` | Quick verification checkpoint for current work |
| `/next-task` | Execute next uncompleted task |
| `/task` | Work on a specific task by number |
| `/skills` | List all available skills |
| `/groundwork-check` | Validate plugin installation |
| `/groundwork-help` | List all commands and skills with descriptions |
| `/split-spec` | Split single-file spec into directory structure |

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

### Core Foundation
- **[superpowers](https://github.com/obra/superpowers)** by Jesse Vincent - Base structure, skills, commands, hooks, lib (MIT License)

### Official Claude Plugins
- **[claude-plugins-official](https://github.com/anthropics/claude-plugins-official)** by Anthropic
  - code-review plugin
  - claude-md-management plugin

## License

MIT License - See [LICENSE](LICENSE) for details.

Individual components retain their original licenses as noted in attribution.
