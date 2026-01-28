---
name: instinct-status
description: Show all learned instincts with their confidence levels
argument-hint: "[--domain <name>] [--low-confidence] [--high-confidence] [--analyze] [--json]"
allowed-tools: ["Bash", "Read", "Glob"]
---

# Instinct Status Command

Shows all learned instincts with their confidence scores, grouped by domain.

## Arguments

"$ARGUMENTS"

Options:
- `--domain <name>`: Filter by domain (code-style, testing, git, etc.)
- `--low-confidence`: Show only instincts with confidence < 0.5
- `--high-confidence`: Show only instincts with confidence >= 0.7
- `--analyze`: Trigger immediate observation analysis
- `--json`: Output as JSON for programmatic use

## What to Do

1. Check if the homunculus directory exists: `~/.claude/homunculus/instincts/`
   - If not, inform user to set up continuous-learning first

2. Read all instinct files from:
   - `~/.claude/homunculus/instincts/personal/` (user's learned instincts)
   - `~/.claude/homunculus/instincts/inherited/` (imported instincts)
   - `.claude/instincts/` (project-specific instincts, if exists)

3. Parse each `.md` file's frontmatter for:
   - `id`: Instinct identifier
   - `trigger`: When it activates
   - `confidence`: Score 0.0-1.0
   - `domain`: Category (code-style, testing, git, workflow, etc.)
   - `source`: Where it came from

4. Group by domain and display with confidence bars

5. If --analyze flag is set:
   - Run the observation analyzer: `node ${CLAUDE_PLUGIN_ROOT}/lib/analyze-observations.js --verbose`
   - The analyzer will:
     - Read observations from `~/.claude/homunculus/observations.jsonl`
     - Detect patterns (workflows, tool preferences, error resolutions)
     - Create/update instinct files in `~/.claude/homunculus/instincts/personal/`
   - Report the analysis results (patterns found, instincts created/updated)

6. If project has `.claude/instincts/`:
   - Show project-specific instincts in a separate "Project Instincts" section
   - Clearly distinguish from personal/inherited instincts

## Output Format

```
Instinct Status
==================

## Code Style (4 instincts)

### prefer-functional-style
Trigger: when writing new functions
Action: Use functional patterns over classes
Confidence: [########--] 80%
Source: session-observation | Last updated: 2025-01-22

### use-path-aliases
Trigger: when importing modules
Action: Use @/ path aliases instead of relative imports
Confidence: [######----] 60%
Source: inherited (github.com/acme/webapp)

## Testing (2 instincts)

### test-first-workflow
Trigger: when adding new functionality
Action: Write test first, then implementation
Confidence: [#########-] 90%
Source: session-observation

---
## Project Instincts (2 instincts)
[Only shown if .claude/instincts/ exists in current directory]

### use-zod-validation
Trigger: when validating user input
Action: Use zod for runtime validation
Confidence: [########--] 80%
Source: project-specific

---
Total: 11 instincts (4 personal, 5 inherited, 2 project)
```

## If No Instincts Found

```
No instincts found.

To start learning, ensure continuous-learning hooks are configured.
See the continuous-learning skill for setup instructions.
```
