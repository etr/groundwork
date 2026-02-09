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
claude plugin install groundwork
```

### Direct Installation

```bash
claude plugin install https://github.com/etr/groundwork
```

### Manual Installation

```bash
cd ~/.claude/plugins
git clone https://github.com/etr/groundwork.git
```

### Verify Installation

Restart Claude Code or start a new session. You should see:
- Start typing `/groundwork`. It should show groundwork commands available

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

### Greenfield Project

Full planning-to-implementation workflow:

```
/design-product           # Define requirements (PRD with EARS format)
/design-architecture      # Design technical approach and decisions
/ux-design                # Establish design system (for UI projects)
/create-tasks             # Generate implementation tasks
/work-on-next-task        # Start executing tasks with TDD
```

### Quick Feature

Skip formal planning and go straight to building:

```
/build-unplanned Add user avatar upload with image resizing
```

### Existing Codebase

Analyze existing code to generate initial specifications:

```
/design-product           # Analyzes codebase to propose PRD
```

## Commands

Commands are what you type to interact with Groundwork. All commands are prefixed with `groundwork:` (e.g., `/groundwork:design-product`), though the prefix can be omitted if no other plugin uses the same command name.

### Planning Commands

Define what to build and how to build it.

| Command | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/design-product` | `[product-name]` | Create or update PRD with EARS requirements | Starting a new project or adding features |
| `/design-architecture` | `[feature-name]` | Design technical architecture with decision records | After PRD exists, need technical design |
| `/ux-design` | `[product-name]` | Establish design system — foundations, brand, UX patterns | Need visual/UX consistency for UI projects |
| `/create-tasks` | `[filter]` | Generate implementation tasks from PRD + architecture | After specs exist, ready to plan implementation |

### Implementation Commands

Execute tasks and build features.

| Command | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/work-on` | `[task-number]` | Execute a specific task with worktree isolation and TDD | Want to work on a specific task by number |
| `/work-on-next-task` | — | Execute the next unblocked task automatically | Working through tasks sequentially |
| `/just-do-it` | — | Execute all remaining tasks in dependency order | Want batch execution of all remaining work |
| `/build-unplanned` | `[description]` | Build feature from description — no task definitions needed | Quick feature without formal planning |

### Debugging Commands

Investigate and resolve issues systematically.

| Command | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/debug` | `[bug description]` | Systematic 5-phase debugging workflow | Investigating bugs or test failures |

### Verification Commands

Validate code quality and spec alignment.

| Command | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/validate` | — | Re-run 8-agent verification on current changes | Verify code quality after manual changes |
| `/check-specs-alignment` | `[context]` | Audit code alignment with PRD and architecture | Periodic drift detection |

### Synchronization Commands

Keep specs in sync with what was actually built. Run these at the end of a session when implementation diverged from the original plan.

| Command | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/source-product-specs-from-code` | `[files...]` | Update PRD to reflect implementation changes | After product decisions during implementation |
| `/source-architecture-from-code` | `[files...]` | Update architecture docs with new decisions | After architectural changes during implementation |
| `/source-ux-design-from-code` | `[files...]` | Update design system with token/pattern changes | After design changes during implementation |

### Utility Commands

Plugin management and reference.

| Command | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/split-spec` | `[spec-type]` | Convert single-file spec to directory structure | Specs getting too large for one file |
| `/skills` | — | List all available Groundwork skills | Discovering available capabilities |
| `/groundwork-check` | — | Validate plugin installation | Troubleshooting issues |
| `/groundwork-help` | — | Show all commands and skills | Quick reference |

## Workflows

### Greenfield Project

Full planning through implementation with continuous synchronization:

```
/design-product              # 1. Define requirements
/design-architecture         # 2. Design technical approach
/ux-design                   # 3. Establish design system (UI projects)
/create-tasks                # 4. Generate task list
/work-on-next-task           # 5. Execute tasks one by one (repeat)
/source-product-specs-from-code   # 6. Sync specs if implementation diverged
/source-architecture-from-code    # 7. Sync architecture if decisions changed
```

### Adding Features to an Existing Project

Incrementally update specs, implement, then sync:

```
/design-product              # Update PRD with new feature requirements
/design-architecture         # Update architecture for new components
/create-tasks                # Generate tasks for the new feature
/work-on-next-task           # Execute tasks
/source-product-specs-from-code   # Sync any implementation-time decisions
```

### Quick Unplanned Feature

Skip planning entirely — go straight to TDD:

```
/build-unplanned Add password strength indicator to signup form
```

This gathers requirements inline, implements with TDD in a worktree, runs verification agents, and merges back.

### Debugging

Systematic 5-phase investigation:

```
/debug Login fails silently when session cookie is expired
```

Phases: Observe → Hypothesize → Predict → Test → Conclude. No fix is applied until the root cause is confirmed.

### Verification

Check quality and alignment at any point:

```
/validate                    # Run all 8 verification agents
/check-specs-alignment       # Audit drift between code and specs
```

## Skills

Skills are internal workflow definitions invoked automatically by the model when you run commands. You don't need to call skills directly (they are, in fact, hidden) — commands handle this for you.

### Planning & Design

| Skill | Description |
|-------|-------------|
| `understanding-feature-requests` | Clarify feature requests, gather requirements, check for contradictions |
| `product-design` | Create and iterate on product requirements documents (PRDs) |
| `architecture` | Design system architecture and make technical decisions |
| `design-system` | Establish design system — foundations, brand identity, UX patterns |
| `tasks` | Generate implementation tasks from product specs and architecture |
| `task-validation-loop` | Multi-agent verification that tasks cover PRD, follow architecture, and respect design |
| `using-groundwork` | Introduction to finding and using Groundwork skills |

### Implementation

| Skill | Description |
|-------|-------------|
| `execute-task` | Execute a specific task with worktree isolation, TDD, and validation |
| `next-task` | Find and execute the next unblocked task |
| `implement-feature` | TDD workflow with multi-agent verification and worktree lifecycle |
| `build-unplanned-feature` | Build a feature from description — requirement gathering, TDD, and validation |
| `use-git-worktree` | Create isolated git worktrees for feature work |
| `test-driven-development` | Red-Green-Refactor with coverage targets |

### Debugging

| Skill | Description |
|-------|-------------|
| `debugging` | Systematic root cause analysis before any fix is applied |

### Verification

| Skill | Description |
|-------|-------------|
| `validation-loop` | Multi-agent verification with autonomous fix-and-retry |
| `check-alignment` | Verify code matches specs and architecture, detect drift |

### Synchronization

| Skill | Description |
|-------|-------------|
| `sync-specs` | Synchronize PRD with codebase changes |
| `sync-architecture` | Synchronize architecture docs with codebase changes |
| `sync-design-system` | Synchronize design system with token/pattern changes |

## Internals

For contributors and curious users — how the plugin works under the hood.

### Agents

Agents are specialized sub-processes that run verification and validation tasks. They are invoked automatically by skills like `validation-loop` and `task-validation-loop`.

#### Implementation Verification (8 agents)

These run after task implementation via the `validation-loop` skill:

| Agent | Description |
|-------|-------------|
| `code-quality-reviewer` | Reviews code for quality, readability, elegance, and test coverage |
| `security-reviewer` | Reviews for security vulnerabilities — OWASP Top 10, input validation, auth issues |
| `spec-alignment-checker` | Verifies implementation aligns with task definition and product specs |
| `architecture-alignment-checker` | Verifies implementation aligns with architecture decisions and technology choices |
| `code-simplifier` | Simplifies code for clarity and maintainability while preserving functionality |
| `housekeeper` | Verifies housekeeping — task status updates, action items, documentation changes |
| `performance-reviewer` | Reviews for performance issues — algorithmic complexity, memory, I/O |
| `design-consistency-checker` | Verifies design system compliance — tokens, accessibility, pattern consistency |

#### Task Validation (3 agents)

These run after task list creation via the `task-validation-loop` skill:

| Agent | Description |
|-------|-------------|
| `prd-task-alignment-checker` | Validates task list covers all PRD requirements |
| `architecture-task-alignment-checker` | Validates tasks follow architecture decisions and patterns |
| `design-task-alignment-checker` | Validates UI/frontend tasks include design tokens and accessibility |

#### Architecture Validation (1 agent)

| Agent | Description |
|-------|-------------|
| `prd-architecture-checker` | Validates architecture proposals cover all PRD requirements and NFRs |

#### Research (1 agent)

| Agent | Description |
|-------|-------------|
| `researcher` | Researches technologies and patterns before architecture decisions or task planning |

### Hooks

Hooks are event-driven automations that fire at specific points in the Claude Code lifecycle:

| Hook | Event | Description |
|------|-------|-------------|
| Session Start | `SessionStart` | Detects project state, loads skill context, checks for updates (1x/day) |
| Pre-Compact | `PreCompact` | Preserves critical skill state before context compaction |
| Commit Alignment | `PostToolUse` (on `git commit`) | Verifies commits align with specs and task definitions |
| Agent Output | `SubagentStop` | Validates agent output format |

## Configuration

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

This plugin has sourced learnings and code from multiple sources:

### Superpowers
- **[superpowers](https://github.com/obra/superpowers)** by Jesse Vincent
  - The `using-groundwork` skill is based on the [using-superpowers skill](https://github.com/obra/superpowers/blob/main/skills/executing-plans/SKILL.md)
  - The general plugin structure and patterns were learned from studying this project

### Official Claude Plugins
- **[claude-plugins-official](https://github.com/anthropics/claude-plugins-official)** by Anthropic
  - claude-md-management plugin

### Research Methodology
- **[get-shit-done](https://github.com/glittercowboy/get-shit-done)** by glittercowboy
  - The researcher agent's "Training as Hypothesis" guidance is adapted from this project's research methodology

## License

MIT License - See [LICENSE](LICENSE) for details.
