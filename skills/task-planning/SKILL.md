---
name: task-planning
description: Plans a task or feature - loads context, optionally clarifies requirements, spawns Plan agent, persists plan to .groundwork-plans/
requires: understanding-feature-requests
user-invocable: false
---

# Task Planning Skill

Plans a task or feature by loading context, optionally clarifying requirements, spawning a Plan agent, and persisting the validated plan to `.groundwork-plans/`.

## Token Discipline

This skill orchestrates planning workflows. Every turn re-reads the full context window, so unnecessary turns are expensive.

1. **No narration turns.** Do not output text-only turns like "Let me load the task" or "Now I'll spawn the plan agent." Combine text with a tool call in the same turn, or skip the text entirely.
2. **Batch tool calls.** When multiple tool calls are independent, issue them all in one turn.
3. **No waiting updates.** Do not output "Waiting for results..." turns. Wait silently until results arrive.
4. **Keep context lean.** Do not read file contents you won't use directly. Pass file paths to subagents and let them read in their own context windows.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high` or higher AND you are Sonnet or Opus.
If effort is below `high`, you MUST show the recommendation prompt — regardless of model.
If you are not Sonnet or Opus, you MUST show the recommendation prompt — regardless of effort level.

Otherwise → use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Planning benefits from consistent multi-domain reasoning.\n\nTo switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke.",
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

## Step 1: Detect Input Mode

Parse the input from the caller's conversation context. Three modes:

- **Task ID** (numeric like `4`, or full format like `TASK-004`): Set `mode=task`, `task_id=TASK-NNN` (zero-padded to 3 digits).
- **Blurb** (free text, no task ID): Set `mode=feature`, `blurb=<text>`.
- **Task ID + blurb** (both present): Set `mode=task+blurb`, `task_id=TASK-NNN`, `blurb=<text>`.
- **Neither** (no argument, no context): Output `RESULT: FAILURE | No task ID or feature description provided.` and stop.

## Step 2: Load Context (mode-dependent)

### Task ID mode (`mode=task` or `mode=task+blurb`)

1. **Locate task file:**
   - Single file: `{{specs_dir}}/tasks.md`
   - Directory: `{{specs_dir}}/tasks/`
   Search for `### TASK-NNN:` pattern.
   **Error:** Task not found → Output `RESULT: FAILURE | TASK-NNN not found in {{specs_dir}}/tasks/` and stop.

2. **Read task definition** — only the `### TASK-NNN:` section (goal, action items, acceptance criteria, dependencies, status). Do NOT read full specs/architecture/design files.

3. **Validate task is workable:**
   - Status `Complete` → Output `RESULT: FAILURE | TASK-NNN is already Complete.` and stop.
   - Blocked by incomplete tasks → Output `RESULT: FAILURE | TASK-NNN is blocked by: [list].` and stop.

4. **Verify spec paths exist** (use Glob, not Read):
   - `{{specs_dir}}/product_specs.md` or `{{specs_dir}}/product_specs/`
   - `{{specs_dir}}/architecture.md` or `{{specs_dir}}/architecture/`
   - `{{specs_dir}}/design_system.md`
   - Tasks file (already found above)

   **If specs missing:** Report which are missing, suggest running `/groundwork:design-product` or `/groundwork:design-architecture` first. Use `AskUserQuestion` to confirm proceeding without them.
   **If design system missing:** Proceed without it.

5. Set `identifier=TASK-NNN`, `branch_prefix=task`.

### Blurb mode (`mode=feature`)

1. **Load existing specs** (check for and read if they exist):
   - `{{specs_dir}}/product_specs.md` (or `{{specs_dir}}/product_specs/` directory) → `PRD_CONTEXT`
   - `{{specs_dir}}/architecture.md` (or `{{specs_dir}}/architecture/` directory) → `ARCHITECTURE_CONTEXT`
   - `{{specs_dir}}/design_system.md` → `DESIGN_CONTEXT`

   For each, check single file first, then directory. If a directory, aggregate all `.md` files.
   If none exist, that's fine — proceed without them.

2. **Clarify requirements:** Call `Skill(skill="groundwork:understanding-feature-requests")`

   Do NOT attempt to gather requirements yourself. The skill handles this.

   If existing specs were loaded, provide them as context so the clarification skill can:
   - Detect contradictions with existing PRD requirements
   - Identify overlap with existing features
   - Understand architectural constraints

   Follow the skill to gather: problem being solved, target user/persona, expected outcome, edge cases and scope boundaries. Continue until requirements are clear and internally consistent.

3. **Generate feature identifier:**
   - Format: `FEATURE-<slug>`
   - Slug rules: lowercase, hyphen-separated, 2-4 words max, derived from core functionality
   - Examples: "Add user login" → `FEATURE-user-login`, "Export reports to PDF" → `FEATURE-pdf-export`

4. Set `identifier=FEATURE-<slug>`, `branch_prefix=feature`.

## Step 3: Spawn Plan Agent

Spawn a Plan agent with mode-appropriate context:

### Task ID mode

```
Agent(
  subagent_type="Plan",
  description="Plan TASK-NNN",
  prompt="Plan the implementation of a task.

  TASK DEFINITION:
  [Paste the task section read in Step 2 — goal, action items, acceptance criteria]

  [If mode=task+blurb, add:]
  ADDITIONAL CONTEXT FROM USER:
  [blurb text]

  SPEC PATHS (read these yourself for full context):
  - Product specs: [path or 'not found']
  - Architecture: [path or 'not found']
  - Design system: [path or 'not found']
  - Tasks file: [path]

  CONSTRAINTS:
  1. Work happens in an isolated git worktree (.worktrees/TASK-NNN)
  2. Implementation must follow TDD — write failing tests first, then make them pass
  3. Plan covers implementation only — validation and merge are handled separately by the caller
  4. If a design system is present, the plan must reference design tokens, colors, and component patterns from it
  "
)
```

### Blurb mode (feature)

```
Agent(
  subagent_type="Plan",
  description="Plan FEATURE-slug",
  prompt="Plan the implementation of a feature.

  FEATURE DEFINITION:
  - Identifier: [FEATURE-slug]
  - Description: [1-2 sentence summary from clarification]

  REQUIREMENTS:
  [Bulleted list of clarified requirements]

  ACCEPTANCE CRITERIA:
  [Bulleted list of acceptance criteria]

  OUT OF SCOPE:
  [Bulleted list of exclusions, or 'None specified']

  SPEC PATHS (read these yourself for full context):
  - Product specs: [path or 'not found']
  - Architecture: [path or 'not found']
  - Design system: [path or 'not found']

  CONSTRAINTS:
  1. Work happens in an isolated git worktree (.worktrees/FEATURE-slug)
  2. Implementation must follow TDD — write failing tests first, then make them pass
  3. Plan covers implementation only — validation and merge are handled separately by the caller
  4. If a design system is present, the plan must reference design tokens, colors, and component patterns from it
  "
)
```

**Validate the plan:**
- [ ] Plan states work happens in a worktree
- [ ] Plan includes TDD cycle

**If ANY unchecked:** Reject plan, state what's missing, re-invoke Plan agent.

## Step 4: Persist Plan

After the plan is validated, persist it to disk in the **same turn** as receiving the Plan agent's output:

1. Create the plans directory and ensure it's gitignored:
   ```bash
   mkdir -p .groundwork-plans
   grep -qxF '.groundwork-plans/' .gitignore 2>/dev/null || printf '.groundwork-plans/\n' >> .gitignore
   ```
   Set `plan_file_path=.groundwork-plans/{identifier}-plan.md` (substitute the actual identifier). One plan per identifier — re-running planning on the same identifier overwrites the previous plan, which is intentional. The `.gitignore` append is idempotent so it is safe to run on every invocation.

2. Use the `Write` tool to save the plan. Format the file as:

   ```markdown
   # Implementation Plan: {identifier} [Title]

   ## Context
   - Mode: task | feature | task+blurb
   - Identifier: {identifier}
   - Branch prefix: {branch_prefix}
   - Specs dir: {{specs_dir}}
   - Tasks path: {path to tasks file, or N/A for features}

   ## Requirements (blurb/feature mode only)
   [Clarified requirements, acceptance criteria, out-of-scope — omit this section in task mode]

   ## Plan
   <verbatim Plan agent output>
   ```

   This is the **only** turn where the plan content appears in orchestrator context.

3. Output exactly:
   ```
   RESULT: PLANNED | plan_file_path={plan_file_path} | identifier={identifier} | branch_prefix={branch_prefix}
   ```

4. Do NOT restate, summarize, or re-quote the plan in any subsequent turn. Refer to `plan_file_path` only.

**DO NOT proceed past this step. The caller handles implementation.**
