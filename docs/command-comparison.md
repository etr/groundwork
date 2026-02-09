# Command Comparison Guide

This guide explains when to use similar commands that serve related purposes.

## Spec Synchronization Commands

### `/groundwork:source-product-specs-from-code` vs `/groundwork:check-specs-alignment`

| Aspect | `/groundwork:source-product-specs-from-code` | `/groundwork:check-specs-alignment` |
|--------|--------------|-------------------|
| **Primary Use** | Update specs to match decisions | Full audit of code vs specs |
| **Direction** | Session decisions → Specs | Specs ← → Code |
| **Output** | Proposed PRD changes | Full alignment report |
| **Modifies Files** | Yes (specs/product_specs.md) | No (read-only analysis) |
| **Scope** | Session decisions | Entire codebase |
| **Trigger** | After product discussions | Periodic full audit |

**When to use `/groundwork:source-product-specs-from-code`:**
- After discussions that changed requirements
- When new features were decided during a session
- When scope changed ("let's defer X to v2")
- End of session to capture product decisions

**When to use `/groundwork:check-specs-alignment`:**
- Periodic full audit of codebase vs specs
- To find undocumented features in codebase
- To verify entire architecture is being followed
- When you suspect significant drift

**Typical workflow:**
```
1. Discuss product changes
2. /groundwork:source-product-specs-from-code  # Capture decisions in PRD
3. /groundwork:design-architecture             # Update architecture if needed
4. /groundwork:create-tasks                    # Generate new tasks
5. Implement tasks
6. /groundwork:check-specs-alignment           # Periodic full audit
```

---

## Task Commands

### `/groundwork:work-on` vs `/groundwork:work-on-next-task` vs `/groundwork:create-tasks`

| Aspect | `/groundwork:work-on [N]` | `/groundwork:work-on-next-task` | `/groundwork:create-tasks` |
|--------|------------|--------------|----------|
| **Primary Use** | Work on specific task | Work on next available | Generate task list |
| **Input Required** | Task number | None | PRD + Architecture |
| **Selection** | User specifies | Auto-selects first unblocked | Creates all tasks |
| **Modifies Tasks** | Yes (status updates) | Yes (status updates) | Yes (creates file) |

**When to use `/groundwork:create-tasks`:**
- Starting a new project (after PRD + architecture)
- PRD or architecture significantly changed
- Need to regenerate the entire task list

**When to use `/groundwork:work-on-next-task`:**
- Working through tasks in sequence
- Don't care which specific task to work on
- Want automatic selection of unblocked work

**When to use `/groundwork:work-on [N]`:**
- Want to work on a specific task
- Skipping around the task list
- Returning to a partially completed task
- Need to work on a blocked task (with override)

**Typical workflow:**
```
1. /groundwork:design-product          # Create PRD
2. /groundwork:design-architecture     # Design architecture
3. /groundwork:create-tasks            # Generate task list
4. /groundwork:work-on-next-task       # Start first task
5. ... complete task ...
6. /groundwork:work-on-next-task       # Continue to next
   OR
6. /groundwork:work-on 7               # Jump to specific task
```

---

## Quick Reference

| If you want to... | Use this command |
|-------------------|------------------|
| Update PRD after product discussion | `/groundwork:source-product-specs-from-code` |
| Full audit of code vs specs | `/groundwork:check-specs-alignment` |
| Generate tasks from specs | `/groundwork:create-tasks` |
| Work on next available task | `/groundwork:work-on-next-task` |
| Work on a specific task | `/groundwork:work-on [N]` |
| Re-run multi-agent verification | `/groundwork:validate` |
| Systematic debugging | `/groundwork:debug` |
| Build ad-hoc feature from description | `/groundwork:build-unplanned` |

---

## Ad-hoc vs Planned Implementation

### `/groundwork:build-unplanned` vs `/groundwork:work-on`

| Aspect | `/groundwork:build-unplanned` | `/groundwork:work-on [N]` |
|--------|-------------------------------|---------------------------|
| **Primary Use** | Build feature from description | Execute a planned task |
| **Input Required** | Feature description | Task number from specs/tasks.md |
| **Prerequisites** | None | PRD + Architecture + Task list |
| **Planning** | Inline (gathers requirements on the fly) | Pre-planned in task definitions |
| **Verification** | Built-in validation loop | Task-level verification |

**When to use `/groundwork:build-unplanned`:**
- Quick feature that doesn't warrant full spec workflow
- Prototyping or exploratory work
- One-off changes outside the current task list

**When to use `/groundwork:work-on [N]`:**
- Feature is already defined in the task list
- Working within an established project plan
- Need traceability back to specs and architecture
