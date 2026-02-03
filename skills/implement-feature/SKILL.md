---
name: implement-feature
description: Use when implementing a feature - executes TDD workflow with multi-agent verification. Assumes worktree is already created. Takes optional context as argument.
requires: test-driven-development, validation-loop
---

# Implement Feature Skill

Executes TDD implementation with multi-agent verification. Designed to work standalone or as part of the `execute-task` workflow.

## Workflow

### Step 1: Verify Worktree

**If you are in plan mode:** Call `ExitPlanMode()` immediately. Do not explore files, do not read code, do not create plans. Wait for user approval then keep going with Step 2.

### Step 2: Gather Context

Check if action items and acceptance criteria are available from the current session context (e.g., from `execute-task` Step 6 summary).

**If context available:** Use action items and acceptance criteria from session.

**If context NOT available:** Prompt user:

> "What should be implemented?
>
> Please provide:
> 1. **Action Items** - What needs to be done (list)
> 2. **Acceptance Criteria** - How we'll know it's done (list)"

Store the gathered context for use in subsequent steps.

### Step 3: Execute TDD

Invoke: `Skill(skill="groundwork:test-driven-development")`

For each action item:
1. Write failing test
2. Implement minimum code to pass
3. Refactor if needed
4. Verify test passes

Complete all action items before proceeding.

### Step 4: Demand Elegance

For non-trivial changes, ask:

> "Is there a more elegant way to implement this?"

Refer to `docs/clean-code-principles.md` for guidance on:
- Simpler abstractions
- Better naming
- Reduced complexity
- Cleaner interfaces

If improvements identified: implement them (maintaining test coverage).

### Step 5: Verify Implementation

Verify all work before proceeding:

1. **Action Items** - Each implemented and tested
2. **Test Coverage** - All new code has tests, all pass
3. **Acceptance Criteria** - Each verified

Output verification results:

```markdown
## Verification Results

### Action Items
- [x] [Action 1] - Implemented in `file.ts`, tested in `test.ts`

### Test Results
- All tests pass: [yes/no]

### Acceptance Criteria
- [x] [Criterion 1] - Verified by [method]
```

**If any fail:** Do not proceed. Continue working until all pass.

### Step 6: Multi-Agent Verification

This is mandatory. Invoke: `Skill(skill="groundwork:validation-loop")`

This runs verification agents in parallel with autonomous fix-and-retry.

After validation passes, output:

```
Validation loop passed
```

**DO NOT proceed to Step 7 until validation loop passing confirmation is output.**

### Step 7: Report Completion

Output implementation summary:

```markdown
## Implementation Complete

**What was done:**
- [Summary of changes]

**Files modified:**
- `path/to/file` - [description]

**Tests added:**
- `path/to/test` - [what it tests]

**Acceptance criteria verified:**
- [x] [Criterion] - [How verified]
```

---

## Reference

### When Called from execute-task

The calling skill (`execute-task`) handles:
- Task status updates (In Progress → Complete)
- Worktree creation and finalization
- Task file management

This skill focuses purely on implementation execution.

### Standalone Usage

When invoked directly:
1. Gathers requirements from user
2. Executes full TDD + verification workflow
3. Reports completion

No task status management occurs in standalone mode.
