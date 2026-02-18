---
name: groundwork:just-do-it
description: Execute all remaining tasks in sequence until completion. Usage /groundwork:just-do-it
allowed-tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Task", "AskUserQuestion"]
disable-model-invocation: true
---

# Just Do It - Batch Task Execution

Executes all remaining tasks in sequence until completion, stopping on first failure.

## Workflow

### Step 1: Load and Analyze Tasks

1. Read the tasks file to find all tasks:
   - Single file: `specs/tasks.md`
   - Directory: `specs/tasks/` (aggregated in sorted order)

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

Each task is executed through 5 phases orchestrated directly from this conversation. This avoids nested subagents (subagents cannot spawn other subagents). The main loop holds only: task list + per-task plan summary, IMPLEMENTED result, validation verdicts, and merge result.

For each remaining task in dependency order:

1. **Read the task section** from `specs/tasks.md` (or aggregated from `specs/tasks/`) to extract the full task definition (goal, action items, acceptance criteria, dependencies).

2. **Announce start:** "Starting TASK-NNN: [Title]"

3. **Update task status** to `**Status:** In Progress` in the tasks file.

#### Phase A: Plan

```
Task(
  subagent_type="Plan",
  description="Plan TASK-NNN",
  prompt="Create implementation plan for TASK-NNN: [task title]

Task definition:
[goal, action items, acceptance criteria from task file]

Relevant product specs:
[extracted from specs/product_specs.md or specs/product_specs/]

Relevant architecture:
[extracted from specs/architecture.md or specs/architecture/]

REQUIREMENTS FOR THE PLAN:
1. All work happens in worktree .worktrees/TASK-NNN (not main workspace)
2. Must follow TDD: write test → implement → verify cycle
3. Plan covers implementation only — validation and merge are handled separately by the caller
"
)
```

Save the plan summary. If the plan does not mention worktree or TDD, reject it and re-invoke the Plan agent.

#### Phase B: Implement

```
Task(
  subagent_type="groundwork:task-executor:task-executor",
  description="Implement TASK-NNN",
  prompt="You are implementing a task as part of an automated batch run.

PROJECT ROOT: [absolute path to project root]

TASK DEFINITION:
- Identifier: [TASK-NNN]
- Title: [Task Title]

GOAL:
[Goal from task file]

ACTION ITEMS:
[Bulleted list from task file]

ACCEPTANCE CRITERIA:
[Bulleted list from task file]

IMPLEMENTATION PLAN:
[Summary of validated plan from Phase A]

INSTRUCTIONS:
1. Follow your preloaded skills to create a worktree, implement with TDD, and commit.
2. Do NOT use AskUserQuestion — proceed automatically.
3. When complete, output your final line in EXACTLY this format:
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

Gather context via Bash (from the worktree):
```bash
cd <worktree_path>
git diff --name-only HEAD~1    # changed file paths
git diff --stat HEAD~1          # diff stat summary
```

Then launch all 8 validation agents **in parallel** using the Task tool:

```
Task(subagent_type="groundwork:code-quality-reviewer:code-quality-reviewer", description="Review TASK-NNN quality", prompt="...")
Task(subagent_type="groundwork:security-reviewer:security-reviewer", description="Review TASK-NNN security", prompt="...")
Task(subagent_type="groundwork:spec-alignment-checker:spec-alignment-checker", description="Check TASK-NNN spec alignment", prompt="...")
Task(subagent_type="groundwork:architecture-alignment-checker:architecture-alignment-checker", description="Check TASK-NNN arch alignment", prompt="...")
Task(subagent_type="groundwork:code-simplifier:code-simplifier", description="Simplify TASK-NNN code", prompt="...")
Task(subagent_type="groundwork:housekeeper:housekeeper", description="Check TASK-NNN housekeeping", prompt="...")
Task(subagent_type="groundwork:performance-reviewer:performance-reviewer", description="Review TASK-NNN performance", prompt="...")
Task(subagent_type="groundwork:design-consistency-checker:design-consistency-checker", description="Check TASK-NNN design", prompt="...")
```

Each agent receives: changed file paths, diff stat, task definition, and relevant spec/architecture/design paths. Include in each prompt: "Use the Read tool to examine these files. Do NOT expect file contents in this prompt — read them yourself."

Each returns JSON with `verdict: "approve" | "request-changes"`.

#### Phase D: Fix Loop (if needed)

If any agent returns `request-changes`:

1. Collect all findings with severity `critical` or `major`
2. Spawn a general-purpose agent to fix the issues:
   ```
   Task(
     subagent_type="general-purpose",
     description="Fix TASK-NNN issues",
     prompt="Fix the following issues in <worktree_path>:
   [List of findings with file, line, recommendation]
   Run tests after fixing to ensure nothing breaks.
   Output: RESULT: FIXED | [summary of fixes]"
   )
   ```
3. Re-run all 8 validation agents (same as Phase C)
4. Repeat until all agents approve
5. **Stuck detection:** If the same finding persists after 3 iterations, report it and continue (do not block indefinitely)

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
