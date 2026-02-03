---
name: build-unplanned-feature
description: Use when building a feature from a description without existing task definitions - combines requirement gathering, worktree isolation, TDD implementation, and validation
requires: understanding-feature-requests, use-git-worktree, implement-feature
---

# Build Unplanned Feature

Enables ad-hoc feature development without existing task definitions. Combines requirement gathering, worktree isolation, TDD implementation, and multi-agent validation.

## Workflow

### Step 1: Parse Feature Description

Extract the feature description from:
1. **Argument provided** - Use as initial description
2. **No argument** - Prompt user: "What feature would you like to build?"

Store the raw description for clarification.

### Step 2: Clarify Requirements

Invoke: `Skill(skill="groundwork:understanding-feature-requests")`

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

### Step 4: Create Worktree

Invoke: `Skill(skill="groundwork:use-git-worktree", args="<feature-identifier>")`

**Note:** The skill will create:
- Branch: `feature/<feature-identifier>` (not `task/`)
- Worktree: `.worktrees/<feature-identifier>`

Wait for worktree creation to complete and baseline tests to pass.

### Step 5: Present Feature Summary

Present summary and wait for user confirmation before implementation:

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

Ready to begin implementation?
```

**Wait for user confirmation before proceeding.**

### Step 6: Execute Implementation

Invoke: `Skill(skill="groundwork:implement-feature")`

The skill will:
1. Use requirements and acceptance criteria from session context (Step 5)
2. Execute TDD workflow for each requirement
3. Run multi-agent validation
4. Report completion

### Step 7: Finalize Changes

After `implement-feature` returns successfully:

1. **Verify all changes committed:**
   ```bash
   git status --porcelain
   ```

2. **If uncommitted changes exist:**
   - Stage and commit with descriptive message
   - Use feature identifier in commit message

### Step 8: Report Completion

Report worktree location and offer to merge:

```markdown
## Feature Complete

**Feature:** [Feature Identifier]
**Location:** .worktrees/<feature-identifier>
**Branch:** feature/<feature-identifier>

### What was built
- [Summary of implementation]

### Files modified
- `path/to/file` - [description]

### Tests added
- `path/to/test` - [what it tests]

### Acceptance criteria verified
- [x] [Criterion] - [How verified]
```

**Ask the user:**

> "Would you like me to merge this feature into [base-branch] now?
> 1. Yes, merge now
> 2. No, I'll merge manually later"

**If user chooses "Yes, merge now":**

1. Return to original repository
2. Checkout base branch
3. Merge: `git merge --no-ff feature/<feature-identifier> -m "Merge feature/<feature-identifier>: [Title]"`
4. If success: Remove worktree and delete branch
5. If conflicts: Report conflicts and keep worktree for manual resolution

**If user chooses "No" or merge has conflicts:**

Provide manual merge instructions:

```markdown
### To merge when ready

```bash
git checkout [base-branch]
git merge --no-ff feature/<feature-identifier>
git worktree remove .worktrees/<feature-identifier>
git branch -d feature/<feature-identifier>
```

### To continue working

```bash
cd .worktrees/<feature-identifier>
```
```

---

## Reference

### Branch Naming

This skill uses `feature/` prefix (not `task/`) to distinguish ad-hoc features from planned tasks:
- Planned tasks: `task/TASK-NNN`
- Ad-hoc features: `feature/FEATURE-<slug>`

### Merge Handling

This skill offers to merge at completion but requires explicit user confirmation. This provides:
- Opportunity to review changes before integration
- Ability to make adjustments if needed
- Clear separation between "done" and "merged"

### Standalone Usage

This skill is designed for standalone use when:
- No product specs exist
- No task definitions exist
- Quick prototyping is needed
- Ad-hoc feature requests come in

For planned work with existing specs, use `groundwork:execute-task` instead.
