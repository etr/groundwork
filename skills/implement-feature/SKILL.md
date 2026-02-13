---
name: implement-feature
description: This skill should be used when implementing a feature - executes TDD workflow in a worktree. Handles worktree creation and TDD only; callers handle validation and merge.
requires: test-driven-development, use-git-worktree
user-invocable: false
---

# Implement Feature Skill

Executes TDD implementation in a worktree. Creates the worktree, runs TDD, verifies action items and acceptance criteria, then returns control to the caller for validation and merge.

## Workflow

### Step 0: Exit Plan Mode

**If you are in plan mode:** Call `ExitPlanMode()` immediately. Do not explore files, do not read code, do not create plans. Wait for user approval then continue with Step 3.

### Step 1: Prepare Worktree

Check session context for worktree parameters:
- **identifier**: TASK-NNN or FEATURE-slug
- **title**: Feature/task title

**If not already in worktree:**

If no identifier create a new identifier yourself in the format FEATURE-slug. Otherwise, use the identifier provided.

**You MUST call the Skill tool now:** `Skill(skill="groundwork:use-git-worktree", args="<identifier>")`

Do NOT create branches or worktrees with git commands directly. The skill handles setup and baseline validation.

Wait for worktree creation to complete and baseline tests to pass.

**If already in worktree (`.worktrees/` in pwd):**

Use existing worktree context. Go to step 2.

### Step 2: Gather Context

Check if action items and acceptance criteria are available from the current session context (e.g., from `execute-task` or `build-unplanned-feature`).

**If context available:** Use action items and acceptance criteria from session.

**If context NOT available:** Use `AskUserQuestion` to ask:

> "What should be implemented? Please provide Action Items (what needs to be done) and Acceptance Criteria (how we'll know it's done)."

**Wait for user response before proceeding.**

Store the gathered context for use in subsequent steps.

### Step 3: Execute TDD

**You MUST call the Skill tool now:** `Skill(skill="groundwork:test-driven-development")`

Do NOT write implementation code without first loading the TDD skill. It enforces red-green-refactor discipline.

For each action item:
1. Write failing test
2. Implement minimum code to pass
3. Refactor if needed
4. Verify test passes

Complete all action items before proceeding.

### Step 4: Demand Elegance

For non-trivial changes, ask:

> "Is there a more elegant way to implement this?"

**Read `docs/clean-code-principles.md` now** using the Read tool, then apply its guidance on:
- Simpler abstractions
- Better naming
- Reduced complexity
- Cleaner interfaces

If improvements identified: implement them (maintaining test coverage).

### Step 5: Verify and Hand Off

Verify all work before handing off:

1. **Action Items** - Each implemented and tested
2. **Test Coverage** - All new code has tests, all pass
3. **Acceptance Criteria** - Each verified

**If any fail:** Do not proceed. Continue working until all pass.

**Commit all changes:**
```bash
git add -A && git commit -m "<identifier>: Implementation complete"
```

**Capture worktree info:**
- `worktree_path`: Result of `pwd`
- `branch`: Result of `git branch --show-current`
- `base_branch`: The branch the worktree was created from (typically `main` or the branch active before worktree creation)

**Output the following block exactly:**

```
IMPLEMENTATION_READY
worktree: <worktree_path>
branch: <branch>
base-branch: <base_branch>
identifier: <identifier>
```

Then output verification results:

```markdown
## Verification Results

### Action Items
- [x] [Action 1] - Implemented in `file.ts`, tested in `test.ts`

### Test Results
- All tests pass: [yes/no]

### Acceptance Criteria
- [x] [Criterion 1] - Verified by [method]
```

**Return control to the caller.** Do NOT run validation-loop, merge, or report completion.

---

## Reference

### Session Context Parameters

When called from parent skills, these parameters are passed via session context:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `identifier` | Task or feature ID | `TASK-004`, `FEATURE-user-login` |
| `title` | Human-readable title | "Add user authentication" |
| `action-items` | List of work items | From task file or requirements |
| `acceptance-criteria` | Verification criteria | From task file or requirements |
