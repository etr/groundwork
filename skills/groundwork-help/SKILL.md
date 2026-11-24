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

Build the list from what Step 1 and Step 2 found — never from memory. A memorized list goes stale the moment a skill is added, and a partial one hides skills the user cannot discover any other way.

- **User-invocable skills** — every scanned skill *without* `user-invocable: false` in its frontmatter — go in the user-facing list, grouped by purpose, each shown as `/groundwork:<name> [args] - <first sentence of its description>`. Before presenting, count the entries against the scan: the list carries exactly as many as there are user-invocable skills.
- **Hidden library skills** — those with `user-invocable: false` — are summarized in one sentence, not listed one by one.

Group by purpose (the lifecycle order is a reliable default). Shape of the output:

#### User-invocable skills (`/groundwork:<name>`)

**Spec-Driven Development:**
- `/groundwork:design-product` - Define product requirements
- `/groundwork:design-architecture` - Design technical approach

**…**
(one group per purpose, in the same shape)

#### Hidden library skills

Summarize the `user-invocable: false` skills the scan found (for example `test-driven-development`, `use-git-worktree`, `using-groundwork`): they are not on the slash menu and are invoked only by other skills or by the model. Use `/groundwork:skills` to see the full list of skills.

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
