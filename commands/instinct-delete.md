---
name: instinct-delete
description: Delete an instinct by ID
argument-hint: "<instinct-id> [--force]"
allowed-tools: ["Bash", "Read", "Glob"]
---

# Instinct Delete Command

Delete an instinct by its ID from personal, inherited, or project instincts.

## Arguments

"$ARGUMENTS"

The first argument should be the instinct ID to delete.

Options:
- `--force`: Delete without confirmation prompt

## What to Do

1. Parse the instinct ID from arguments. If no ID provided, show error and usage.

2. Search for the instinct file in:
   - `~/.claude/homunculus/instincts/personal/` (personal instincts)
   - `~/.claude/homunculus/instincts/inherited/` (imported instincts)
   - `.claude/instincts/` (project-specific instincts, if exists)

3. Match files by checking:
   - Filename matches `<instinct-id>.md`
   - Or frontmatter `id` field matches `<instinct-id>`

4. If no matching instinct found:
   ```
   Error: Instinct not found: <instinct-id>

   Run /instinct-status to see available instincts.
   ```

5. If found, display instinct details:
   ```
   Found instinct: prefer-functional-style
   Location: ~/.claude/homunculus/instincts/personal/prefer-functional-style.md

   Trigger: when writing new functions
   Action: Use functional patterns over classes
   Confidence: 80%

   Delete this instinct? [y/N]
   ```

6. Unless `--force` is set, ask for confirmation via AskUserQuestion tool

7. Delete the file using Bash `rm` command

8. Report success:
   ```
   Deleted instinct: prefer-functional-style
   ```

## Error Handling

- If multiple instincts match (shouldn't happen), show all matches and ask which to delete
- If instinct is in inherited/, warn that it came from an import and may be re-imported
