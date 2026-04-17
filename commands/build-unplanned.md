---
name: groundwork:build-unplanned
description: Build a feature from description with worktree isolation and TDD. Usage /groundwork:build-unplanned "Add user login"
argument-hint: "[feature-description]"
allowed-tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Task", "Skill", "AskUserQuestion"]
disable-model-invocation: true
---

# Build Unplanned Feature

Thin orchestrator for ad-hoc feature development without existing task definitions. Delegates to `task-planning` (blurb mode), `task-implementation`, and `validation-loop`.

## Token Discipline

This skill orchestrates long multi-agent workflows. Every turn re-reads the full context window, so unnecessary turns are expensive.

1. **No narration turns.** Do not output text-only turns like "Let me understand your feature" or "Now I'll dispatch implementation." Combine text with a tool call in the same turn, or skip the text entirely.
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
    "question": "Feature development benefits from consistent multi-domain reasoning.\n\nRecommended: Sonnet or Opus at high effort.\n\nTo switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke.",
    "header": "Effort check",
    "options": [
      { "label": "Continue anyway" },
      { "label": "Cancel — I'll switch first" }
    ],
    "multiSelect": false
  }]
}
```

If the user selects "Cancel — I'll switch first": output the switching commands and stop. Do not proceed with the skill.

## Step 0: Resolve Project Context

1. **Monorepo check:** Does `.groundwork.yml` exist at the repo root?
   - If yes → Is `{{project_name}}` non-empty?
     - If empty → Invoke `Skill(skill="groundwork:project-selector")` to select a project, then restart this skill.
     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.
   - If no → Continue (single-project repo).
2. **CWD mismatch check (monorepo only):**
   - Skip if not in monorepo mode or if the project was just selected above.
   - If CWD is the repo root → fine, proceed.
   - Check which project's path CWD falls inside (compare against all projects in `.groundwork.yml`).
   - If CWD is inside the selected project's path → fine, proceed.
   - If CWD is inside a different project's path → warn via `AskUserQuestion`:
     > "You're working from `<cwd>` (inside **[cwd-project]**), but the selected Groundwork project is **[selected-project]** (`[selected-project-path]/`). What would you like to do?"
     > - "Switch to [cwd-project]"
     > - "Stay with [selected-project]"
     If the user switches, invoke `Skill(skill="groundwork:project-selector")`.
   - If CWD doesn't match any project → proceed without warning (shared directory).
3. Proceed with the resolved project context.

## Step 1: Parse Feature Description

- **Argument provided:** Use the argument text as the feature blurb.
- **No argument:** Use `AskUserQuestion` to ask:
  > "What feature would you like to build? Describe it briefly."

## Step 2: Plan → `task-planning`

Call `Skill(skill="groundwork:task-planning")` with the blurb from Step 1 in the conversation context. Do NOT pass a task_id — this triggers blurb/feature mode in task-planning, which will:
- Load existing specs (if any)
- Call `understanding-feature-requests` for requirement clarification
- Generate a `FEATURE-<slug>` identifier
- Spawn a Plan agent and persist the plan

**Parse the output:**
- `RESULT: PLANNED | plan_file_path=<path> | identifier=<id> | branch_prefix=<prefix>` → Save `plan_file_path`, `identifier`, `branch_prefix`. Proceed.
- `RESULT: FAILURE | ...` → Report the failure to the user and stop.

### Step 2.5: Confirm Start

Use `AskUserQuestion`:

> "[identifier] — plan ready. Proceed to implementation?"
> - Option 1: "Yes, begin implementation"
> - Option 2: "Stop here — I'll review the plan first"

**If "Stop here":** Print the plan file path and stop:

    Plan saved to: <plan_file_path>
    
    To resume implementation later:
    /groundwork:implement-task <plan_file_path>

## Step 3: Implement → `task-implementation`

Call `Skill(skill="groundwork:task-implementation")` with `plan_file_path` in the conversation context. Do NOT pass a task_id.

**Parse the output:**
- `RESULT: IMPLEMENTED | worktree_path=<path> | branch=<branch> | base_branch=<bb>` → Save values. Proceed.
- `RESULT: FAILURE | ...` → Report failure to the user and stop.

### Step 3.5: Optional Context Clear Pause

Use `AskUserQuestion`:

> "Implementation complete for [identifier]. Validation runs 9 reviewer agents next and can compound context. Clear context before validation?"
> - Option 1: "Continue to validation now"
> - Option 2: "Stop here — I'll clear and resume manually"

**If "Continue to validation now":** Proceed to Step 4.

**If "Stop here":** Print resume instructions and STOP:

    ## Paused before validation

    Implementation is committed in:
    - **Worktree:** `<worktree_path>`
    - **Branch:** `<branch>`
    - **Base branch:** `<base_branch>`

    To resume validation in a clean context:

    1. Run `/clear` to clear Claude Code context
    2. `cd <worktree_path>`
    3. Run `/groundwork:validate`

    After validation passes, merge manually from the project root:

        cd <project_root>
        git checkout <base_branch>
        git merge --no-ff <branch>
        git worktree remove <worktree_path>
        git branch -d <branch>

## Step 4: Validate

1. `cd` into the worktree path from Step 3
2. Call: `Skill(skill='groundwork:validation-loop')`
3. The validation-loop skill will run 9 verification agents in parallel and fix issues autonomously.

**After validation-loop completes:**
- All agents approved → Proceed to Step 5
- Validation failed → Report failure and worktree location for investigation, stop
- Stuck on recurring issue → Report the stuck finding and stop

## Step 5: Merge Decision

**From the project root** (NOT the worktree), handle merge:

Use `AskUserQuestion` to ask:

> "Implementation and validation complete for [identifier]. Would you like me to merge this into [base-branch] now?"
> - Option 1: "Yes, merge now"
> - Option 2: "No, I'll merge manually later"

**Wait for user response before proceeding.**

**If merging:**

1. Ensure you are in the project root (cd out of worktree if needed)
2. Checkout base branch: `git checkout <base-branch>`
3. Merge: `git merge --no-ff <branch> -m "Merge <branch>: [Feature Title]"`
4. If success: Remove worktree and delete branch:
   ```bash
   git worktree remove .worktrees/<identifier>
   git branch -d <branch>
   ```
5. If conflicts: Report conflicts and keep worktree for manual resolution

**If not merging or conflicts occurred:**

```markdown
## Implementation Complete in Worktree

**Location:** .worktrees/<identifier>
**Branch:** feature/<identifier>

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

## Step 6: Report

Output implementation summary:

```markdown
## Feature Complete: [identifier]

**What was done:**
- [summary]

**Validation:** Passed ([N] iteration(s))

**Worktree status:** [Merged to <branch> | Pending at .worktrees/<identifier>]
```

Output the final result line:

```
RESULT: SUCCESS | [one-line summary]
```

---

## Reference

### Branch Naming

This skill uses `feature/` prefix (not `task/`) to distinguish ad-hoc features from planned tasks:
- Planned tasks: `task/TASK-NNN`
- Ad-hoc features: `feature/FEATURE-<slug>`

### Standalone Usage

This skill is designed for standalone use when:
- No product specs exist
- No task definitions exist
- Quick prototyping is needed
- Ad-hoc feature requests come in

For planned work with existing specs, use `groundwork:execute-task` instead.
