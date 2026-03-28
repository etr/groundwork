---
name: task-validation-loop
description: This skill should be used when the task list is complete to run multi-agent verification ensuring tasks cover PRD, follow architecture, and respect design system
user-invocable: false
---

# Task Validation Loop Skill

Autonomous verification loop that runs 3 specialized agents to validate task list completeness and alignment before implementation begins.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high` or higher AND you are Sonnet or Opus.
If effort is below `high`, you MUST show the recommendation prompt — regardless of model.
If you are not Sonnet or Opus, you MUST show the recommendation prompt - regardless of effort level.

Otherwise → use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Do you want to switch? Fix loop management across 3 validation agents benefits from consistent reasoning.\n\nTo switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke this skill.",
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

## Step 0: Resolve Project Context

**Before loading specs, ensure project context is resolved:**

1. **Check `.groundwork.yml`:** Does a monorepo config file exist at the repo root?
   - If yes → Check if `GROUNDWORK_PROJECT` is set. If not, list projects and ask the user to select one.
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

## Prerequisites

Before invoking this skill, ensure:
- Task list is complete ({{specs_dir}}/tasks/ directory or {{specs_dir}}/tasks.md exists)
- PRD exists ({{specs_dir}}/product_specs.md)
- Architecture exists ({{specs_dir}}/architecture.md)
- User has approved the task breakdown

## Workflow

### 1. Gather Context

Collect inputs for the agents:

```
task_list     ← Read {{specs_dir}}/tasks.md (or {{specs_dir}}/tasks/ directory)
product_specs ← Read {{specs_dir}}/product_specs.md (or {{specs_dir}}/product_specs/ directory)
architecture  ← Read {{specs_dir}}/architecture.md (or {{specs_dir}}/architecture/ directory)
design_system ← Read {{specs_dir}}/design_system.md (if exists, optional)
```

**Detection:** Check for file first (takes precedence), then directory. When reading a directory, aggregate all `.md` files recursively.

### 1.5. Determine Active Agents

| Agent | Skip when |
|---|---|
| `design-task-alignment-checker` | No `design_system` found AND no UI/frontend tasks in task list |

`prd-task-alignment-checker` and `architecture-task-alignment-checker` always run (their inputs are prerequisites).

Record skipped agents with verdict `skipped`.

### 2. Launch Validation Agents

Use Agent tool to launch all 3 agents in parallel:

| Agent (`subagent_type`) | Context to Provide |
|-------------------------|-------------------|
| `groundwork:prd-task-alignment-checker:prd-task-alignment-checker` | task_list, product_specs |
| `groundwork:architecture-task-alignment-checker:architecture-task-alignment-checker` | task_list, architecture |
| `groundwork:design-task-alignment-checker:design-task-alignment-checker` | task_list, design_system |

Each returns JSON:
```json
{
  "summary": "One-sentence assessment",
  "score": 0-100,
  "findings": [{"severity": "critical|major|minor", "category": "...", "task_reference": "TASK-NNN", "finding": "...", "recommendation": "..."}],
  "verdict": "approve|request-changes"
}
```

### 3. Aggregate Results

Present results in table format:

```markdown
## Task List Validation Report

| Agent | Score | Verdict | Critical | Major | Minor |
|-------|-------|---------|----------|-------|-------|
| PRD Alignment | 92 | approve | 0 | 1 | 2 |
| Architecture Alignment | 88 | approve | 0 | 1 | 1 |
| Design Alignment | 85 | approve | 0 | 2 | 1 |

**Overall:** PASS / NEEDS FIXES
```

### 4. Autonomous Fix-and-Retry Loop

**Rule**: Continue this loop until ALL agents return `approve`.

**On any `request-changes` verdict:**

1. **Log Iteration**
   ```markdown
   ## Validation Iteration [N]
   | Agent | Verdict | Findings |
   |-------|---------|----------|
   | ... | ... | ... |
   Fixing [X] issues...
   ```

2. **Fix Each Finding** - Apply each critical/major recommendation
   - Modify the relevant task file in {{specs_dir}}/tasks/ (or {{specs_dir}}/tasks.md if single-file)
   - Track what was changed
   - Note which finding each fix addresses

   Fix types:
   - **requirement-not-tasked**: Add new task for the requirement
   - **component-mismatch**: Update task's Component field
   - **accessibility-missing**: Add acceptance criteria to task
   - **over-tasked**: Remove task or add requirement to PRD (user decision)

3. **Re-run Agent Validation** — Re-launch ONLY agents that returned `request-changes`. Agents that approved retain their verdict unless the fix changed content in their domain:
   - **PRD alignment checker**: re-run if tasks were added/removed or requirements mapping changed
   - **Architecture alignment checker**: re-run if component assignments or technology references changed
   - **Design alignment checker**: re-run if accessibility criteria or design token references changed

   For agents NOT re-run, carry forward their previous `approve` verdict and score.

4. **Check Results**
   - ALL approve → **PASS**, return success
   - Any request-changes → Return to step 1

### 5. Stuck Detection

Track findings by key: `[Agent]-[Category]-[TaskRef]`

If same finding appears **3 times**:

```markdown
## Stuck - Need User Input

Issue persists after 3 attempts:

**[Agent] Finding description**
- Task: TASK-NNN
- Category: [category]
- Attempts:
  1. [what was tried]
  2. [what was tried]
  3. [what was tried]

I need clarification: [specific question]
```

- Use AskUserQuestion for guidance
- Apply fix based on user input
- Continue loop

Also escalate when:
- Conflicting requirements between PRD and architecture
- Missing information to create required task
- Scope decisions needed (add to PRD vs. remove task)

### 6. Return Result

**On PASS:**
```markdown
## Task List Validation PASSED

All 3 agents approved after [N] iteration(s).

| Agent | Score | Verdict | Summary |
|-------|-------|---------|---------|
| PRD Alignment | 95 | APPROVE | All requirements covered |
| Architecture Alignment | 92 | APPROVE | Tasks follow architecture |
| Design Alignment | 90 | APPROVE | UI tasks include a11y |

Issues fixed:
- [Iteration N] Agent: Description

Coverage Summary:
- PRD Requirements: [X]% covered
- Architecture Components: All referenced
- Design System: [Applied/N/A]

Minor suggestions (optional):
- ...
```

Return control to calling skill (tasks skill).

## Severity Reference

| Level | Action |
|-------|--------|
| critical | Must fix, loop continues |
| major | Must fix, loop continues |
| minor | Optional, does not block |

## Edge Cases

**No design system:**
- Design agent still runs (checks accessibility)
- Note in summary: "Design system not found"

**Agent returns error:**
- Log the error
- Retry once
- If still fails, escalate to user

**All agents approve immediately:**
- Log success
- Return without iteration
