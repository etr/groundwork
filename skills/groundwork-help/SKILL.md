---
name: groundwork-help
description: List all Groundwork skills with descriptions. Usage /groundwork:groundwork-help
allowed-tools: ["Glob", "Read", "Grep", "Skill"]
disable-model-invocation: true
---

# Groundwork Help

Lists all available skills and agents provided by the Groundwork plugin. Every Groundwork
capability is a skill, invoked either as `/groundwork:<name>` or automatically by the model.

## Workflow

### Step 1: Gather Component Information

Read the plugin manifest and scan directories:

1. Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` for overview
2. Scan `${CLAUDE_PLUGIN_ROOT}/skills/` for available skills (each `<name>/SKILL.md`)
3. Scan `${CLAUDE_PLUGIN_ROOT}/agents/` for available verification/research agents

### Step 2: Extract Descriptions

For each skill, extract the `name` and `description` from the SKILL.md YAML frontmatter. Note its
invocation tier from the frontmatter:
- `disable-model-invocation: true` → user-only slash workflow
- `user-invocable: false` → hidden library skill (model/other-skill use only)
- neither → dual (user slash + model auto)

### Step 3: Group and Present

Present the skills grouped by purpose. Hide `user-invocable: false` library skills from the
user-facing list (they are internal). Example grouping:

#### User-invocable skills (`/groundwork:<name>`)

List skills organized by purpose:

**Spec-Driven Development:**
- `/groundwork:design-product` - Define product requirements
- `/groundwork:design-architecture` - Design technical approach
- `/groundwork:create-tasks` - Generate implementation tasks

**Task Execution:**
- `/groundwork:work-on [N]` - Work on a specific task by number
- `/groundwork:work-on-next-task` - Work on the next task
- `/groundwork:plan-task [N or description]` - Plan a task or feature without implementing
- `/groundwork:implement-task [N or plan-path]` - Implement a previously planned task

**Quick Development:**
- `/groundwork:build-unplanned [description]` - Build a feature from description with worktree isolation and TDD

**Sync & Alignment:**
- `/groundwork:source-product-specs-from-code` - Sync specs with code changes
- `/groundwork:source-architecture-from-code` - Update architecture docs
- `/groundwork:check-specs-alignment` - Verify spec alignment (full audit)
- `/groundwork:split-specs` - Convert single-file PRD into directory format
- `/groundwork:split-architecture` - Convert single-file architecture doc into directory format

**Plugin Management:**
- `/groundwork:groundwork-check` - Validate plugin health
- `/groundwork:groundwork-help` - Show this help
- `/groundwork:skills` - List available skills

**Debugging:**
- `/groundwork:debug [description]` - Systematic root-cause debugging
- `/groundwork:swarm-debug [description]` - Parallel adversarial hypothesis investigation

**Design & UX:**
- `/groundwork:ux-design` - Establish a design system

#### Hidden library skills

Some skills (e.g. `test-driven-development`, `understanding-feature-requests`,
`use-git-worktree`, `using-groundwork`, `task-validation-loop`) are `user-invocable: false`:
they are not on the slash menu and are invoked only by other skills or by the model. Use
`/groundwork:skills` to see the full list of skills.

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
