---
name: groundwork:work-on-next-task
description: Execute next uncompleted task with full project context (PRD, architecture, tasks). Usage /groundwork:work-on-next-task
allowed-tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Task", "Skill"]
disable-model-invocation: true
---

# Next Task Skill

Finds the next uncompleted task from `{{specs_dir}}/tasks/` (or `{{specs_dir}}/tasks.md`) and delegates execution to the `execute-task` skill.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high` or higher AND you are Sonnet or Opus.
If effort is below `high`, you MUST show the recommendation prompt — regardless of model.
If you are not Sonnet or Opus, you MUST show the recommendation prompt - regardless of effort level.

Otherwise → use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Do you want to switch? Dependency resolution and task selection benefits from consistent reasoning.\n\nTo switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke this skill.",
    "header": "Recommended: Sonnet or Opus at high effort",
    "options": [
      { "label": "Continue" },
      { "label": "Cancel — I'll switch first" }
    ],
    "multiSelect": false
  }]
}
```

If the user selects "Cancel — I'll switch first": output the switching commands above and stop. Do not proceed with the skill.

## Workflow

**IMPORTANT**: Your job is NOT to build a plan or build anything, it is to exclusively to find the next task to execute. Don't do planning or building until the full workflow is executed. If you find yourself planning or executing, STOP and follow the workflow.

### Step 0: Resolve Project Context

**Before loading specs, ensure project context is resolved:**

1. **Monorepo check:** Does `.groundwork.yml` exist at the repo root?
   - If yes → Is `{{project_name}}` non-empty?
     - If empty → Invoke `Skill(skill="groundwork:project-selector")` to select a project, then restart this skill.
     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.
   - If no → Continue (single-project repo).
2. **CWD mismatch check (monorepo only):**
   - Skip if not in monorepo mode or if the project was just selected in item 1 above.
   - If CWD is the repo root → fine, proceed.
   - Check which project's path CWD falls inside (compare against all projects in `.groundwork.yml`).
   - If CWD is inside the selected project's path → fine, proceed.
   - If CWD is inside a different project's path → warn via `AskUserQuestion`:
     > "You're working from `<cwd>` (inside **[cwd-project]**), but the selected Groundwork project is **[selected-project]** (`[selected-project-path]/`). What would you like to do?"
     > - "Switch to [cwd-project]"
     > - "Stay with [selected-project]"
     If the user switches, invoke `Skill(skill="groundwork:project-selector")`.
   - If CWD doesn't match any project → proceed without warning (shared directory).
3. Proceed with the resolved project context. All `{{specs_dir}}/` paths will resolve to the correct location.

### Step 1: Load Task Index

Read **only** the task index to find available tasks — do NOT read individual task files:
- Directory mode: `{{specs_dir}}/tasks/_index.md` (preferred — contains status table)
- Single file fallback: `{{specs_dir}}/tasks.md`

**Detection:** Check for `{{specs_dir}}/tasks/_index.md` first, then `{{specs_dir}}/tasks.md`. Do NOT aggregate all task files — the index contains the status table with all the information needed to find the next task.

### Step 2: Find Next Task

Parse the status table in `_index.md` to find the next task:

```markdown
| # | Task | Milestone | Status | Blocked by |
|---|------|-----------|--------|------------|
| TASK-001 | Auth setup | M1 | Complete | None |
| TASK-002 | Login UI | M1 | In Progress | TASK-001 |
| TASK-003 | Dashboard | M2 | Not Started | TASK-002 |
```

1. Look for all rows with Status = `Not Started`
2. Check dependencies — filter to unblocked tasks (all tasks in `Blocked by` column are `Complete`)
3. **Detect ambiguity:**
   - Let `candidates` = unblocked not-started tasks
   - Let `next_sequential` = lowest numbered candidate (e.g., TASK-004)
   - Let `completed_after` = any complete task with number > next_sequential

4. **If ambiguous (completed tasks exist after candidates):**
   Present options to user with context about the gap:

   > "Multiple tasks are available. Tasks 1,2,3,5 are complete.
   > - **TASK-004:** [Title] - Earlier in sequence, may have been skipped intentionally
   > - **TASK-006:** [Title] - Next sequential after completed work
   >
   > Which would you like to work on? (or use `/groundwork:work-on N` to select a specific task)"

   Wait for user selection before proceeding.

5. **If unambiguous:** Select the first unblocked, not-started task

**Dependency check:** A task is blocked if its `Blocked by` column lists any task that is not `Complete` in the status table.

**Fallback:** If `_index.md` has no status table, read individual task files to find statuses (legacy single-file format).

**Tip:** For direct task selection, use `/groundwork:work-on N` to work on a specific task by number.

### Step 3: Handle Edge Cases

| Situation | Response |
|-----------|----------|
| No `specs/` directory | "No specs directory found. Run `/groundwork:design-product` to start defining your project." |
| Missing tasks file | "Tasks file not found. Run `/groundwork:create-tasks` to generate tasks from your PRD and architecture." |
| No tasks found | "No tasks found in {{specs_dir}}/tasks/. The directory may need to be regenerated with `/groundwork:create-tasks`." |
| All tasks complete | "All tasks complete! Consider running `/groundwork:source-product-specs-from-code` to update documentation or plan the next phase." |
| Only blocked tasks | "All remaining tasks are blocked. Blocked tasks: [list]. Would you like to override and work on one anyway?" |
| Parse error | "Could not parse tasks.md. Expected format: `### TASK-NNN: Title` with `**Status:**` field." |

### Step 4: Delegate to Execute Task

**You MUST call the Skill tool now:** `Skill(skill="groundwork:execute-task", args="<task-id>")`

Replace `<task-id>` with the identified task identifier (e.g., `TASK-004`).

Do NOT load project context, explore the codebase, present summaries, or begin task execution yourself. The execute-task skill handles the complete workflow including worktree setup, TDD, and validation.
