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

## Tips

- **Read skills before using** - Use Skill tool to load and understand each skill
- **Follow skills exactly** - They encode proven workflows
- **Use process skills first** - Planning before implementation
- **Review regularly** - Use `/groundwork:validate` to re-run multi-agent verification after each major change

## Getting Help

- `/groundwork:skills` - List all available skills
- `/groundwork:groundwork-check` - Validate plugin installation
- See the README for full documentation
