# Developing Skills

This guide covers how to create and modify Groundwork skills.

## Skill Structure

Each skill lives in its own directory under `skills/`:

```
skills/
└── my-skill/
    ├── SKILL.md           # Main skill file (required)
    └── references/        # Optional supporting files
        └── example.md
```

## SKILL.md Format

```markdown
---
name: my-skill
description: Use when [condition] - [what it does]
---

# Skill Title

[Skill content in markdown]
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Lowercase with hyphens (e.g., `my-skill`) |
| `description` | Yes | Must start with "Use when..." |

## Writing Good Descriptions

The description determines when Claude invokes your skill. Format:

```
Use when [trigger condition] - [outcome/purpose]
```

Examples:
- `Use when debugging test failures - systematic root cause analysis`
- `Use when creating new features - collaborative brainstorming`
- `Use when reviewing code - structured review checklist`

## Skill Content Guidelines

### Be Specific
Don't just describe what to do - provide exact steps, checklists, and examples.

### Include Verification
Add checkpoints where Claude should verify progress before continuing.

### Provide Examples
Show what good output looks like. Claude learns from examples.

### Use Checklists
```markdown
## Checklist

- [ ] Step one completed
- [ ] Step two verified
- [ ] Step three documented
```

### Reference Supporting Files
```markdown
See the example at: references/example.md
```

## Skill Types

### Rigid Skills
Follow exactly as written. Used for disciplined processes like TDD.

Mark with:
```markdown
**This is a rigid skill.** Follow steps exactly.
```

### Flexible Skills
Adapt principles to context. Used for patterns and guidelines.

Mark with:
```markdown
**This is a flexible skill.** Adapt to your context.
```

## Testing Skills

1. Create the skill file
2. Invoke it with the Skill tool
3. Verify Claude follows the workflow
4. Adjust based on results

Use the `test-driven-development` skill as a model for disciplined skill development.

## Personal Skills

Create skills in `~/.claude/skills/` to override or extend plugin skills:

```
~/.claude/skills/
└── my-custom-skill/
    └── SKILL.md
```

Personal skills with the same name as plugin skills take precedence.

## Best Practices

1. **One skill, one purpose** - Don't overload skills
2. **Clear triggers** - Make description specific
3. **Actionable steps** - Avoid vague instructions
4. **Exit criteria** - Define what "done" looks like
5. **Error handling** - Include what to do when stuck

## Validation

Run `/groundwork-check` to validate your skill:

```bash
node lib/validate-plugin.js
```

This checks:
- Valid YAML frontmatter
- Required fields present
- Description format
- File references exist
