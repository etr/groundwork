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
/write-plan        # Create detailed implementation plan
/execute-plan      # Execute plan with checkpoints
```

### Code Quality

```
/review-pr         # Comprehensive PR review
/code-review       # Review specific PR by number
```

## Skills Overview

### Planning & Design (5 skills)
| Skill | Description |
|-------|-------------|
| `task-brainstorm` | Collaborative exploration of ideas into fully-formed designs |
| `writing-plans` | Create detailed implementation plans with bite-sized tasks |
| `executing-plans` | Execute plans in batches with review checkpoints |
| `product-design` | Create product requirements documents (PRDs) |
| `architecture` | Create architecture design documents with decisions |

### Implementation (4 skills)
| Skill | Description |
|-------|-------------|
| `tasks` | Generate implementation tasks from architecture |
| `subagent-driven-development` | Execute plans via fresh subagent per task |
| `dispatching-parallel-agents` | Handle independent tasks simultaneously |
| `using-git-worktrees` | Create isolated workspaces for feature work |

### Testing & Debugging (5 skills)
| Skill | Description |
|-------|-------------|
| `test-driven-development` | Red-Green-Refactor with 80%+ coverage |
| `systematic-debugging` | Four-phase debugging with root cause analysis |
| `verification-before-completion` | Verify work before claiming completion |
| `testing-anti-patterns` | Common testing mistakes to avoid |
| `root-cause-tracing` | Systematic root cause analysis techniques |

### Code Review (2 skills)
| Skill | Description |
|-------|-------------|
| `requesting-code-review` | Request code review via subagent |
| `receiving-code-review` | Process and respond to code review feedback |

### Maintenance (6 skills)
| Skill | Description |
|-------|-------------|
| `finishing-a-development-branch` | Complete development work (merge, PR, cleanup) |
| `claude-md-improver` | Audit and improve CLAUDE.md files |
| `sync-specs` | Synchronize PRD with codebase changes |
| `sync-architecture` | Synchronize architecture docs with codebase |
| `check-alignment` | Verify implementation aligns with specs |
| `next-task` | Execute next uncompleted task from specs |

### Learning & Context (3 skills)
| Skill | Description |
|-------|-------------|
| `continuous-learning` | Instinct-based learning from sessions |
| `strategic-compact` | Suggest context compaction at logical points |
| `iterative-retrieval` | Progressive information gathering |

### Problem-Solving (6 skills)
| Skill | Description |
|-------|-------------|
| `when-stuck` | Techniques for getting unstuck |
| `collision-zone-thinking` | Find innovation at concept intersections |
| `inversion-exercise` | Solve problems by inverting them |
| `meta-pattern-recognition` | Identify patterns across domains |
| `scale-game` | Explore problems at different scales |
| `simplification-cascades` | Systematic simplification techniques |

### Meta (2 skills)
| Skill | Description |
|-------|-------------|
| `using-groundwork` | Introduction to using skills |
| `writing-skills` | Create new skills with TDD approach |

### Design (1 skill)
| Skill | Description |
|-------|-------------|
| `frontend-design` | Create distinctive frontend interfaces |

## Agents

| Agent | Description |
|-------|-------------|
| `plan-adherence-reviewer` | Review code against plan and standards |
| `standards-reviewer` | PR-focused review with confidence scoring |
| `code-simplifier` | Simplify code for clarity and maintainability |
| `comment-analyzer` | Analyze code comments for accuracy |
| `pr-test-analyzer` | Review test coverage quality |
| `silent-failure-hunter` | Find silent failures and error handling issues |
| `type-design-analyzer` | Analyze type design and invariants |

## Commands

| Command | Description |
|---------|-------------|
| `/task-brainstorm` | Start collaborative brainstorming |
| `/write-plan` | Create implementation plan |
| `/execute-plan` | Execute plan with checkpoints |
| `/product-design` | Create PRD |
| `/architecture` | Create architecture document |
| `/tasks` | Generate tasks from architecture |
| `/sync-specs` | Sync PRD with codebase |
| `/sync-architecture` | Sync architecture with codebase |
| `/review-pr` | Comprehensive PR review |
| `/code-review` | Quick single-PR code review |
| `/revise-claude-md` | Update CLAUDE.md with learnings |
| `/check-alignment` | Verify alignment between code and specs |
| `/next-task` | Execute next uncompleted task |
| `/task` | Work on a specific task by number |
| `/skills` | List all available skills |
| `/groundwork-check` | Validate plugin installation |
| `/groundwork-help` | List all commands and skills with descriptions |
| `/instinct-status` | Show learned instincts (continuous-learning) |
| `/evolve` | Cluster instincts into skills/commands/agents |
| `/instinct-export` | Export instincts for sharing |
| `/instinct-import` | Import instincts from others |

## Configuration

### Hooks (Automatic)

The plugin registers these hooks automatically via `hooks/hooks.json`:

- **SessionStart** - Loads skill context, detects project state, checks for updates
- **PreToolUse (Edit/Write)** - Security reminders for file modifications
- **PreToolUse (file ops)** - Suggests compaction at logical intervals
- **PostToolUse** - Continuous learning observation (enabled by default)
- **Stop** - Session evaluation for learning (enabled by default)
- **PreCompact** - Preserves skill state before context compaction

### Continuous Learning

Continuous learning is now enabled by default. The plugin:
- Observes tool use patterns via the PostToolUse hook
- Evaluates sessions on stop for learnable patterns
- Stores observations in `~/.claude/homunculus/observations.jsonl`

To check learning status:
```
/instinct-status
```

To disable continuous learning, create a marker file:
```bash
touch ~/.claude/homunculus/disabled
```

### Update Checking

The plugin checks for updates once per day (throttled) and shows a notification if updates are available. Update by running:
```bash
cd ~/.claude/plugins/groundwork && git pull
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COMPACT_THRESHOLD` | 50 | Tool calls before suggesting compact |
| `ENABLE_SECURITY_REMINDER` | 1 | Set to 0 to disable security hook |
| `GROUNDWORK_SKIP_UPDATE_CHECK` | 0 | Set to 1 to skip update checking |

See the `continuous-learning` skill and `docs/hooks-configuration.md` for full documentation.

## Attribution

This plugin consolidates work from multiple sources:

### Core Foundation
- **[superpowers](https://github.com/obra/superpowers)** by Jesse Vincent - Base structure, 14 skills, 3 commands, 1 agent, hooks, lib (MIT License)

### Architecture & Planning
- **architecture-to-tasks-workflow** - 5 skills (product-design, architecture, tasks, sync-specs, sync-architecture)

### Official Claude Plugins
- **[claude-plugins-official](https://github.com/anthropics/claude-plugins-official)** by Anthropic
  - code-review plugin
  - code-simplifier plugin
  - claude-md-management plugin
  - frontend-design plugin
  - pr-review-toolkit plugin (6 agents)
  - security-guidance plugin

### Everything Claude Code
- **everything-claude-code** - continuous-learning (v1+v2), tdd-workflow, strategic-compact, iterative-retrieval

### Problem-Solving Skills
- **superpowers-skills** - when-stuck, collision-zone-thinking, inversion-exercise, meta-pattern-recognition, scale-game, simplification-cascades, testing-anti-patterns

## License

MIT License - See [LICENSE](LICENSE) for details.

Individual components retain their original licenses as noted in attribution.
