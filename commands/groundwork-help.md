---
name: groundwork-help
description: List all Groundwork commands and skills with descriptions
allowed-tools: ["Glob", "Read", "Grep"]
---

# Groundwork Help

Lists all available commands, skills, and agents provided by the Groundwork plugin.

## Workflow

### Step 1: Gather Component Information

Read the plugin manifest and scan directories:

1. Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` for overview
2. Scan `${CLAUDE_PLUGIN_ROOT}/commands/` for available commands
3. Scan `${CLAUDE_PLUGIN_ROOT}/skills/` for available skills
4. Scan `${CLAUDE_PLUGIN_ROOT}/agents/` for available agents

### Step 2: Extract Descriptions

For each component, extract the name and description from YAML frontmatter:
- Commands: Look for `name` and `description` fields
- Skills: Look for `name` and `description` fields in SKILL.md
- Agents: Look for `name` and `description` fields

### Step 3: Group and Present

Present the components grouped by category:

#### Commands (Slash Commands)

List commands organized by purpose:

**Spec-Driven Development:**
- `/product-design` - Define product requirements
- `/architecture` - Design technical approach
- `/tasks` - Generate implementation tasks
- `/next-task` - Work on the next task

**Planning & Execution:**
- `/write-plan` - Create implementation plans
- `/execute-plan` - Execute plans step by step
- `/task-brainstorm` - Brainstorm task approaches

**Sync & Alignment:**
- `/sync-specs` - Sync specs with code changes
- `/sync-architecture` - Update architecture docs
- `/check-alignment` - Verify spec alignment

**Code Review:**
- `/code-review` - Review code changes
- `/review-pr` - Review pull requests

**Plugin Management:**
- `/groundwork-check` - Validate plugin health
- `/groundwork-help` - Show this help
- `/skills` - List available skills

**Continuous Learning:**
- `/instinct-status` - Check learning status
- `/instinct-export` - Export learned instincts
- `/instinct-import` - Import instincts
- `/evolve` - Manage evolved components

#### Skills (Invoked via Skill Tool)

Skills are invoked using the Skill tool and provide structured workflows for:
- Brainstorming and problem-solving
- Test-driven development
- Debugging and investigation
- Code review and verification
- Frontend design
- And more...

Use `/skills` to see the full list of available skills.

#### Agents (Background/Review Agents)

Agents are specialized reviewers used via the Task tool:
- `plan-adherence-reviewer` - Reviews code against plan/requirements
- `standards-reviewer` - Reviews code against project standards
- `code-simplifier` - Simplifies and refines code
- And others...

### Step 4: Usage Examples

Provide usage examples:

```
/product-design          # Start defining a new product
/architecture            # Design the technical approach
/tasks                   # Generate implementation tasks
/next-task               # Work on the next task
/write-plan feature.md   # Create a plan for a feature
/execute-plan            # Execute the current plan
/groundwork-check        # Check plugin health
```

### Step 5: Additional Resources

Point users to:
- `README.md` in the plugin root for full documentation
- The `using-groundwork` skill for workflow guidance
- GitHub issues for support
