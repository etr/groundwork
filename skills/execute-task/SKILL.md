---
name: execute-task
description: Three-phase task execution workflow (plan → implement → complete).
---

# Execute Task

This skill orchestrates task execution through three phases:

```
execute-task-plan     →  execute-task-implement  →  execute-task-complete
(main workspace)         (worktree)                  (finalization)
```

## Start the Workflow

Invoke the planning phase with the task identifier:

```
Skill(skill="groundwork:execute-task-plan", args="[task-id-from-args]")
```

The planning phase will:
1. Parse and validate the task
2. Load project context
3. Call the Plan agent
4. Present summary for your approval

After approval, it chains to `execute-task-implement`, then `execute-task-complete`.

## Phase Summary

| Phase | Location | Purpose |
|-------|----------|---------|
| `execute-task-plan` | Main workspace | Load context, create plan, get approval |
| `execute-task-implement` | Worktree | Create worktree, TDD execution, validation |
| `execute-task-complete` | Worktree → Main | Mark complete, merge, offer next task |

## Why Three Phases?

1. **Natural breakpoints** - Each phase transition is explicit
2. **Plan approval before worktree** - No wasted worktrees for rejected plans
3. **Clear responsibilities** - Each phase has one job
