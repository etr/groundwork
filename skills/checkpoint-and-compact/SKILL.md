---
name: checkpoint-and-compact
description: This skill should be used to save workflow state to disk and trigger context compaction - preserves the current workflow step so it can be resumed after compaction
user-invocable: false
---

# Checkpoint and Compact

Saves current workflow state to disk and triggers context compaction. After compaction, the session-start hook detects the saved state and resumes the workflow automatically.

## Usage

Called by workflow skills (execute-task, execute-all-tasks) when context is bloated and needs compaction before continuing. **Do not call this skill directly** — it is invoked by other skills at specific checkpoints.

**Arguments:** Positional format: `<skill-name> <step> [task-id]`

Examples:
- `"execute-task 7.5 TASK-004"` — resume execute-task at Step 7.5 for TASK-004
- `"execute-all-tasks 3.C TASK-007"` — resume execute-all-tasks at Phase C for TASK-007

## Procedure

### 1. Parse Arguments

Parse the positional arguments from the skill invocation:
- **Arg 1** (`skill`): The workflow/skill name to resume (e.g., `execute-task`, `execute-all-tasks`)
- **Arg 2** (`step`): The step/phase to resume at (e.g., `7.5`, `3.C`)
- **Arg 3** (`taskId`): Optional task identifier (e.g., `TASK-004`)

If fewer than 2 arguments are provided, report an error and stop.

### 2. Get Session ID

Read the session ID persisted by the session-start hook:

```bash
cat ~/.claude/groundwork-state/current-session-id
```

Save the result as `sessionId`. If the file doesn't exist, report an error and stop — the session-start hook must run first.

### 3. Gather Additional Context

Before writing the state file, you MUST gather all context from the current conversation that will be needed to resume the workflow. This includes but is not limited to:

- **Worktree path** (from implementation RESULT)
- **Branch name** (from implementation RESULT)
- **Base branch** (from implementation RESULT)
- **Batch mode** (`GROUNDWORK_BATCH_MODE` value)
- **Current working directory** (`pwd`)
- **Any other workflow-specific state** that the target step requires

Collect these values into an `additionalContext` object.

### 4. Write State File

Construct a JSON object with these fields:
- `skill` (string) — the workflow/skill name from Arg 1
- `resumeStep` (string) — the step to resume at from Arg 2
- `taskId` (string|null) — task identifier from Arg 3, or null if not provided
- `additionalContext` (object) — all gathered context from Step 3
- `timestamp` (number) — current epoch seconds

Write this JSON to: `~/.claude/groundwork-state/workflow-state-{sessionId}.json`

Use Bash to write the file:

```bash
mkdir -p ~/.claude/groundwork-state
cat > ~/.claude/groundwork-state/workflow-state-{sessionId}.json << 'CHECKPOINT_EOF'
{
  "skill": "<skill-name>",
  "resumeStep": "<step>",
  "taskId": "<task-id-or-null>",
  "additionalContext": {
    "worktreePath": "<path>",
    "branch": "<branch>",
    "baseBranch": "<base-branch>",
    "batchMode": <true|false>,
    "cwd": "<working-directory>"
  },
  "timestamp": <epoch-seconds>
}
CHECKPOINT_EOF
```

### 5. Trigger Compaction

**You MUST now run `/compact` to trigger context compaction.** This is not optional. The session-start hook will detect the saved state file and inject a `<workflow-restoration>` directive that resumes the workflow automatically.

After compaction completes, do NOT take any further action — the session-start hook handles restoration.
