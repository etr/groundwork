# Merging a Task Worktree

The one merge-and-cleanup procedure for work done in a task worktree. `work-on` and `build-unplanned` run it after validation passes and the user agrees to merge. `use-git-worktree` points here whenever it is asked to merge a worktree it created on its own. `finalize-task` keeps its own stricter, runner-aware sequence and does not use this one.

## Preconditions

- **Validation passed on exactly this tree.** If validation did not just pass for the worktree's current state, stop and run `validate` first.
- **The validation repairs are committed.** The validation fixer edits files but never commits. Check `git -C <worktree_path> status --porcelain`; when anything is uncommitted, commit it on the task branch so the merge carries the repairs and removing the worktree loses nothing:

  ```bash
  git -C <worktree_path> add -A && git -C <worktree_path> commit -m "<TASK-NNN>: validation fixes"
  ```

- **You are in the project root**, not inside the worktree.

## Merge, then clean up

```bash
git checkout <base_branch>
git merge --no-ff <branch> -m "Merge <branch>: <title>"
```

Only after the merge succeeds:

```bash
git worktree remove <worktree_path>
git branch -d <branch>
```

`git branch -d` refuses an unmerged branch — that refusal is the safety net; never replace it with `-D` to make it pass.

## If the merge conflicts

Keep the worktree and its branch. Abort the merge while it is in progress and nothing else in the base checkout changed:

```bash
git merge --abort
```

Report the conflicting files, the worktree location, and the branch, and offer two paths: resolve the conflicts deliberately in the base checkout, or leave the worktree for investigation. Do not resolve conflicts on the base branch on your own initiative.

## Manual merge (what to tell the user)

> When ready to merge (commit any uncommitted validation fixes inside the worktree first — the fixer never commits):
> ```bash
> cd <project_root>
> git checkout <base_branch>
> git merge --no-ff <branch>
> git worktree remove <worktree_path>
> git branch -d <branch>
> ```
>
> To continue working:
> ```bash
> cd <worktree_path>
> ```

## Cleanup commands

| Goal | Command | Note |
|------|---------|------|
| Remove a worktree | `git worktree remove <worktree_path>` | Refuses while the worktree holds uncommitted changes — commit or stash first |
| Delete a merged branch | `git branch -d <branch>` | Safe: refuses unless the branch is merged |
| Delete an unmerged branch | `git branch -D <branch>` | Destroys unmerged work; only on the user's explicit say-so |
| List worktrees | `git worktree list` | Shows every worktree and its branch |
| Forget stale worktrees | `git worktree prune` | After a worktree directory was deleted by hand |
