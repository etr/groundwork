---
name: verify
description: Use when user invokes `/verify` or asks to verify work, check completion, validate task is done, or assess readiness before committing
---

# Verify Skill

Quick verification checkpoint for plan adherence and completion assessment before marking work complete.

## When to Use

- Before marking a task complete
- When unsure if implementation matches specs
- Before committing changes
- When asked "am I done?"

## Workflow

### Step 1: Identify Verification Scope

Determine what's being verified based on context:

**Option A: Current Task**
- Read `specs/tasks.md` and find task with `**Status:** In Progress`
- Load the task's goal, action items, and acceptance criteria

**Option B: Recent Changes**
- Run `git diff` to see uncommitted changes
- Run `git diff --cached` to see staged changes
- Identify the files and functionality affected

**Option C: User-Specified Scope**
- User names specific files, features, or task numbers
- Focus verification on those areas

If multiple apply, verify all relevant scopes.

### Step 2: Check Plan Adherence

Load relevant specs:
- `specs/product_specs.md` - PRD with EARS requirements
- `specs/architecture.md` - Architecture decisions

**If specs files are missing:**
- Report which files exist and which are missing
- Suggest commands to create missing files:
  - PRD missing: "Run `/product-design` to create the PRD"
  - Architecture missing: "Run `/architecture` to create the architecture"
  - Tasks missing: "Run `/tasks` to generate the task list"
- If only checking recent changes (no task context), proceed with code review only

For the current task or recent changes, verify:

1. **EARS Requirement Coverage**
   - Which EARS requirements does this work address?
   - Are all relevant requirements satisfied?
   - Are "Unwanted" requirements (error handling, edge cases) addressed?

2. **Architecture Alignment**
   - Does implementation follow documented decisions?
   - Are the right components/patterns used?
   - Any deviation from architecture that needs documenting?

**Report format:**
```markdown
### Plan Adherence

**Relevant Requirements:**
- PRD-XXX-REQ-001: [status]
- PRD-XXX-REQ-002: [status]

**Architecture Decisions:**
- DR-001: [aligned/deviated]

**Issues Found:**
- [Any misalignment or gaps]
```

### Step 3: Check Acceptance Criteria

If a task is in progress, verify each acceptance criterion:

```markdown
### Acceptance Criteria Check

| Criterion | Status | Evidence |
|-----------|--------|----------|
| [Criterion 1] | Pass/Fail | [How verified] |
| [Criterion 2] | Pass/Fail | [How verified] |
| [Criterion 3] | Pass/Fail | [How verified] |

**Result:** [N/M] criteria passed
```

**Verification methods:**
- Read implementation code
- Run relevant tests
- Check logs/output
- Manual inspection

### Step 4: Quick Code Review

Review changes using:
- `git diff` - Uncommitted, unstaged changes
- `git diff --cached` - Staged changes ready for commit
- `git diff HEAD~1` - If recent commit needs review

Focus on files identified in Step 1.

Review for common issues:

**Functionality:**
- Does the code do what it's supposed to?
- Are edge cases handled?
- Is error handling appropriate?

**Alignment:**
- Does naming match specs terminology?
- Are the right abstractions used per architecture?

**Obvious Issues:**
- Missing null checks for external data
- Unhandled promise rejections
- Missing validation at system boundaries
- Hardcoded values that should be configurable

**Do NOT review:**
- Style/formatting (defer to linters)
- Minor refactoring opportunities
- "Nice to have" improvements

Keep this light - it's a checkpoint, not a full code review.

### Step 5: Report and Recommend

Present findings with clear recommendation:

```markdown
## Verification Summary

**Scope:** [Task name or "Recent changes to X"]

### Results

| Check | Status |
|-------|--------|
| Plan Adherence | Pass/Issues Found |
| Acceptance Criteria | [N/M] Passed |
| Code Review | Pass/Issues Found |

### Issues Found
[List any issues, or "None - ready to complete"]

### Recommendation

[One of:]
- "Ready to mark complete. All criteria met and implementation aligns with specs."
- "Address these issues before completing: [list]"
- "Consider running `/check-alignment` for deeper spec alignment verification."
```

## Integration with Other Skills

**Relationship to check-alignment:**
- `check-alignment` = comprehensive audit of entire codebase vs specs
- `verify` = quick checkpoint for current work only

**Suggested workflow:**
1. Work on task with `/next-task`
2. Before marking complete, run `/verify`
3. Periodically run `/check-alignment` for full audit

**Prompting from next-task:**
The `next-task` skill Step 5 can suggest: "Consider running `/verify` before marking this complete."

## When to Escalate

If verify finds significant issues:
- Many acceptance criteria failing → revisit task scope
- Major architecture deviation → may need `/sync-architecture`
- Missing requirements coverage → may need `/product-design`
- Widespread issues → run full `/check-alignment`
