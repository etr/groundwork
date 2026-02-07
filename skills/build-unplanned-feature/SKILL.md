---
name: build-unplanned-feature
description: Use when building a feature from a description without existing task definitions - combines requirement gathering, TDD implementation, and validation
requires: understanding-feature-requests, implement-feature
user-invocable: false
---

# Build Unplanned Feature

Enables ad-hoc feature development without existing task definitions. Combines requirement gathering, worktree isolation, TDD implementation, and multi-agent validation.

## Workflow

### Step 1: Parse Feature Description

Extract the feature description from:
1. **Argument provided** - Use as initial description
2. **No argument** - Use `AskUserQuestion` to ask: "What feature would you like to build?" and **wait for user response**

Store the raw description for clarification.

### Step 2: Clarify Requirements

**You MUST call the Skill tool now:** `Skill(skill="groundwork:understanding-feature-requests")`

Do NOT attempt to gather requirements yourself. The skill handles this.

Follow the skill to gather:
- Problem being solved
- Target user/persona
- Expected outcome
- Edge cases and scope boundaries

Continue until requirements are clear and internally consistent.

### Step 3: Generate Feature Identifier

Create a feature identifier from the clarified requirements:

**Format:** `FEATURE-<slug>`

**Slug rules:**
- Lowercase, hyphen-separated
- 2-4 words maximum
- Derived from the core functionality

**Examples:**
- "Add user login" → `FEATURE-user-login`
- "Export reports to PDF" → `FEATURE-pdf-export`
- "Rate limiting for API" → `FEATURE-api-rate-limit`

### Step 4: Present Feature Summary

Present summary to the user:

```markdown
## Feature: [Feature Identifier]

### Description
[1-2 sentence summary from clarification]

### Execution Context
**Working Directory:** .worktrees/<feature-identifier>
**Branch:** feature/<feature-identifier>
**Base Branch:** [current branch]

### Requirements
- [Requirement 1]
- [Requirement 2]

### Acceptance Criteria
- [Criterion 1]
- [Criterion 2]

### Out of Scope
- [Exclusion 1]
```

Then use `AskUserQuestion` to ask:

> "Ready to begin implementation?"
> - Option 1: "Yes, begin"
> - Option 2: "No, let me review first"

**Wait for user response before proceeding.**

### Step 5: Execute Implementation

**CRITICAL INSTRUCTION: You MUST call the Skill tool now:**
  `Skill(skill="groundwork:implement-feature")`

Do NOT write implementation plans, do NOT create files, do NOT explore code, do NOT start coding. You are NOT permitted to implement the feature yourself. The implement-feature skill handles ALL implementation including worktree creation, TDD, validation, and merge. Call it NOW.

Session context provides:
- **identifier**: FEATURE-<slug>
- **title**: [Feature description summary]
- **merge-mode**: `ask`
- **action-items**: [from requirements]
- **acceptance-criteria**: [from clarification]

---

## Reference

### Branch Naming

This skill uses `feature/` prefix (not `task/`) to distinguish ad-hoc features from planned tasks:
- Planned tasks: `task/TASK-NNN`
- Ad-hoc features: `feature/FEATURE-<slug>`

### Merge Handling

The `implement-feature` skill handles merge with `merge-mode: ask`, which:
- Always prompts user for merge decision
- Provides manual merge instructions if user declines
- Handles merge conflicts gracefully

### Standalone Usage

This skill is designed for standalone use when:
- No product specs exist
- No task definitions exist
- Quick prototyping is needed
- Ad-hoc feature requests come in

For planned work with existing specs, use `groundwork:execute-task` instead.
