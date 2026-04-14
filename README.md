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

#### Update via Marketplace

```bash
claude plugin marketplace update groundwork-marketplace

claude plugin update groundwork
```

### Manual Installation

```bash
cd ~/.claude/plugins
git clone https://github.com/etr/groundwork.git
```

Or use the installer provided with the codebase.

### Other Platforms (Experimental)

> **Warning:** Installation on platforms other than Claude Code is experimental. Skills and agents are automatically transformed to work without Claude Code's plugin system, but some features (hooks, slash commands, skill chaining) may not work identically. Use at your own risk.

Groundwork skills and agents can be installed into other AI coding tools using the included installer script. The installer transforms skill content to remove Claude Code-specific constructs and adapts the format for each target.

#### Supported Targets

| Target | Flag | Description |
|--------|------|-------------|
| [Codex CLI](https://github.com/openai/codex) | `--codex` | Agents are installed as skills with a `review-` prefix |
| [OpenCode](https://github.com/opencode-ai/opencode) | `--opencode` | Agents are installed as standalone agent files |
| [Kiro](https://kiro.dev) | `--kiro` | Agents use JSON config + prompt file pairs |

#### Installation

Clone the repository and run the installer:

```bash
git clone https://github.com/etr/groundwork.git
cd groundwork
```

Install globally (available in all projects):

```bash
./install-skills.sh --codex --global
```

Install for the current project only:

```bash
./install-skills.sh --opencode --project
```

You can install to multiple targets at once:

```bash
./install-skills.sh --codex --opencode --kiro --global
```

#### Installer Options

| Option | Description |
|--------|-------------|
| `--global` | Install to user-level config directory |
| `--project` | Install to current project directory |
| `--force` | Overwrite existing files |
| `--dry-run` | Preview actions without making changes |
| `--skills-only` | Install only skills (skip agents) |
| `--source DIR` | Groundwork source directory (default: auto-detect) |

#### What Gets Installed

- **Skills** — Workflow definitions (planning, TDD, debugging, etc.) are installed with a `groundwork-` prefix. On OpenCode, skill dependencies are automatically inlined as appendix sections.
- **Agents** — Verification and review agents (code quality, security, architecture alignment, etc.) are installed in each target's native agent format.
- **Hooks** — Not installed automatically. Event-driven automations (session start, pre-compact, commit alignment) require manual setup for each tool.
- **Commands** — Not applicable. Other tools discover skills directly by name rather than through slash commands.

#### Limitations

- Hooks (`SessionStart`, `PreCompact`, `PostToolUse`) are not portable and must be configured manually for each tool
- On OpenCode, complex multi-skill workflows may lose interactivity since skill dependencies are inlined as static appendix sections rather than invoked at runtime
- Update checking is not available outside Claude Code

### Verify Installation

Restart Claude Code or start a new session. You should see:
- Start typing `/groundwork:`. It should show groundwork commands available

Run `/groundwork:groundwork-check` to validate the plugin installation.

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
/groundwork:design-product           # Define requirements (PRD with EARS format)
/groundwork:design-architecture      # Design technical approach and decisions
/groundwork:ux-design                # Establish design system (for UI projects)
/groundwork:create-tasks             # Generate implementation tasks
/groundwork:work-on-next-task        # Start executing tasks with TDD
```

### Quick Feature

Skip formal planning and go straight to building:

```
/groundwork:build-unplanned Add user avatar upload with image resizing
```

### Monorepo Project

Set up a monorepo and start planning for a specific project:

```
/groundwork:setup-repo               # Detect monorepo, create .groundwork.yml
/groundwork:select-project           # Choose which project to work on
/groundwork:design-product           # Define requirements for selected project
```

### Existing Codebase

Analyze existing code to generate initial specifications:

```
/groundwork:design-product           # Analyzes codebase to propose PRD
```

## Commands

Commands are what you type to interact with Groundwork. All commands are prefixed with `groundwork:` (e.g., `/groundwork:design-product`), though the prefix can be omitted if no other plugin uses the same command name.

### Planning Commands

Define what to build and how to build it.

| Command | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:design-product` | `[product-name]` | Create or update PRD with EARS requirements | Starting a new project or adding features |
| `/groundwork:design-architecture` | `[feature-name]` | Design technical architecture with decision records | After PRD exists, need technical design |
| `/groundwork:swarm-design-architecture` | `[feature-name]` | Parallel adversarial architecture design with agent teams | Multiple viable tech options, need balanced comparison |
| `/groundwork:ux-design` | `[product-name]` | Establish design system — foundations, brand, UX patterns | Need visual/UX consistency for UI projects |
| `/groundwork:create-tasks` | `[filter]` | Generate implementation tasks from PRD + architecture | After specs exist, ready to plan implementation |
| `/groundwork:setup-repo` | — | Configure repo — detect single-project or monorepo | First time using Groundwork in a repo |

### Implementation Commands

Execute tasks and build features.

| Command | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:work-on` | `[task-number]` | Execute a specific task with worktree isolation and TDD | Want to work on a specific task by number |
| `/groundwork:work-on-next-task` | — | Execute the next unblocked task automatically | Working through tasks sequentially |
| `/groundwork:plan-task` | `[task-number-or-description]` | Plan a task or feature without implementing | Want to review a plan before committing to implementation |
| `/groundwork:implement-task` | `[task-number-or-plan-path]` | Implement a previously planned task | Resume implementation after reviewing a plan |
| `/groundwork:just-do-it` | — | Execute all remaining tasks in dependency order | Want batch execution of all remaining work |
| `/groundwork:just-do-it-swarming` | `[--parallel]` | Execute all tasks using agent teams for context isolation | Large batches where context accumulation is a concern |
| `/groundwork:build-unplanned` | `[description]` | Build feature from description — no task definitions needed | Quick feature without formal planning |
| `/groundwork:select-project` | `[project-name]` | Switch to a different project in a monorepo | Working across multiple projects |

### Debugging Commands

Investigate and resolve issues systematically.

| Command | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:debug` | `[bug description]` | Systematic 5-phase debugging workflow | Investigating bugs or test failures |
| `/groundwork:swarm-debug` | `[bug description]` | Parallel hypothesis investigation with agent teams | Multiple plausible root causes, needs adversarial testing |

### Verification Commands

Validate code quality and spec alignment.

| Command | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:validate` | — | Re-run 9-agent verification on current changes | Verify code quality after manual changes |
| `/groundwork:check-specs-alignment` | `[context]` | Audit code alignment with PRD and architecture | Periodic drift detection |

### Review Commands

Review pull requests with multi-agent analysis. Requires `gh` (GitHub CLI).

| Command | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:review-pr` | `[PR# or URL] [--no-interactive]` | Multi-agent PR review with inline GitHub comments | Reviewing PRs before merge |

### Synchronization Commands

Keep specs in sync with what was actually built. Run these at the end of a session when implementation diverged from the original plan.

| Command | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:source-product-specs-from-code` | `[files...]` | Update PRD to reflect implementation changes | After product decisions during implementation |
| `/groundwork:source-architecture-from-code` | `[files...]` | Update architecture docs with new decisions | After architectural changes during implementation |
| `/groundwork:source-ux-design-from-code` | `[files...]` | Update design system with token/pattern changes | After design changes during implementation |
| `/groundwork:split-specs` | — | Convert single-file PRD into directory format | PRD has grown large (auto-triggered at 500+ lines or 15+ features) |
| `/groundwork:split-architecture` | — | Convert single-file architecture doc into directory format | Architecture doc has grown large (auto-triggered at 500+ lines or 10+ DRs) |

### Utility Commands

Plugin management and reference.

| Command | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:skills` | — | List all available Groundwork skills | Discovering available capabilities |
| `/groundwork:groundwork-check` | — | Validate plugin installation | Troubleshooting issues |
| `/groundwork:groundwork-help` | — | Show all commands and skills | Quick reference |

## Model Recommendations

Skills vary in complexity. The table below lists the minimum model tier recommended for each command. Running a command below its recommended tier may produce lower-quality results or hit context limits.

| Tier | Minimum Model | Commands |
|------|---------------|----------|
| **Opus (1M)** | Opus at high effort | `/groundwork:design-product`, `/groundwork:design-architecture`, `/groundwork:ux-design`, `/groundwork:create-tasks`, `/groundwork:debug`, `/groundwork:swarm-debug`, `/groundwork:swarm-design-architecture` |
| **Sonnet+** | Sonnet or Opus at high effort | `/groundwork:work-on`, `/groundwork:work-on-next-task`, `/groundwork:just-do-it`, `/groundwork:just-do-it-swarming`, `/groundwork:build-unplanned`, `/groundwork:validate`, `/groundwork:check-specs-alignment`, `/groundwork:review-pr`, `/groundwork:source-product-specs-from-code`, `/groundwork:source-architecture-from-code`, `/groundwork:source-ux-design-from-code` |
| **Any** | No requirement | `/groundwork:setup-repo`, `/groundwork:select-project`, `/groundwork:skills`, `/groundwork:groundwork-help`, `/groundwork:groundwork-check` |

## Workflows

### Greenfield Project

Full planning through implementation with continuous synchronization:

```
/groundwork:design-product              # 1. Define requirements
/groundwork:design-architecture         # 2. Design technical approach
/groundwork:ux-design                   # 3. Establish design system (UI projects)
/groundwork:create-tasks                # 4. Generate task list
/groundwork:work-on-next-task           # 5. Execute tasks one by one (repeat)
/groundwork:source-product-specs-from-code   # 6. Sync specs if implementation diverged
/groundwork:source-architecture-from-code    # 7. Sync architecture if decisions changed
```

### Adding Features to an Existing Project

Incrementally update specs, implement, then sync:

```
/groundwork:design-product              # Update PRD with new feature requirements
/groundwork:design-architecture         # Update architecture for new components
/groundwork:create-tasks                # Generate tasks for the new feature
/groundwork:work-on-next-task           # Execute tasks
/groundwork:source-product-specs-from-code   # Sync any implementation-time decisions
```

### Plan Then Implement (Split Workflow)

Plan a task first, review the plan, then implement separately:

```
/groundwork:plan-task 4                 # Plan task 4, saves to .groundwork-plans/
# ... review the plan, adjust if needed ...
/groundwork:implement-task 4            # Implement using the saved plan
```

Also works for ad-hoc features:

```
/groundwork:plan-task "Add SSO login"   # Plan from a description
/groundwork:implement-task .groundwork-plans/FEATURE-sso-login-plan.md
```

### Quick Unplanned Feature

Skip planning entirely — go straight to TDD:

```
/groundwork:build-unplanned Add password strength indicator to signup form
```

This gathers requirements inline, implements with TDD in a worktree, runs verification agents, and merges back.

### Debugging

Systematic 5-phase investigation:

```
/groundwork:debug Login fails silently when session cookie is expired
```

Phases: Observe → Hypothesize → Predict → Test → Conclude. No fix is applied until the root cause is confirmed.

### Batch Execution

Execute all remaining tasks in dependency order:

```
/groundwork:just-do-it
```

All task phases (Plan, Implement, Validate, Fix, Merge) run inline in the main conversation. This works well for small batches but accumulates context over many tasks.

#### Swarming Mode (Claude Code only)

For large batches (>5 tasks), use swarming mode to run each task in its own isolated session:

```
/groundwork:just-do-it-swarming
```

Each task is assigned to an agent team teammate — a full Claude Code session with its own context window that can spawn subagents (Plan, task-executor, 9 validation agents). This prevents context accumulation in the lead's conversation.

For independent tasks, enable parallel execution:

```
/groundwork:just-do-it-swarming --parallel
```

Parallel mode groups tasks by dependency level and runs independent tasks simultaneously (max 5 concurrent). Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` to be enabled:

```json
// settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

#### Swarm Debugging (Claude Code only)

When a bug has multiple plausible root causes, spawn an agent team to investigate hypotheses in parallel:

```
/groundwork:swarm-debug Login fails silently when session cookie is expired
```

Each teammate investigates a different hypothesis and actively tries to disprove the others. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` to be enabled — falls back to standard debugging otherwise.

### Verification

Check quality and alignment at any point:

```
/groundwork:validate                    # Run all 9 verification agents
/groundwork:check-specs-alignment       # Audit drift between code and specs
```

### PR Review

Review a pull request with 6-8 specialized agents:

```
/groundwork:review-pr 42
```

Agents (code quality, test quality, security, performance, simplifier, housekeeper — plus architecture and design consistency when specs exist) run in parallel. Findings are deduplicated and posted as a single atomic review to GitHub with inline comments. Supports incremental reviews when previous Groundwork reviews exist.

For CI or batch pipelines:

```
/groundwork:review-pr 42 --no-interactive
```

## Monorepo Support

Groundwork supports monorepos — repositories containing multiple projects, each with their own specs and tasks.

### Setup

Run `/groundwork:setup-repo` to configure your repository. Groundwork detects common monorepo patterns (workspace configs, `apps/`, `packages/`, `services/` directories) and asks you to confirm the structure. For monorepos, it creates a `.groundwork.yml` configuration file at the repo root.

### Configuration File

```yaml
version: 1
projects:
  web-app:
    path: apps/web-app
  api-server:
    path: services/api
  shared-lib:
    path: packages/shared
```

### Switching Projects

Use `/groundwork:select-project` to switch between projects. This sets the active project context so all planning, implementation, and sync commands operate on the correct project. Selection persists across sessions.

You can also pass a project name directly: `/groundwork:select-project api-server`

### How It Works

- Specs are stored per-project: `<project-path>/specs/`
- All planning, implementation, and sync commands are monorepo-aware
- Project selection persists across sessions via `.groundwork.local` at the repo root (gitignored)
- Environment variables: `GROUNDWORK_PROJECT` (project name), `GROUNDWORK_PROJECT_ROOT` (absolute path)

## Internals

For contributors and curious users — how the plugin works under the hood.

### Agents

Agents are specialized sub-processes that run verification and validation tasks. They are invoked automatically by skills like `validation-loop`, `task-validation-loop`, and `pr-reviewing`.

#### Implementation Verification (10 agents)

These run after task implementation via the `validation-loop` skill:

| Agent | Description |
|-------|-------------|
| `code-quality-reviewer` | Reviews code for quality, readability, elegance, and test coverage |
| `test-quality-reviewer` | Reviews test quality — structural correctness, coverage completeness, redundancy, best practices |
| `security-reviewer` | Reviews for security vulnerabilities — OWASP Top 10, input validation, auth issues |
| `spec-alignment-checker` | Verifies implementation aligns with task definition and product specs |
| `architecture-alignment-checker` | Verifies implementation aligns with architecture decisions and technology choices |
| `code-simplifier` | Simplifies code for clarity and maintainability while preserving functionality |
| `housekeeper` | Verifies housekeeping — task status updates, action items, documentation changes |
| `performance-reviewer` | Reviews for performance issues — algorithmic complexity, memory, I/O |
| `cloud-infrastructure-reviewer` | Reviews cloud infrastructure-as-code against Well-Architected best practices — IAM, encryption, network segmentation, reliability, cost, provider-specific checks for AWS/Azure/GCP, and IaC anti-patterns |
| `design-consistency-checker` | Verifies design system compliance — tokens, accessibility, interaction quality, UX writing, pattern consistency |

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

#### Task Execution (1 agent)

| Agent | Description |
|-------|-------------|
| `task-executor` | Executes task implementation with worktree isolation, TDD, and skill preloading |

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

### Impeccable
- **[impeccable](https://github.com/pbakaus/impeccable)** by Paul Bakaus ([impeccable.style](https://impeccable.style))
  - License: Apache 2.0 (itself based on Anthropic's [frontend-design skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design))
  - The design system skill's reference guides for color & contrast, interaction design, motion design, spatial design, typography, and UX writing are adapted from Impeccable's domain-specific reference files
  - The design consistency checker agent's interaction quality, UX writing quality, and expanded accessibility checks are derived from these references

### Research Methodology
- **[get-shit-done](https://github.com/glittercowboy/get-shit-done)** by glittercowboy
  - The researcher agent's "Training as Hypothesis" guidance is adapted from this project's research methodology

## License

MIT License - See [LICENSE](LICENSE) for details.
