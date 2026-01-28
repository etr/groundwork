---
name: evolve
description: Cluster related instincts into skills, commands, or agents
argument-hint: "[--execute] [--dry-run] [--domain <name>] [--threshold <n>] [--status]"
allowed-tools: ["Bash", "Read", "Glob"]
---

# Evolve Command

Analyzes instincts and clusters related ones into higher-level structures:
- **Commands**: When instincts describe user-invoked actions
- **Skills**: When instincts describe auto-triggered behaviors
- **Agents**: When instincts describe complex, multi-step processes

## Arguments

"$ARGUMENTS"

Options:
- `--execute`: Actually create the evolved structures (default is preview)
- `--dry-run`: Preview without creating (same as default)
- `--domain <name>`: Only evolve instincts in specified domain
- `--threshold <n>`: Minimum instincts required to form cluster (default: 3)
- `--status`: Show already-evolved components

## What to Do

### For --status flag:
List evolved components in `~/.claude/homunculus/evolved/`:
```bash
echo "Evolved Components:"
for type in skills commands agents; do
  dir="$HOME/.claude/homunculus/evolved/$type"
  if [ -d "$dir" ]; then
    count=$(find "$dir" -name "*.md" -o -name "SKILL.md" 2>/dev/null | wc -l)
    if [ "$count" -gt 0 ]; then
      echo ""
      echo "## ${type^} ($count)"
      find "$dir" -name "*.md" -o -name "SKILL.md" 2>/dev/null | while read f; do
        name=$(basename "$(dirname "$f")" 2>/dev/null || basename "$f" .md)
        echo "  - $name"
      done
    fi
  fi
done
```

### For evolution (default):
Run the evolution script:
```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/evolve.js" $ARGUMENTS
```

The script will:
1. Load all instincts from `~/.claude/homunculus/instincts/`
2. Cluster them by domain, trigger, and action similarity
3. Determine evolution type (command, skill, or agent) for each cluster
4. Preview or create the evolved structures

## Example Output

```
Analyzing 15 instincts...

Found 2 cluster(s) ready for evolution:

## Cluster 1: workflow-grep-read
Instincts: workflow-grep-read-edit, workflow-search-first
Type: Skill
Confidence: 72% (based on 8 observations)
Would create: ~/.claude/homunculus/evolved/skills/workflow-grep-read/SKILL.md

## Cluster 2: testing-patterns
Instincts: test-first-workflow, prefer-integration-tests
Type: Skill
Confidence: 65% (based on 5 observations)
Would create: ~/.claude/homunculus/evolved/skills/testing-patterns/SKILL.md

---
Run with --execute to create these files.
```

## Activating Evolved Components

After evolution, copy the components you want to activate:

```bash
# Activate an evolved skill
cp -r ~/.claude/homunculus/evolved/skills/my-skill ~/.claude/skills/

# Activate an evolved command
cp ~/.claude/homunculus/evolved/commands/my-command.md ~/.claude/commands/

# Activate an evolved agent
cp ~/.claude/homunculus/evolved/agents/my-agent.md ~/.claude/agents/
```

Or use `/activate-evolved` to copy specific evolved components.
