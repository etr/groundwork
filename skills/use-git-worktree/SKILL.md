---
name: use-git-worktree
description: This skill should be used when starting feature work that needs isolation from current workspace - creates isolated git worktrees with smart directory selection and safety verification
user-invocable: false
---

# Git Worktree Management

Create and manage isolated git worktrees for task execution with automatic project setup and merge handling.

## Overview

Git worktrees provide complete isolation for task work:
- Changes don't affect main workspace until merge
- Can switch between tasks without stashing
- Clean baseline for each task
- Safe to experiment

## Workflow

### Step 1: Determine Worktree Directory

Find or create the worktree directory using this priority order:

1. **Check for existing directory:**
   ```bash
   # Preferred (hidden, less clutter)
   ls -d .worktrees 2>/dev/null
   # Alternative
   ls -d worktrees 2>/dev/null
   ```

2. **Check CLAUDE.md for directive:**
   ```markdown
   worktree-dir: path/to/worktrees
   ```

3. **Check README.md for configuration:**
   Look for worktree or development setup instructions.

4. **Ask user if not found:**
   > "Where should I create worktrees for isolated task work?
   > 1. `.worktrees/` (Recommended - hidden, less clutter)
   > 2. `worktrees/`
   > 3. Custom location"

### Step 2: Verify Directory is Gitignored

**Critical:** Ensure the worktree directory won't be committed.

```bash
git check-ignore -q <worktree-dir>
```

**If not ignored:**
- Add to `.gitignore` with user confirmation
- Report the change

```bash
echo "<worktree-dir>/" >> .gitignore
```

### Step 3: Create Branch and Worktree

**Resolve the workspace identity with the shared helper — never derive it by hand.**

Task IDs are only unique per project (each project numbers its own `specs/tasks.md`), so the branch and worktree path must be project-qualified in monorepos. The helper applies the same convention the terminal runner uses, so interactive sessions and runner runs share one identity space and can never silently collide:

```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/worktree-identity.js TASK-004
```

Output (single JSON line):
```json
{"task_id":"TASK-004","repo_root":"…","project_root":"…","project_name":"web",
 "scope":"project","path":"<repo>/.worktrees/web-TASK-004","branch":"task/web/TASK-004",
 "legacy":{"path":"<repo>/.worktrees/TASK-004","branch":"task/TASK-004","exists":false,"runner_owner":null}}
```

Rules:
- Use the returned `path` and `branch` **verbatim** — including in merges, cleanup, and reports. Single-project repos get the short form (`task/TASK-004`, `<dir>/TASK-004`); monorepos get the project-qualified form.
- If `legacy.exists` is true, a pre-scoping unqualified worktree exists at the repository root: surface it to the user ("if it belongs to another project, remove it; if it's yours, continue working in it") instead of silently adopting or ignoring it.
- If `legacy.runner_owner` names a project, that legacy worktree is owned by a runner run's checkpoint — do not reuse it without the user's explicit confirmation.

**Create from current HEAD:**
```bash
# Get current branch as base
BASE_BRANCH=$(git branch --show-current)

# Create branch and worktree in one command, using the helper's values
git worktree add -b <branch> <worktree-path>
```

**Record context (used by every later merge/cleanup step):**
- Base branch (for later merge)
- Worktree path (`<worktree-path>`)
- Branch (`<branch>`)
- Task ID

### Step 4: Auto-Detect and Run Project Setup

Change to worktree directory and detect project type:

| File Present | Setup Command |
|--------------|---------------|
| `package.json` | `npm install` or `yarn install` |
| `Cargo.toml` | `cargo build` |
| `requirements.txt` | `pip install -r requirements.txt` |
| `Pipfile` | `pipenv install` |
| `pyproject.toml` | `pip install -e .` or `poetry install` |
| `go.mod` | `go mod download` |
| `Gemfile` | `bundle install` |
| `pom.xml` | `mvn install` |
| `build.gradle` | `./gradlew build` |

**Check for custom setup:**
1. Read CLAUDE.md for setup instructions
2. Read README.md for development setup section
3. Execute any documented setup steps

### Step 5: Verify Baseline Tests Pass

Run the project's test suite to ensure a clean starting point:

```bash
# Detect test command from package.json, Makefile, etc.
npm test          # Node.js
cargo test        # Rust
pytest            # Python
go test ./...     # Go
bundle exec rspec # Ruby
```

**If tests fail:**
> "Baseline tests are failing in the worktree. This may indicate:
> 1. Setup incomplete - check dependencies
> 2. Tests require specific environment
> 3. Base branch has failing tests
>
> Would you like to:
> 1. Continue anyway (tests may already be failing)
> 2. Abort and investigate"

### Step 6: Return Worktree Context

Provide context for the calling skill:

```markdown
## Worktree Created

**Task:** TASK-NNN
**Branch:** <branch from the helper>
**Base Branch:** main
**Working Directory:** <worktree-path from the helper>
**Merge Mode:** [auto-merge|manual]

Project setup complete. Baseline tests passing.

Ready to begin work.
```

## Merge Operations

### Auto-Merge Flow

When task completes with auto-merge enabled:

```bash
# Ensure all changes committed in worktree
cd <worktree-path>
git status --porcelain  # Should be empty

# Return to main repo and merge (branch/worktree-path as recorded in Step 3)
cd <original-repo>
git checkout <base-branch>
git merge --no-ff <task-branch> -m "Merge <task-branch>: [Task Title]"

# Cleanup
git worktree remove <worktree-path>
git branch -d <task-branch>
```

### Manual Verification Flow

When user wants to review before merge:

```markdown
## Task Complete in Worktree

**Location:** <worktree-path>
**Branch:** <task-branch>

All changes committed. To merge manually:
```bash
git checkout <base-branch>
git merge --no-ff <task-branch>
git worktree remove <worktree-path>
git branch -d <task-branch>
```

Or to continue working:
```bash
cd <worktree-path>
```
```

### Merge Conflict Handling

If merge conflicts occur:

```markdown
## Merge Conflict

The merge of <task-branch> into <base-branch> has conflicts.

**Conflicting files:**
- path/to/file1.ts
- path/to/file2.ts

**Options:**
1. Resolve conflicts manually in the main repo
2. Abort merge and keep worktree for investigation

**To resolve:**
```bash
# In main repo after failed merge
git status                    # See conflicting files
# Edit files to resolve conflicts
git add <resolved-files>
git commit                    # Complete merge

# Then cleanup
git worktree remove <worktree-path>
git branch -d <task-branch>
```

**To abort:**
```bash
git merge --abort
# Worktree preserved at <worktree-path>
```
```

## Error Handling

| Error | Recovery |
|-------|----------|
| Branch already exists | Another session (or a runner run) may hold this task — run `git worktree list`, offer to reuse the existing worktree, wait, or clean it up |
| Worktree path exists | Check if it's valid, offer cleanup or different path |
| Not a git repository | Cannot use worktrees, fall back to current directory |
| Uncommitted changes | Prompt to commit or stash before creating worktree |
| Setup command fails | Report error, offer to continue or abort |

## Cleanup Commands

**Remove a worktree:**
```bash
git worktree remove <path>
git branch -d <branch>  # Safe delete (checks merge status)
git branch -D <branch>  # Force delete
```

**List all worktrees:**
```bash
git worktree list
```

**Prune stale worktrees:**
```bash
git worktree prune
```
