# `skills`

> **Run it:** `/groundwork:skills` · **Tier:** user-run · **Reads:** every `SKILL.md` it finds — the `name` and `description` in each frontmatter · **Writes:** nothing; the list is the output

## What it does

Prints an inventory of the Groundwork skills, each with the first sentence of its description. It globs for `SKILL.md` files, reads the frontmatter, sorts the skills into categories by keyword, and shows one table per category with a total at the end. The list is read from disk on every run, not recited.

## When to reach for it

- You want to know which skills exist and what each one is for.
- You want the complete list, including the skills that cannot be typed as slash commands.
- **Not when:** you want the short overview — only the skills you can type, plus usage examples and where to read more. That is `groundwork-help`.

## Common questions

**Why is every description a single sentence?**

By design. Descriptions are truncated to the first sentence for readability.

**A skill was just added, or I keep my own under `~/.claude/skills/`. Will it show?**

Yes. Discovery is dynamic, so new skills appear automatically, and personal skills from `~/.claude/skills/` are also discovered if present.

**Why is `improve-codebase-architecture` under Upkeep instead of Planning & Design?**

The Upkeep row is matched first, and the keyword table says so in as many words. Categories come from keywords in a skill's name and description; a skill that matches no row goes to "Other".

**How do I run one once I have found it?**

Through the Skill tool (`Skill: skill-name`) or as `/groundwork:skill-name`, unless the skill is `user-invocable: false`. The output closes by pointing to `/help` for all available slash commands.

## It's working if

- A Glob for `${CLAUDE_PLUGIN_ROOT}/skills/*/SKILL.md` ran before the list appeared (and `~/.claude/skills/*/SKILL.md` alongside it, for personal skills).
- The output is headed `# Groundwork Skills`, with one table per category and the columns `Skill` and `Description`.
- Every row shows the skill name in backticks and the first sentence of its description.
- The categories are the keyword table's: Upkeep, Planning & Design, Testing & Verification, Maintenance & Sync, Meta — with anything unmatched under "Other".
- `improve-codebase-architecture` sits under Upkeep.
- The list ends with `**Total:** X skills available`.

**It is not working if:** the list arrived with no search for `SKILL.md` files behind it, or a description runs on past its first sentence.
