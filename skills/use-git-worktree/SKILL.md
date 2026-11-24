---
name: use-git-worktree
description: Use when feature work needs isolation from the current workspace - creates a git worktree at the fixed task location, verifies it is gitignored, runs project setup, and checks the baseline tests
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

### Step 1: Know Where the Worktree Lives

The directory is fixed, not chosen: the shared worktree-identity helper (Step 3) places every task worktree under `.worktrees/` at the repository root — `<repo>/.worktrees/TASK-NNN` in a single-project repo, `<repo>/.worktrees/<project>-TASK-NNN` in a monorepo — so interactive sessions and runner runs share one location and can never silently collide. A `worktree-dir:` directive in `CLAUDE.md`, a README convention, or a preferred alternative such as `worktrees/` does not move it; Step 3 uses the helper's `path` verbatim.

### Step 2: Verify the Directory is Gitignored

**Critical:** Ensure the worktree directory won't be committed.

```bash
git check-ignore -q .worktrees
```

**If not ignored:**
- Add to `.gitignore` with user confirmation
- Report the change

```bash
echo ".worktrees/" >> .gitignore
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
**Baseline tests:** [passing | failing before any change — see Step 5]

Ready to begin work.
```

## Merging

Merging and cleanup belong to the skill that ran the task (`work-on`, `build-unplanned`, or `finalize-task`) — never merge on your own initiative. When you are the one asked to merge a worktree you created on your own, follow `${CLAUDE_PLUGIN_ROOT}/references/task-merge-sequence.md`: the tree must be validated and the validation repairs committed, the merge runs from the project root with `--no-ff`, the worktree and branch are removed only after the merge succeeds, and a conflict means abort and keep the worktree.

## Error Handling

| Error | Recovery |
|-------|----------|
| Branch already exists | Another session (or a runner run) may hold this task — run `git worktree list`, offer to reuse the existing worktree, wait, or clean it up |
| Worktree path exists | Check if it's valid, offer cleanup or different path |
| Not a git repository | Cannot use worktrees, fall back to current directory |
| Uncommitted changes | Prompt to commit or stash before creating worktree |
| Setup command fails | Report error, offer to continue or abort |

## Cleanup Commands

Removing a worktree and deleting its branch are part of a merge: use *Cleanup commands* in `references/task-merge-sequence.md`, which also says when a force delete is allowed.

**List all worktrees:**
```bash
git worktree list
```

**Prune stale worktrees:**
```bash
git worktree prune
```
