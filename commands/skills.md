---
name: skills
description: List all available Groundwork skills with descriptions
allowed-tools: ["Bash", "Read", "Glob"]
---

# Skills Discovery Command

Dynamically discovers and displays all available Groundwork skills.

## What to Do

1. **Discover all skills** by reading SKILL.md files from the plugin's skills directory
2. **Extract metadata** (name, description) from each skill's YAML frontmatter
3. **Categorize skills** based on their names and descriptions
4. **Display organized output** with skill names and descriptions

## Discovery Process

### Step 1: Find All Skills

Use Glob to find all SKILL.md files:
```
skills/*/SKILL.md
```

### Step 2: Extract Frontmatter

For each SKILL.md file, extract the `name` and `description` fields from the YAML frontmatter at the top of the file.

### Step 3: Categorize Skills

Group skills into categories based on keywords in their names/descriptions:

| Category | Keywords |
|----------|----------|
| Planning & Design | plan, design, product, architecture, task, brainstorm |
| Implementation | implement, develop, agent, parallel, worktree, execute |
| Testing & Debugging | test, debug, verification, anti-pattern, root-cause |
| Code Review | review, receiving, requesting |
| Maintenance & Sync | sync, finish, branch, claude-md, alignment, check |
| Learning & Context | learning, continuous, compact, retrieval, iterative |
| Problem-Solving | stuck, collision, inversion, pattern, scale, simplif |
| Meta & Design | using, writing-skills, frontend |

If a skill doesn't match any category, place it in "Other".

### Step 4: Display Output

Format the output as:

```markdown
# Groundwork Skills

## [Category Name]
| Skill | Description |
|-------|-------------|
| `skill-name` | First sentence of description |

[Repeat for each category with skills]

---

**Total:** X skills available

## Usage

Invoke a skill using the Skill tool or slash command:
- `Skill: skill-name`
- `/skill-name` (if command exists)

## Agents

Also discover and list agents from the `agents/` directory.

## Commands

Run `/help` to see all available slash commands.
```

## Example Output

```markdown
# Groundwork Skills

## Planning & Design
| Skill | Description |
|-------|-------------|
| `task-brainstorm` | Use when exploring ideas collaboratively |
| `writing-plans` | Use when you have a spec or requirements |
| `product-design` | Use when defining product requirements |

## Testing & Debugging
| Skill | Description |
|-------|-------------|
| `test-driven-development` | Use when implementing any feature |
| `systematic-debugging` | Use when encountering any bug |

---

**Total:** 34 skills available

## Agents

- `plan-adherence-reviewer` - Review code against plan and requirements
- `standards-reviewer` - Review code against project standards
- `silent-failure-hunter` - Find silent failures in error handling

## Commands

Run `/help` to see all available slash commands.
```

## Notes

- Skills are discovered dynamically - new skills appear automatically
- Descriptions are truncated to the first sentence for readability
- Personal skills from `~/.claude/skills/` are also discovered if present
