---
name: implement-feature
description: Use when implementing a feature - executes TDD workflow with multi-agent verification. Handles worktree lifecycle when called with context parameters.
requires: test-driven-development, validation-loop, use-git-worktree
user-invocable: false
---

# Implement Feature Skill

Executes TDD implementation with multi-agent verification. Handles worktree creation and finalization when context parameters are provided.

## Workflow

### Step 0: Exit Plan Mode

**If you are in plan mode:** Call `ExitPlanMode()` immediately. Do not explore files, do not read code, do not create plans. Wait for user approval then continue with Step 3.

### Step 1: Prepare Worktree

Check session context for worktree parameters:
- **identifier**: TASK-NNN or FEATURE-slug
- **title**: Feature/task title
- **merge-mode**: `auto` | `ask` | `env` (default: `ask`)

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

**You MUST call the Skill tool now:** `Skill(skill="groundwork:validation-loop")`

Do NOT declare implementation complete or skip validation. This step is non-negotiable.

This runs verification agents in parallel with autonomous fix-and-retry.

After validation passes, output:

```
Validation loop passed
```

**DO NOT proceed to Step 7 until validation loop passing confirmation is output.**

### Step 7: Finalize Worktree

**DO NOT declare completion until you have executed this Step.**

1. **Verify all changes committed:**
   ```bash
   git status --porcelain
   ```

2. **If uncommitted changes exist:**
   - Stage and commit with descriptive message
   - Use identifier in commit message

**Determine merge action based on merge-mode:**

| Mode | Behavior |
|------|----------|
| `auto` | Proceed to merge immediately |
| `ask` | Prompt user for decision |
| `env` | Check `GROUNDWORK_AUTO_MERGE` env var; if true → merge, else → prompt |

**If prompting user:**

Use `AskUserQuestion` to ask:

> "Would you like me to merge this into [base-branch] now?"
> - Option 1: "Yes, merge now"
> - Option 2: "No, I'll merge manually later"

**Wait for user response before proceeding.**

**If merging:**

1. Return to original repository
2. Checkout base branch
3. Merge: `git merge --no-ff <branch> -m "Merge <branch>: [Title]"`
4. If success: Remove worktree, delete branch
5. If conflicts: Report conflicts and keep worktree for manual resolution

**If not merging or conflicts occurred:**

Report worktree location and manual merge instructions:

```markdown
## Implementation Complete in Worktree

**Location:** .worktrees/<identifier>
**Branch:** task/<identifier> or feature/<identifier>

When ready to merge:
```bash
git checkout [base-branch]
git merge --no-ff <branch>
git worktree remove .worktrees/<identifier>
git branch -d <branch>
```

To continue working:
```bash
cd .worktrees/<identifier>
```
```

### Step 8: Report Completion

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

**Worktree status:** [Merged to <branch> | Pending at .worktrees/<identifier> | N/A (standalone)]
```

---

## Reference

### Session Context Parameters

When called from parent skills, these parameters are passed via session context:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `identifier` | Task or feature ID | `TASK-004`, `FEATURE-user-login` |
| `title` | Human-readable title | "Add user authentication" |
| `merge-mode` | How to handle merge | `auto`, `ask`, `env` |
| `action-items` | List of work items | From task file or requirements |
| `acceptance-criteria` | Verification criteria | From task file or requirements |

### Merge Mode Behavior

- **`auto`**: Merge immediately without prompting (for CI/batch workflows)
- **`ask`**: Always prompt user for merge decision (default for ad-hoc features)
- **`env`**: Check `GROUNDWORK_AUTO_MERGE` env var - if true, behave like `auto`; otherwise prompt (for planned tasks)

### Caller Mapping

| Caller | merge-mode | Reason |
|--------|------------|--------|
| `execute-task` | `env` | Respects batch automation setting |
| `build-unplanned-feature` | `ask` | Ad-hoc work needs user confirmation |
| Standalone | `ask` | Default to user confirmation |
