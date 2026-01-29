# Command Comparison Guide

This guide explains when to use similar commands that serve related purposes.

## Spec Synchronization Commands

### `/sync-specs` vs `/check-alignment` vs `/verify`

| Aspect | `/sync-specs` | `/check-alignment` | `/verify` |
|--------|--------------|-------------------|-----------|
| **Primary Use** | Update specs to match decisions | Full audit of code vs specs | Quick checkpoint for current work |
| **Direction** | Session decisions → Specs | Specs ← → Code | Current task → Specs |
| **Output** | Proposed PRD changes | Full alignment report | Pass/fail recommendation |
| **Modifies Files** | Yes (specs/product_specs.md) | No (read-only analysis) | No (read-only analysis) |
| **Scope** | Session decisions | Entire codebase | Current task or recent changes |
| **Trigger** | After product discussions | Periodic full audit | Before completing a task |

**When to use `/sync-specs`:**
- After discussions that changed requirements
- When new features were decided during a session
- When scope changed ("let's defer X to v2")
- End of session to capture product decisions

**When to use `/check-alignment`:**
- Periodic full audit of codebase vs specs
- To find undocumented features in codebase
- To verify entire architecture is being followed
- When you suspect significant drift

**When to use `/verify`:**
- Before marking a task complete
- Before committing changes
- When unsure if current work matches specs
- Quick sanity check during implementation

**Typical workflow:**
```
1. Discuss product changes
2. /sync-specs              # Capture decisions in PRD
3. /architecture            # Update architecture if needed
4. /tasks                   # Generate new tasks
5. Implement a task
6. /verify                  # Quick check before completing
7. ... more tasks ...
8. /check-alignment         # Periodic full audit
```

---

## Task Commands

### `/task` vs `/next-task` vs `/tasks`

| Aspect | `/task [N]` | `/next-task` | `/tasks` |
|--------|------------|--------------|----------|
| **Primary Use** | Work on specific task | Work on next available | Generate task list |
| **Input Required** | Task number | None | PRD + Architecture |
| **Selection** | User specifies | Auto-selects first unblocked | Creates all tasks |
| **Modifies Tasks** | Yes (status updates) | Yes (status updates) | Yes (creates file) |

**When to use `/tasks`:**
- Starting a new project (after PRD + architecture)
- PRD or architecture significantly changed
- Need to regenerate the entire task list

**When to use `/next-task`:**
- Working through tasks in sequence
- Don't care which specific task to work on
- Want automatic selection of unblocked work

**When to use `/task [N]`:**
- Want to work on a specific task
- Skipping around the task list
- Returning to a partially completed task
- Need to work on a blocked task (with override)

**Typical workflow:**
```
1. /product-design          # Create PRD
2. /architecture            # Design architecture
3. /tasks                   # Generate task list
4. /next-task               # Start first task
5. ... complete task ...
6. /next-task               # Continue to next
   OR
6. /task 7                  # Jump to specific task
```

---

## Quick Reference

| If you want to... | Use this command |
|-------------------|------------------|
| Review a PR on GitHub | `/code-review` |
| Update PRD after product discussion | `/sync-specs` |
| Full audit of code vs specs | `/check-alignment` |
| Quick check before completing task | `/verify` |
| Generate tasks from specs | `/tasks` |
| Work on next available task | `/next-task` |
| Work on a specific task | `/task [N]` |
