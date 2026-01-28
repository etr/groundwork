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

1. Creates required directories for continuous learning
2. Checks for required dependencies (node, python3, gh)
3. Detects your project state and suggests next steps
4. Loads the core skill instructions

## Understanding Skills

Skills are reusable workflows that guide Claude through complex tasks. They're invoked using the Skill tool or slash commands.

### When to Use Skills

**Planning a new feature?**
```
/task-brainstorm
```
This guides collaborative exploration before writing code.

**Ready to implement?**
```
/write-plan
```
Creates a detailed implementation plan with tasks.

**Working through tasks?**
```
/next-task
```
Identifies and works on the next unblocked task.

**Debugging an issue?**
Invoke the `systematic-debugging` skill for structured root cause analysis.

### Skill Categories

1. **Planning & Design** - Start here for new work
2. **Implementation** - Execute plans systematically
3. **Testing & Debugging** - Ensure quality
4. **Code Review** - Catch issues before merge
5. **Maintenance** - Keep docs in sync
6. **Problem-Solving** - Get unstuck

## Recommended Workflow

### For New Projects

1. `/product-design` - Define requirements
2. `/architecture` - Design technical approach
3. `/tasks` - Generate implementation tasks
4. `/next-task` - Work through tasks one by one

### For Existing Projects

1. Run `/skills` to see available skills
2. Use `/task-brainstorm` when adding features
3. Use `/code-review` before creating PRs

## Continuous Learning

Groundwork can learn from your sessions and build up "instincts" - small learned behaviors that improve over time.

To enable:
1. Configure observation hooks (see continuous-learning skill)
2. Work normally - patterns are automatically detected
3. Run `/instinct-status` to see what was learned
4. Run `/evolve` to cluster instincts into new skills

## Tips

- **Read skills before using** - Use Skill tool to load and understand each skill
- **Follow skills exactly** - They encode proven workflows
- **Use process skills first** - task-brainstorm before implementation
- **Review regularly** - Use code review skills after each major change

## Getting Help

- `/skills` - List all available skills
- `/groundwork-check` - Validate plugin installation
- See the README for full documentation
