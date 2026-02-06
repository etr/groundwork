---
name: groundwork:groundwork-help
description: List all Groundwork commands and skills with descriptions. Usage /groundwork:groundwork-help
allowed-tools: ["Glob", "Read", "Grep"]
disable-model-invocation: true
---

# Groundwork Help

Lists all available commands, skills, and agents provided by the Groundwork plugin.

## Workflow

### Step 1: Gather Component Information

Read the plugin manifest and scan directories:

1. Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` for overview
2. Scan `${CLAUDE_PLUGIN_ROOT}/commands/` for available commands
3. Scan `${CLAUDE_PLUGIN_ROOT}/skills/` for available skills

### Step 2: Extract Descriptions

For each component, extract the name and description from YAML frontmatter:
- Commands: Look for `name` and `description` fields
- Skills: Look for `name` and `description` fields in SKILL.md

### Step 3: Group and Present

Present the components grouped by category:

#### Commands (Slash Commands)

List commands organized by purpose:

**Spec-Driven Development:**
- `/groundwork:design-product` - Define product requirements
- `/groundwork:design-architecture` - Design technical approach
- `/groundwork:create-tasks` - Generate implementation tasks

**Task Execution:**
- `/groundwork:work-on [N]` - Work on a specific task by number
- `/groundwork:work-on-next-task` - Work on the next task

**Quick Development:**
- `/groundwork:build-unplanned [description]` - Build a feature from description with worktree isolation and TDD

**Sync & Alignment:**
- `/groundwork:source-product-specs-from-code` - Sync specs with code changes
- `/groundwork:source-architecture-from-code` - Update architecture docs
- `/groundwork:check-specs-alignment` - Verify spec alignment (full audit)

**Code Review:**
- `/groundwork:code-review` - Review code changes

**Plugin Management:**
- `/groundwork:groundwork-check` - Validate plugin health
- `/groundwork:groundwork-help` - Show this help
- `/groundwork:skills` - List available skills

#### Skills (Invoked via Skill Tool)

Skills are invoked using the Skill tool and provide structured workflows for:
- Brainstorming and problem-solving
- Test-driven development
- Debugging and investigation
- Code review and verification
- Frontend design
- And more...

Use `/groundwork:skills` to see the full list of available skills.

### Step 4: Usage Examples

Provide usage examples:

```
/groundwork:design-product          # Start defining a new product
/groundwork:design-architecture     # Design the technical approach
/groundwork:create-tasks            # Generate implementation tasks
/groundwork:work-on-next-task       # Work on the next task
/groundwork:groundwork-check        # Check plugin health
```

### Step 5: Additional Resources

Point users to:
- `README.md` in the plugin root for full documentation
- GitHub issues for support
