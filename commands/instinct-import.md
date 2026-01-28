---
name: instinct-import
description: Import instincts from teammates or other sources
argument-hint: "<file-or-url> [--dry-run] [--force] [--merge-strategy higher|local|import] [--project]"
allowed-tools: ["Bash", "Read", "Write", "Glob", "WebFetch"]
---

# Instinct Import Command

Import instincts from:
- Teammates' exports
- Community collections
- Previous machine backups

## Arguments

"$ARGUMENTS"

The first argument should be a file path or URL to import from.

Options:
- `--dry-run`: Preview without importing
- `--force`: Import even if conflicts exist
- `--merge-strategy <higher|local|import>`: How to handle duplicates
- `--min-confidence <n>`: Only import instincts above threshold
- `--project`: Import into project instincts at `.claude/instincts/` instead of personal

## What to Do

1. Fetch the instinct file (local path or URL)

2. Parse and validate the format (YAML or JSON)

3. Load existing instincts from:
   - `~/.claude/homunculus/instincts/personal/`
   - `~/.claude/homunculus/instincts/inherited/`

4. For each instinct to import, check for **trigger overlap**:
   - Compare `trigger` patterns against existing instincts
   - Look for semantic overlaps (e.g., "when writing tests" vs "before testing")
   - Flag instincts that would fire on similar conditions

5. Check for duplicates and conflicts:
   - **New**: No trigger overlap, add to inherited/
   - **Duplicate**: Same or very similar trigger, keep higher confidence version
   - **Conflict**: Triggers overlap but actions contradict, skip and flag

6. For conflicts, ask user how to proceed:
   - **Skip**: Don't import the conflicting instinct
   - **Override**: Replace existing with imported instinct
   - **Merge**: Combine both instincts (requires manual review)

7. Save imported instincts to:
   - `~/.claude/homunculus/instincts/inherited/` (default)
   - `.claude/instincts/` (if --project flag is set)

## Import Process Output

```
Importing instincts from: team-instincts.yaml
================================================

Found 12 instincts to import.

Analyzing conflicts...

## New Instincts (8)
These will be added:
  + use-zod-validation (confidence: 0.7)
  + prefer-named-exports (confidence: 0.65)
  + test-async-functions (confidence: 0.8)
  ...

## Duplicate Instincts (3)
Already have similar instincts:
  ~ prefer-functional-style
    Local: 0.8 confidence, 12 observations
    Import: 0.7 confidence
    -> Keep local (higher confidence)

  ~ test-first-workflow
    Local: 0.75 confidence
    Import: 0.9 confidence
    -> Update to import (higher confidence)

## Trigger Overlap Detected (2)
These instincts have overlapping triggers:
  ? prefer-async-await
    Overlaps with: use-promises
    Triggers: "when writing async code" (similar)
    -> Choose: [skip] [override] [merge]

  ? test-edge-cases
    Overlaps with: comprehensive-testing
    Triggers: "when writing tests" (subset)
    -> Auto-merge: broader instinct takes precedence

## Conflicting Instincts (1)
These contradict local instincts:
  ! use-classes-for-services
    Conflicts with: avoid-classes
    Actions are mutually exclusive
    -> Skip (requires manual resolution)

---
Proceed with import? (8 new, 1 update, 3 skip)
```

## Merge Strategies

### For Duplicates
When importing an instinct that matches an existing one:
- **Higher confidence wins**: Keep the one with higher confidence
- **Merge evidence**: Combine observation counts
- **Update timestamp**: Mark as recently validated

### For Conflicts
When importing an instinct that contradicts an existing one:
- **Skip by default**: Don't import conflicting instincts
- **Flag for review**: Mark both as needing attention
- **Manual resolution**: User decides which to keep

## Source Tracking

Imported instincts are marked with:
```yaml
source: "inherited"
imported_from: "team-instincts.yaml"
imported_at: "2025-01-22T10:30:00Z"
```

## Success Message

```
Import complete!

Added: 8 instincts
Updated: 1 instinct
Skipped: 3 instincts (2 duplicates, 1 conflict)

Instincts saved to: ~/.claude/homunculus/instincts/inherited/

Run /instinct-status to see all instincts.
```
