---
name: task-implementation
description: Dispatches a planned task/feature to the task-executor agent for worktree-isolated TDD implementation
user-invocable: false
---

# Task Implementation Skill

Dispatches a previously planned task or feature to the task-executor agent for worktree-isolated TDD implementation.

## Token Discipline

This skill orchestrates implementation dispatch. Every turn re-reads the full context window, so unnecessary turns are expensive.

1. **No narration turns.** Do not output text-only turns like "Let me dispatch the task" or "Now I'll launch the executor." Combine text with a tool call in the same turn, or skip the text entirely.
2. **Batch tool calls.** When multiple tool calls are independent, issue them all in one turn.
3. **No waiting updates.** Do not output "Waiting for results..." turns. Wait silently until results arrive.
4. **Keep context lean.** Do not read file contents you won't use directly. The task-executor agent has Read/Grep/Glob and will read files in its own context window.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high` or higher AND you are Sonnet or Opus.
If effort is below `high`, you MUST show the recommendation prompt — regardless of model.
If you are not Sonnet or Opus, you MUST show the recommendation prompt — regardless of effort level.

Otherwise → use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Implementation benefits from consistent multi-domain reasoning.\n\nTo switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke.",
    "header": "Effort check",
    "options": [
      { "label": "Continue" },
      { "label": "Cancel — I'll switch first" }
    ],
    "multiSelect": false
  }]
}
```

If the user selects "Cancel — I'll switch first": output the switching commands and stop. Do not proceed with the skill.

## Step 0: Resolve Project Context

**Before dispatching, ensure project context is resolved:**

1. **Monorepo check:** Does `.groundwork.yml` exist at the repo root?
   - If yes → Is `{{project_name}}` non-empty?
     - If empty → Invoke `Skill(skill="groundwork:project-selector")` to select a project, then restart this skill.
     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.
   - If no → Continue (single-project repo).
2. Proceed with the resolved project context.

## Step 1: Resolve Plan File

Parse input from the caller's conversation context. Three modes:

- **plan_file_path provided** → Read the plan file header to extract `Identifier`, `Mode`, `Branch prefix`, `Tasks path`.
- **task_id only** (no plan_file_path) → Derive path `.groundwork-plans/TASK-NNN-plan.md`. If file does not exist, output `RESULT: FAILURE | No plan found for TASK-NNN. Run task-planning first.` and stop.
- **task_id + plan_file_path** → Use the provided plan file path. Verify it exists.
- **Neither** → Output `RESULT: FAILURE | No plan_file_path or task_id provided. Run task-planning first.` and stop.

Read ONLY the `## Context` header from the plan file to extract:
- `identifier` (e.g., `TASK-004` or `FEATURE-user-login`)
- `mode` (task, feature, or task+blurb)
- `branch_prefix` (task or feature)
- `tasks_path` (path to tasks file, or N/A)
- `specs_dir`

Do NOT read the full plan content into this orchestrator's context. The task-executor agent will read it.

## Step 2: Update Task Status (task mode only)

**Skip this step if identifier starts with `FEATURE-`.**

Update the task file to `**Status:** In Progress` and update the status table in `{{specs_dir}}/tasks/_index.md` or `{{specs_dir}}/tasks.md` (change the task's row to `In Progress`).

## Step 3: Dispatch to task-executor

Dispatch to the task-executor agent with a fresh context window. This agent has `use-git-worktree` and `test-driven-development` skills preloaded — it does not need to call `Skill()` or spawn subagents.

**Build the Agent prompt — pass paths, not content.**

### Task mode (`identifier` starts with `TASK-`)

```
Agent(
  subagent_type="groundwork:task-executor:task-executor",
  description="Execute {identifier}",
  prompt="You are implementing a task that has already been fully planned.

  [If GROUNDWORK_BATCH_MODE=true in session: include the line below]
  [If interactive: omit this line]
  Do NOT use AskUserQuestion — proceed automatically.

  PROJECT ROOT: [absolute path to project root]

  TASK:
  - task_id: [TASK-NNN]
  - tasks_path: [absolute path to tasks file]

  Read the '### TASK-NNN:' section from tasks_path for goal, action items,
  and acceptance criteria. Do not ask the caller for task details.

  PLAN FILE: [plan_file_path]
  Read this file first with the Read tool — it contains the validated implementation plan.

  INSTRUCTIONS:
  1. Follow your preloaded skills to create a worktree, implement with TDD, and commit.
  2. Read the task section from tasks_path and the plan from PLAN FILE — they provide all session context. Do NOT re-ask the user for requirements.
  3. When complete, output your final line in EXACTLY this format:
     RESULT: IMPLEMENTED | <worktree_path> | <branch> | <base_branch>
     OR:
     RESULT: FAILURE | [one-line reason]

  IMPORTANT:
  - Do NOT run validation-loop or merge — the caller handles those
  - Do NOT use AskUserQuestion for merge decisions
  - Your LAST line of output MUST be the RESULT line
  "
)
```

### Feature mode (`identifier` starts with `FEATURE-`)

```
Agent(
  subagent_type="groundwork:task-executor:task-executor",
  description="Implement {identifier}",
  prompt="You are implementing a feature that has already been fully planned.

  PROJECT ROOT: [absolute path to project root]

  FEATURE:
  - Identifier: [FEATURE-slug]

  PLAN FILE: [plan_file_path]
  Read this file first with the Read tool — it contains the validated implementation plan
  including full requirements, acceptance criteria, and spec paths.

  INSTRUCTIONS:
  1. Follow your preloaded skills to create a worktree, implement with TDD, and commit.
  2. The plan file provides all session context including requirements, acceptance criteria, and spec paths. Read spec files referenced in the plan for architecture and design context. Do NOT re-ask the user for requirements.
  3. When complete, output your final line in EXACTLY this format:
     RESULT: IMPLEMENTED | <worktree_path> | <branch> | <base_branch>
     OR:
     RESULT: FAILURE | [one-line reason]

  IMPORTANT:
  - Do NOT run validation-loop or merge — the caller handles those
  - Do NOT use AskUserQuestion for merge decisions
  - Your LAST line of output MUST be the RESULT line
  "
)
```

## Step 4: Parse Result

**After the subagent returns**, parse the result:

- `RESULT: IMPLEMENTED | <path> | <branch> | <base-branch>` → Output:
  ```
  RESULT: IMPLEMENTED | worktree_path=<path> | branch=<branch> | base_branch=<base-branch>
  ```
- `RESULT: FAILURE | ...` → Output:
  ```
  RESULT: FAILURE | <reason>
  ```
- No parseable RESULT line → Output:
  ```
  RESULT: FAILURE | Implementation subagent did not return a structured result. Check worktree status manually.
  ```

**DO NOT proceed past this step. The caller handles validation, merge, and completion.**
