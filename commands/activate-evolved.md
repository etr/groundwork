---
name: activate-evolved
description: Copy evolved components to ~/.claude/ for activation
argument-hint: "[--type skills|commands|agents] [--dry-run] [--all]"
allowed-tools: ["Bash", "Read", "Write", "Glob"]
---

# Activate Evolved Command

Copy evolved components from `~/.claude/homunculus/evolved/` to `~/.claude/` for activation.

Evolved components are skills, commands, and agents that were automatically generated from clustered instincts using the `/evolve` command.

## Arguments

"$ARGUMENTS"

Options:
- `--type <skills|commands|agents>`: Only activate specific type of component
- `--dry-run`: Preview what would be copied without making changes
- `--all`: Activate all evolved components without prompting

## What to Do

1. List evolved components in `~/.claude/homunculus/evolved/`:
   - `evolved/skills/` - Generated skills
   - `evolved/commands/` - Generated commands
   - `evolved/agents/` - Generated agents

2. If no evolved components exist:
   ```
   No evolved components found.

   Use /evolve to cluster related instincts into reusable components.
   ```

3. Show preview of what will be copied:
   ```
   Evolved Components Available
   ============================

   Skills (2):
     - testing-workflow (from 5 instincts)
     - functional-patterns (from 3 instincts)

   Commands (1):
     - new-feature (from 4 instincts)

   Agents (0):
     (none)

   Total: 3 components
   ```

4. Check for conflicts (existing files with same name):
   - `~/.claude/skills/<name>/SKILL.md`
   - `~/.claude/commands/<name>.md`
   - `~/.claude/agents/<name>.md`

5. If conflicts exist, warn user:
   ```
   WARNING: The following would overwrite existing files:
     - ~/.claude/skills/testing-workflow/SKILL.md

   Use --force to overwrite, or rename the evolved component first.
   ```

6. If `--dry-run`, stop here and report what would happen

7. Copy components to their destinations:
   - Skills: Create `~/.claude/skills/<name>/SKILL.md`
   - Commands: Copy to `~/.claude/commands/<name>.md`
   - Agents: Copy to `~/.claude/agents/<name>.md`

8. Report success:
   ```
   Activated 3 components:
     - ~/.claude/skills/testing-workflow/SKILL.md
     - ~/.claude/skills/functional-patterns/SKILL.md
     - ~/.claude/commands/new-feature.md

   Components are now available in Claude Code.
   Run /init or restart to load them.
   ```

## Component Destinations

| Evolved Location | Destination |
|-----------------|-------------|
| `~/.claude/homunculus/evolved/skills/<name>/SKILL.md` | `~/.claude/skills/<name>/SKILL.md` |
| `~/.claude/homunculus/evolved/commands/<name>.md` | `~/.claude/commands/<name>.md` |
| `~/.claude/homunculus/evolved/agents/<name>.md` | `~/.claude/agents/<name>.md` |

## Notes

- Activated components shadow plugin components with the same name
- Use `/skill-name` or the Skill tool to use activated skills
- Run `/init` or restart Claude Code after activation to load new components
- To deactivate, delete the component from `~/.claude/`
