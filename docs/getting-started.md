# Getting Started with Groundwork

This guide helps you start using Groundwork effectively.

## Prerequisites

### All Platforms
- Node.js (v16+)
- Python 3
- Git
- Optional: GitHub CLI (`gh`) for PR commands

### Windows Users

Groundwork requires a Unix-like shell environment. Use one of:

1. **WSL (Recommended)** - Windows Subsystem for Linux
   - Install: `wsl --install` in PowerShell (admin)
   - Run Claude Code from your WSL terminal

2. **Git Bash** - Included with Git for Windows
   - Install Git for Windows
   - Run Claude Code from Git Bash

**Common Windows Issues:**

| Issue | Solution |
|-------|----------|
| "bash not found" | Run from WSL or Git Bash |
| Hooks don't run | Check file permissions in WSL |
| Path errors | Use forward slashes (`/`) |
| Line endings | Run: `git config --global core.autocrlf input` |

## First Session

When you start a new Claude Code session with Groundwork installed, the plugin automatically:

1. Checks for required dependencies (node, python3, gh)
2. Detects your project state and suggests next steps
3. Loads the core skill instructions

## Understanding Skills

Skills are reusable workflows that guide Claude through complex tasks. They're invoked using the Skill tool or slash commands.

### When to Use Skills

**Planning a new feature?**
```
/groundwork:design-product
```
This guides creation of a product requirements document.

**Ready to implement?**
```
/groundwork:create-tasks
```
Generates implementation tasks from architecture.

**Working through tasks?**
```
/groundwork:work-on-next-task
```
Identifies and works on the next unblocked task.

For context isolation across every phase, run the external harness from a terminal:

```bash
node /path/to/groundwork/bin/groundwork-run.js task TASK-004 --harness claude
node /path/to/groundwork/bin/groundwork-run.js task TASK-004 TASK-009 --harness codex
node /path/to/groundwork/bin/groundwork-run.js all --harness codex --project api
node /path/to/groundwork/bin/groundwork-run.js all --from TASK-010 --to TASK-025 --harness codex --project api
```

It creates the linked task worktree before planning, then invokes `plan-task`, `implement-task`, `validate`, and `finalize-task` from that task-worktree project root in separate fresh processes as needed. Existing verified work is reconciled first: conventional plans, clean completed implementation worktrees, and validation checkpoints bound to unchanged Git heads are skipped. Ambiguous worktrees are resumed instead of recreated. Checkpoints are stored outside the working tree under `<git-common-dir>/groundwork/runner/`. Use the same skills directly when stepping through the workflow manually.

Monorepo workspaces include the project name, such as `task/api/TASK-004` and `.worktrees/api-TASK-004`. This prevents overlapping task numbers from colliding and allows another project's linked worktree to retain in-progress changes. The selected project must remain clean in unrelated worktrees.

If multiple runner commands target the same repository, each project has its own task lease, so different projects may run model phases concurrently while tasks for one project remain ordered. Runner-owned setup, worktree lifecycle, publication, and recovery use a writer-preferred repository gate; model phases hold reader access. Waiting commands print periodic status. This avoids shared-Git races while keeping separate batch commands resumable.

The runner prints the machine's local date, time, timezone, relative phase timing, sanitized commands, selected tool activity, validation iteration launches and per-reviewer verdicts, and a 30-second heartbeat while Claude Code or Codex is quiet. Generic turn events and successful short-command completions are suppressed; command failures and commands lasting at least 10 seconds remain visible. Explicit task arguments form a list; `--from` and `--to` select inclusive range bounds and may be used independently.

The final phase prepares task bookkeeping, handles a moved base, and chooses the merge message. The harness rechecks the exact base and task heads under writer access before publication; if the base moved, it preserves the task worktree and returns to bounded revalidation before merging and cleanup.

### Skill Categories

1. **Planning & Design** - Start here for new work
2. **Implementation** - Execute plans systematically
3. **Testing & Debugging** - Ensure quality
4. **Maintenance** - Keep docs in sync

## Recommended Workflow

### For New Projects

1. `/groundwork:design-product` - Define requirements
2. `/groundwork:design-architecture` - Design technical approach
3. `/groundwork:create-tasks` - Generate implementation tasks
4. `/groundwork:work-on-next-task` - Work through tasks one by one

### For Existing Projects

1. Run `/groundwork:skills` to see available skills
2. Use `/groundwork:check-specs-alignment` to audit code vs specs
3. Use `/groundwork:debug` for systematic debugging
4. Use `/groundwork:build-unplanned` to implement ad-hoc features from a description
5. Use `/groundwork:review-pr` for multi-agent PR reviews with inline GitHub comments

## Tips

- **Read skills before using** - Use Skill tool to load and understand each skill
- **Follow skills exactly** - They encode proven workflows
- **Use process skills first** - Planning before implementation
- **Review regularly** - Use `/groundwork:validate` to re-run multi-agent verification after each major change
- **Review PRs with agents** - Use `/groundwork:review-pr` to run multi-agent analysis and post inline comments to GitHub

## Optional Statusline

Groundwork includes an opt-in statusline workflow. Installing the plugin does not change your statusline. Run:

```text
/groundwork:statusline install
```

On Claude Code this installs Groundwork's three-line renderer. On Codex it configures native fields and omits cumulative session-token usage so the context display remains scoped to the current context. Codex does not yet support custom statusline fields, so its statusline cannot show the selected Groundwork project within a monorepo. Run `/groundwork:statusline uninstall` to remove only the configuration owned by Groundwork. No separate `groundwork-statusline` plugin is needed.

The Claude Code renderer requires `jq` and `curl`. The `gh` CLI is optional and adds the current pull-request number when available. Python 3 and Git are already Groundwork prerequisites.

## Getting Help

- `/groundwork:skills` - List all available skills
- `/groundwork:groundwork-check` - Validate plugin installation
- See the README for full documentation
