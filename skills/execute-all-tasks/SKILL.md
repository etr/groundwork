---
name: execute-all-tasks
description: This skill should be used when executing all remaining tasks in batch mode - orchestrates worktree isolation, TDD, validation, and merge for each task in dependency order
user-invocable: false
---

# Just Do It - Batch Task Execution

Executes all remaining tasks in sequence until completion, stopping on first failure.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high` or higher AND you are Sonnet or Opus.
If effort is below `high`, you MUST show the recommendation prompt — regardless of model.
If you are not Sonnet or Opus, you MUST show the recommendation prompt - regardless of effort level.

Otherwise → use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Do you want to switch? Batch orchestration with dependency ordering and failure handling benefits from consistent reasoning.\n\nTo switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke this skill.",
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

### Step 0: Resolve Project Context

**Before loading tasks, ensure project context is resolved:**

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

### Step 1: Load and Analyze Tasks

1. Read the tasks file to find all tasks:
   - Single file: `{{specs_dir}}/tasks.md`
   - Directory: `{{specs_dir}}/tasks/` (aggregated in sorted order)

2. Parse all tasks and extract:
   - Task ID (e.g., `TASK-001`)
   - Title
   - Status (`Not Started`, `In Progress`, `Complete`, `Blocked`)
   - Dependencies (`Blocked by:` field)

3. Build dependency graph and calculate execution order:
   - Topological sort respecting dependencies
   - Blocked tasks cannot execute until dependencies complete

**Detection:** Check for file first (takes precedence), then directory.

### Step 2: Present Summary and Confirm

Present a summary to the user:

## Batch Task Execution Summary

**Total tasks:** X
**Already complete:** Y
**Remaining:** Z

### Worktree Isolation

Each task will execute in an isolated git worktree:
- Branch: `task/TASK-NNN` created from current HEAD
- Working directory: `.worktrees/TASK-NNN`
- Changes merged automatically after each task completes successfully
- Worktrees cleaned up after successful merge

This ensures each task starts from a clean baseline and changes are integrated incrementally.

### Execution Order
1. TASK-NNN: [Title]
2. TASK-NNN: [Title]
...

### Blocked Tasks (will execute after dependencies complete)
- TASK-NNN: [Title] (blocked by TASK-XXX)

**Ask for confirmation before proceeding.**

If user declines, stop and suggest alternatives:
- `/groundwork:work-on N` to work on a specific task
- `/groundwork:work-on-next-task` to work on just the next available task

### Step 3: Execute Loop (Direct Orchestration)

Each task is executed through 5 phases orchestrated directly from this conversation. This avoids nested sub-tasks (sub-tasks cannot spawn other sub-tasks). The main loop holds only: task list + per-task plan summary, IMPLEMENTED result, validation verdicts, and merge result.

For each remaining task in dependency order:

1. **Read the task section** from `{{specs_dir}}/tasks.md` (or aggregated from `{{specs_dir}}/tasks/`) to extract the full task definition (goal, action items, acceptance criteria, dependencies).

2. **Announce start:** "Starting TASK-NNN: [Title]"

3. **Update task status** to `**Status:** In Progress` in the tasks file.

#### Phase A: Plan

```
Agent(
  subagent_type="Plan",
  description="Plan TASK-NNN",
  prompt="Create implementation plan for TASK-NNN: [task title]

Task definition:
[goal, action items, acceptance criteria from task file]

Relevant product specs:
[extracted from {{specs_dir}}/product_specs.md or {{specs_dir}}/product_specs/]

Relevant architecture:
[extracted from {{specs_dir}}/architecture.md or {{specs_dir}}/architecture/]

REQUIREMENTS FOR THE PLAN:
1. All work happens in worktree .worktrees/TASK-NNN (not main workspace)
2. Must follow TDD: write test → implement → verify cycle
3. Plan covers implementation only — validation and merge are handled separately by the caller
"
)
```

If the plan does not mention worktree or TDD, reject it and re-invoke the Plan agent.

After validation, persist the plan to disk in the **same turn** as receiving the Plan agent's output:

1. `mkdir -p .groundwork-plans && grep -qxF '.groundwork-plans/' .gitignore 2>/dev/null || printf '.groundwork-plans/\n' >> .gitignore`, then set `plan_file_path=.groundwork-plans/TASK-NNN-plan.md` (substitute the actual task ID). Re-running on the same task overwrites — intentional.
2. Use the `Write` tool to save the Plan agent's full output to `plan_file_path`, formatted as:
   ```markdown
   # Implementation Plan: TASK-NNN [Title]

   <verbatim Plan agent output>
   ```
3. From this point on, refer only to `plan_file_path`. Do NOT re-quote the plan in subsequent turns.

#### Phase B: Implement

```
Agent(
  subagent_type="groundwork:task-executor:task-executor",
  description="Implement TASK-NNN",
  prompt="You are implementing a task as part of an automated batch run.

PROJECT ROOT: [absolute path to project root]

TASK:
- task_id: [TASK-NNN]
- tasks_path: [absolute path to {{specs_dir}}/tasks.md or {{specs_dir}}/tasks/]

Read the '### TASK-NNN:' section from tasks_path for goal, action items,
and acceptance criteria. Do not ask the caller for task details.

PLAN FILE: [plan_file_path]
Read this file first with the Read tool — it contains the validated implementation plan.

INSTRUCTIONS:
1. Follow your preloaded skills to create a worktree, implement with TDD, and commit.
2. Read the task section from tasks_path and the plan from PLAN FILE — they provide all session context.
3. Do NOT use AskUserQuestion — proceed automatically.
4. When complete, output your final line in EXACTLY this format:
   RESULT: IMPLEMENTED | <worktree_path> | <branch> | <base_branch>
   OR:
   RESULT: FAILURE | [one-line reason]

Your LAST line of output MUST be the RESULT line.
"
)
```

Parse the result:
- `RESULT: IMPLEMENTED | <path> | <branch> | <base_branch>` → Save these values, proceed to Phase C
- `RESULT: FAILURE | ...` → STOP immediately, report failure
- No parseable RESULT line → Treat as failure

#### Phase C: Validate

**Findings storage prologue (run FIRST):** Create a per-task findings directory and initialize an iteration counter. Validation agents will write their full review JSON to per-iteration files inside this directory; the orchestrator will only see compact one-line responses.

```bash
cd <worktree_path>
mktemp -d -t groundwork-validation-XXXXXX     # save the printed path as findings_dir
git diff --name-only HEAD~1                    # changed file paths
git diff --stat HEAD~1                         # diff stat summary
```

Initialize `iteration_number = 1`. Maintain orchestrator working notes (in-context, NOT in any project file) of the form:

```
findings_dir: /tmp/groundwork-validation-XXXXXX
iteration_number: 1
iterations:
  1:
    agent_files:
      code-quality-reviewer: /tmp/groundwork-validation-XXXXXX/findings-code-quality-reviewer-iter1.json
      security-reviewer:     /tmp/groundwork-validation-XXXXXX/findings-security-reviewer-iter1.json
      ...
    findings_fixed: []
    findings_skipped: []
```

Then launch all 10 validation agents **in parallel** using the Agent tool:

```
Agent(subagent_type="groundwork:code-quality-reviewer:code-quality-reviewer", description="Review TASK-NNN quality", prompt="...")
Agent(subagent_type="groundwork:security-reviewer:security-reviewer", description="Review TASK-NNN security", prompt="...")
Agent(subagent_type="groundwork:spec-alignment-checker:spec-alignment-checker", description="Check TASK-NNN spec alignment", prompt="...")
Agent(subagent_type="groundwork:architecture-alignment-checker:architecture-alignment-checker", description="Check TASK-NNN arch alignment", prompt="...")
Agent(subagent_type="groundwork:code-simplifier:code-simplifier", description="Simplify TASK-NNN code", prompt="...")
Agent(subagent_type="groundwork:housekeeper:housekeeper", description="Check TASK-NNN housekeeping", prompt="...")
Agent(subagent_type="groundwork:performance-reviewer:performance-reviewer", description="Review TASK-NNN performance", prompt="...")
Agent(subagent_type="groundwork:test-quality-reviewer:test-quality-reviewer", description="Review TASK-NNN test quality", prompt="...")
Agent(subagent_type="groundwork:design-consistency-checker:design-consistency-checker", description="Check TASK-NNN design", prompt="...")
Agent(subagent_type="groundwork:cloud-infrastructure-reviewer:cloud-infrastructure-reviewer", description="Check TASK-NNN cloud infra", prompt="...")
Agent(subagent_type="groundwork:conventions-reviewer:conventions-reviewer", description="Check TASK-NNN cloud infra", prompt="...")
```

Each agent receives: changed file paths, diff stat, task definition, and relevant spec/architecture/design paths. **Each prompt MUST also include:**

```
findings_file: {findings_dir}/findings-{agent_name}-iter{iteration_number}.json
agent_name: {agent_name}
iteration: {iteration_number}
```

Substitute `{agent_name}` with the agent's short name (`code-quality-reviewer`, etc.). Also include in each prompt: "Use the Read tool to examine these files. Do NOT expect file contents in this prompt — read them yourself. Write your full review JSON to the `findings_file` path above using the Write tool, then return ONLY the compact one-line JSON response. Do NOT print findings inline."

**Each agent's compact response is a single JSON line:**

```json
{"verdict":"approve","score":85,"summary":"...","findings_file":"/tmp/groundwork-validation-XXXXXX/findings-<agent>-iter1.json","counts":{"critical":0,"major":1,"minor":2}}
```

The full review file format (written by the agent to `findings_file`) is:

```json
{
  "agent": "code-quality-reviewer",
  "iteration": 1,
  "summary": "...",
  "score": 85,
  "verdict": "approve",
  "findings": [
    {"id": 1, "severity": "major", "category": "...", "file": "...", "line": 42, "finding": "...", "recommendation": "..."}
  ]
}
```

The **stable global ID** of a finding is `{agent_name}-iter{N}-{id}` (e.g. `code-quality-reviewer-iter1-2`).

Parse only the compact line. Record each agent's `findings_file` path in the iteration tracking notes. Do NOT read finding bodies into context.

#### Phase D: Fix Loop (if needed)

If any agent returns `request-changes`:

1. Build the list of `findings_file` paths from agents whose verdict in this iteration is `request-changes` (look them up in your iteration tracking notes for the current `iteration_number`). **Do NOT inline the contents of those files into the prompt.**
2. Spawn the validation-fixer agent:
   ```
   Agent(
     subagent_type="groundwork:validation-fixer:validation-fixer",
     description="Fix TASK-NNN validation findings",
     prompt="Working directory: <worktree_path>
   Iteration: N

   FINDINGS FILES:
   - [path to findings-<agent>-iter<N>.json]
   - [path to findings-<other-agent>-iter<N>.json]
   ...

   Read each file with the Read tool. Each is a JSON object with shape:
     { agent, iteration, summary, score, verdict, findings: [{id, severity, category, file, line, finding, recommendation}, ...] }

   Address all critical and major findings across these files. Skip minor findings.
   Reference each finding by its global ID: {agent}-iter{iteration}-{id} (e.g. code-quality-reviewer-iter1-2)."
   )
   ```
3. Parse the fix agent result. Its `RESULT:` line uses **global IDs** (`{agent}-iter{N}-{id}`):
   - `RESULT: FIXED | files_touched: [...] | findings_fixed: [global-id, ...]` → all findings addressed, proceed to re-validation
   - `RESULT: PARTIAL | files_touched: [...] | findings_fixed: [global-id, ...] | findings_skipped: [global-id: reason, ...]` → log skipped findings, proceed to re-validation with fixed subset; skipped findings feed stuck detection
   - `RESULT: FAILURE | [reason]` → log failure, report and continue

   Record `findings_fixed` and `findings_skipped` (as global ID lists) in the iteration tracking notes under the current `iteration_number`. These are what Phase D.5 uses to compute the unexecuted set.
4. Re-run validation agents (same as Phase C). **Bump `iteration_number` by 1 first**, append a new iteration block to your tracking notes, and pass each re-run agent a *new* `findings_file` path (`...-iter{N+1}.json`) so the previous iteration's file is preserved on disk for Phase D.5.
5. Repeat until all agents approve
6. **Stuck detection:** Track findings by their global ID prefix `[Agent]-[Category]-[File]-[Line]`. If the same finding persists after 3 iterations (including findings repeatedly skipped by the fix agent), report it and continue (do not block indefinitely). If you need to surface body details for the report, Read the relevant `findings_file` once.

#### Phase D.5: Persist Unexecuted Findings

After all agents approve, persist any unfixed findings via the helper script. The orchestrator does **not** `Read` any findings file itself, and does **not** `Read` the file the script produces. The helper does all of the file I/O outside the orchestrator's context window.

1. Build `fixed_ids_csv` by joining (with commas, no spaces) every global ID in `findings_fixed` across every iteration of the tracking notes. (Free — these IDs are already in context.) If no findings were fixed, pass an empty string.
2. Use the current task's identifier (e.g. `TASK-042: Title`) as `task_id`.
3. Run:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/lib/persist-unworked-findings.js \
     --findings-dir "<findings_dir>" \
     --specs-dir   "{{specs_dir}}" \
     --task-id     "<task_id>" \
     --fixed-ids   "<fixed_ids_csv>"
   ```
4. **Do NOT print, echo, `cat`, or `Read` the contents of the file the script produces** — that would re-pollute the orchestrator's context with the very findings the script exists to keep out. The single-line JSON the script writes to stdout is the only thing to look at.
5. Parse that one-line JSON:
   - `status: "written"` → record `Unexecuted findings: <total> persisted to <written>` in the per-task log line, where `<total>` is `counts.critical + counts.major + counts.minor` and `<written>` is the path the script returned.
   - `status: "empty"` or `status: "no-findings-files"` → record `Unexecuted findings: 0`.
   - **Stop there — do not summarize what's in the file.**

**Cleanup (run at the very end of Phase D.5, before proceeding to Phase E):** delete the per-task findings directory created at the start of Phase C. Only delete the `findings_dir` path that was returned by `mktemp -d -t groundwork-validation-XXXXXX`:

```bash
rm -rf "<findings_dir>"
```

If `findings_dir` was never created (e.g., Phase C bailed out before creating it), skip cleanup.

#### Phase E: Merge

From the project root (NOT the worktree):

```bash
git checkout <base_branch>
git merge --no-ff <branch> -m "Merge <branch>: [Task Title]"
git worktree remove .worktrees/TASK-NNN
git branch -d <branch>
```

If merge conflicts occur, report them and preserve the worktree for investigation. STOP.

4. **Update task status** to `**Status:** Complete` in the tasks file.

5. **Log result:** "Completed TASK-NNN: [Title] — [one-line summary]"

**On Failure at any phase:** Report the failed task, phase, reason, tasks completed this session, and tasks remaining. Note that the failed task's worktree is preserved at `.worktrees/TASK-NNN` for investigation.

### Step 4: Completion Report

When all tasks complete successfully, report:

```markdown
## Batch Execution Complete

**Session Summary:**
- Tasks completed: X
- Total tasks complete: Y/Z
- All worktrees merged and cleaned up

### Completed Tasks
| Task | Title | Branch | Status |
|------|-------|--------|--------|
| TASK-001 | [Title] | task/TASK-001 | Merged |
| TASK-002 | [Title] | task/TASK-002 | Merged |
...

### Worktree Summary
- Worktrees created: X
- Successfully merged: X
- Cleaned up: X

### Next Steps
- Run `/source-product-specs-from-code` to update specs with any implementation changes
- Plan next phase if milestone complete
- Review merged changes with `git log --oneline -10`
```

## Edge Cases

| Situation | Response |
|-----------|----------|
| No tasks file | "Tasks file not found. Run `/groundwork:create-tasks` to generate tasks." |
| No remaining tasks | "All tasks are already complete! Nothing to execute." |
| All remaining blocked | "All remaining tasks are blocked. Cannot proceed automatically." |
| Single task remaining | Execute normally (still confirm before starting) |
