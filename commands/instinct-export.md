---
name: instinct-export
description: Export instincts for sharing with teammates or other projects
argument-hint: "[--domain <name>] [--output <file>] [--format yaml|json|md] [--project]"
allowed-tools: ["Bash", "Read", "Write", "Glob"]
---

# Instinct Export Command

Exports instincts to a shareable format. Perfect for:
- Sharing with teammates
- Transferring to a new machine
- Contributing to project conventions

## Arguments

"$ARGUMENTS"

Options:
- `--domain <name>`: Export only specified domain
- `--min-confidence <n>`: Minimum confidence threshold (default: 0.3)
- `--output <file>`: Output file path (default: instincts-export-YYYYMMDD.yaml)
- `--format <yaml|json|md>`: Output format (default: yaml)
- `--project`: Export only project-specific instincts from `.claude/instincts/`

## What to Do

1. Read instincts from:
   - `~/.claude/homunculus/instincts/personal/` (unless --project is set)
   - `.claude/instincts/` (if --project flag or if exists and no flag)

2. Filter based on flags (domain, min-confidence)

3. Strip sensitive information:
   - Remove session IDs
   - Remove absolute file paths (keep only patterns)
   - Remove old timestamps

4. Generate export file in requested format

## Output Format (YAML)

```yaml
# Instincts Export
# Generated: 2025-01-22
# Source: personal
# Count: 12 instincts

version: "2.0"
exported_by: "groundwork-continuous-learning"
export_date: "2025-01-22T10:30:00Z"

instincts:
  - id: prefer-functional-style
    trigger: "when writing new functions"
    action: "Use functional patterns over classes"
    confidence: 0.8
    domain: code-style
    observations: 8

  - id: test-first-workflow
    trigger: "when adding new functionality"
    action: "Write test first, then implementation"
    confidence: 0.9
    domain: testing
    observations: 12
```

## Privacy Considerations

Exports include:
- Trigger patterns
- Actions
- Confidence scores
- Domains
- Observation counts

Exports do NOT include:
- Actual code snippets
- File paths
- Session transcripts
- Personal identifiers

## Success Message

```
Exported 12 instincts to: instincts-export-20250122.yaml

Domains included:
  - code-style: 4 instincts
  - testing: 3 instincts
  - workflow: 5 instincts

Share this file with teammates or use /instinct-import on another machine.
```
