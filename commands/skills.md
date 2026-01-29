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
| Planning & Design | plan, design, product, architecture, task |
| Testing & Debugging | test, debug, root-cause |
| Maintenance & Sync | sync, alignment, check, verify |
| Meta | using |

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

## Commands

Run `/help` to see all available slash commands.
```

## Example Output

```markdown
# Groundwork Skills

## Planning & Design
| Skill | Description |
|-------|-------------|
| `product-design` | Use when defining product requirements |
| `architecture` | Use when designing technical approach |
| `tasks` | Use when generating implementation tasks |

## Testing & Debugging
| Skill | Description |
|-------|-------------|
| `test-driven-development` | Use when implementing any feature |
| `root-cause-tracing` | Use when debugging issues |

---

**Total:** 10 skills available

## Commands

Run `/help` to see all available slash commands.
```

## Notes

- Skills are discovered dynamically - new skills appear automatically
- Descriptions are truncated to the first sentence for readability
- Personal skills from `~/.claude/skills/` are also discovered if present
