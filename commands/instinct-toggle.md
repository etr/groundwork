---
name: instinct-toggle
description: Enable or disable an instinct
argument-hint: "<instinct-id> [--enable|--disable]"
allowed-tools: ["Bash", "Read", "Write", "Glob"]
---

# Instinct Toggle Command

Enable or disable an instinct without deleting it.

## Arguments

"$ARGUMENTS"

The first argument should be the instinct ID to toggle.

Options:
- `--enable`: Explicitly enable the instinct (remove `enabled: false`)
- `--disable`: Explicitly disable the instinct (add `enabled: false`)
- Without flags: Toggle current state

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

5. Read the instinct file and parse frontmatter

6. Determine new state:
   - If `--enable`: ensure `enabled` field is removed or set to `true`
   - If `--disable`: set `enabled: false` in frontmatter
   - If neither flag: toggle current state

7. Update the frontmatter in the file:
   - If disabling: add `enabled: false` after the `id` line
   - If enabling: remove `enabled: false` line if present

8. Report new state:
   ```
   Instinct prefer-functional-style is now DISABLED
   ```
   or
   ```
   Instinct prefer-functional-style is now ENABLED
   ```

## Frontmatter Changes

### Disabling an instinct:

Before:
```yaml
---
id: prefer-functional-style
trigger: "when writing new functions"
confidence: 0.8
---
```

After:
```yaml
---
id: prefer-functional-style
enabled: false
trigger: "when writing new functions"
confidence: 0.8
---
```

### Enabling an instinct:

Remove the `enabled: false` line (or set to `enabled: true`).

## Notes

- Disabled instincts are still visible in `/instinct-status` but marked as disabled
- Disabled instincts don't influence Claude's behavior
- Use this instead of `/instinct-delete` when you want to temporarily turn off an instinct
