# Command Comparison Guide

This guide explains when to use similar commands that serve related purposes.

## Code Review Commands

### `/code-review` vs `/review-pr`

| Aspect | `/code-review` | `/review-pr` |
|--------|---------------|--------------|
| **Primary Use** | Review PRs on GitHub and post comments | Local PR review before pushing |
| **Target** | Existing GitHub PR | Local changes (staged/unstaged) |
| **Output** | Comments posted to GitHub PR | Summary report in terminal |
| **Review Approach** | 5 parallel Sonnet agents focused on bugs + CLAUDE.md | Specialized agents for different aspects |
| **Agents Used** | Custom bug-finding agents | comment-analyzer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, standards-reviewer, code-simplifier |
| **GitHub Integration** | Posts findings as PR comments | No automatic GitHub integration |
| **Confidence Filtering** | Filters issues below 80% confidence | All findings reported |

**When to use `/code-review`:**
- PR already exists on GitHub
- You want findings posted as PR comments
- Reviewing someone else's PR
- CI/CD integration for automated reviews

**When to use `/review-pr`:**
- Before creating a PR (catch issues early)
- Want comprehensive review (tests, types, comments, errors)
- Reviewing your own changes locally
- Need to run specific review aspects (e.g., just tests or just errors)

**Typical workflow:**
```
1. Write code
2. /review-pr code errors    # Quick local check
3. Fix issues found
4. /review-pr all            # Comprehensive review before PR
5. Create PR
6. /code-review              # Post review comments to GitHub
```

---

## Spec Synchronization Commands

### `/sync-specs` vs `/check-alignment`

| Aspect | `/sync-specs` | `/check-alignment` |
|--------|--------------|-------------------|
| **Primary Use** | Update specs to match decisions | Check code matches specs |
| **Direction** | Session decisions → Specs | Specs ← → Code |
| **Output** | Proposed PRD changes | Alignment report |
| **Modifies Files** | Yes (specs/product_specs.md) | No (read-only analysis) |
| **Trigger** | After product discussions | After implementation |

**When to use `/sync-specs`:**
- After discussions that changed requirements
- When new features were decided during a session
- When scope changed ("let's defer X to v2")
- End of session to capture product decisions

**When to use `/check-alignment`:**
- After implementing features
- Before marking tasks complete
- To find undocumented features in codebase
- To verify code follows architecture decisions

**Typical workflow:**
```
1. Discuss product changes
2. /sync-specs              # Capture decisions in PRD
3. /architecture            # Update architecture if needed
4. /tasks                   # Generate new tasks
5. Implement features
6. /check-alignment         # Verify implementation matches specs
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
| Review local changes before PR | `/review-pr` |
| Update PRD after product discussion | `/sync-specs` |
| Check if code matches specs | `/check-alignment` |
| Generate tasks from specs | `/tasks` |
| Work on next available task | `/next-task` |
| Work on a specific task | `/task [N]` |
