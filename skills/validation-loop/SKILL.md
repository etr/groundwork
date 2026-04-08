---
name: validation-loop
description: This skill should be used when implementation is complete to run multi-agent verification with autonomous fix-and-retry until all agents approve
user-invocable: false
---

# Validation Loop Skill

Autonomous verification loop that runs 9 specialized agents and fixes issues until all approve.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high` or higher AND you are Sonnet or Opus.
If effort is below `high`, you MUST show the recommendation prompt — regardless of model.
If you are not Sonnet or Opus, you MUST show the recommendation prompt - regardless of effort level.

Otherwise → use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Do you want to switch? Fix loop management and domain spillover judgment across 9 agents benefits from consistent reasoning.\n\nTo switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke this skill.",
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

## Hard Rule — Fixes Go Through The validation-fixer Agent

**You MUST NOT modify any source file yourself in this skill.** Every fix — behavioral or cosmetic, one line or fifty, "just a rename", "just one sed", "a quick batch of actionable findings" — goes through `Agent(subagent_type="groundwork:validation-fixer:validation-fixer", ...)`. The forbidden channels are:

- `Edit`, `Write`, `NotebookEdit` tools applied to **source code or project files**
- `Bash` with `sed -i`, `awk -i`, `tee`, `>`, `>>`, heredoc redirects, or any other shell construct that mutates a **source-code or project file**
- Any other path that changes a project file from inside the orchestrator's tool calls

**Narrow exemptions** (these are NOT fixes, they are loop bookkeeping and explicitly allowed):
- **Reading** findings files written by validation agents under the per-run `findings_dir` (using the `Read` tool). This is required by step 5.5.
- **Deleting** the per-run `findings_dir` at the end of the loop via `Bash` `rm -rf` (only the temp directory created by `mktemp -d -t groundwork-validation-XXXXXX`, never anything else).
- **Writing** to `{{specs_dir}}/minor_todos.md` via the `Write` tool in step 5.5 to persist unexecuted findings. This is the **only** project file the orchestrator may write to, and only for that purpose.

The core rule — *no orchestrator edits to source code; all source-code fixes go through validation-fixer* — is unchanged.

**Why this rule exists:** This skill exists specifically to keep fix work *out* of the orchestrator's context window. If you fix things yourself, you burn the budget you saved by dispatching the 9 reviewers as subagents, and the next iteration's reviewers re-read a context that's already polluted with diff details. If you find yourself reasoning *"these findings are simple enough to fix directly"* or *"I'll just batch these renames inline"*, **stop** — that is the exact failure mode this rule exists to prevent. Dispatch to validation-fixer instead.

This rule has no exceptions for source-code fixes. It applies even when:
- The findings look trivial (one-character changes still go through the subagent)
- The fixer subagent previously returned PARTIAL or FAILURE (re-dispatch with clarification, do not fall back to direct edits)
- You judge dispatching to be "wasteful overhead" for the size of the fix (the cost model that justifies that judgment is wrong — see "Why" above)

## Findings Storage

Validation agents write their full JSON reviews (summary + score + verdict + findings array) to per-run, per-iteration files inside a temp directory. The orchestrator only sees a compact one-line response from each agent. This keeps finding bodies out of the orchestrator's context window — they are read again only by the validation-fixer subagent (which has its own context) and once at the very end of the loop by step 5.5.

**Per-run directory** (created in step 1):
```
findings_dir = $(mktemp -d -t groundwork-validation-XXXXXX)
```

**Per-invocation file** (one file per agent per iteration):
```
{findings_dir}/findings-{agent_name}-iter{N}.json
```

A new file per iteration preserves history across the fix-and-retry loop, so step 5.5 can collect unexecuted findings from every iteration.

**Full review file format** (written by each agent to its `findings_file`):
```json
{
  "agent": "code-quality-reviewer",
  "iteration": 1,
  "summary": "One-sentence assessment",
  "score": 85,
  "verdict": "approve",
  "findings": [
    {"id": 1, "severity": "major", "category": "...", "file": "...", "line": 42, "finding": "...", "recommendation": "..."},
    {"id": 2, "severity": "minor", "category": "...", "file": "...", "line": 10, "finding": "...", "recommendation": "..."}
  ]
}
```

The **stable global ID** of a finding is `{agent_name}-iter{N}-{id}` (e.g. `code-quality-reviewer-iter1-2`). Use these IDs anywhere you need to reference a finding across iterations (fix-agent prompts, stuck detection, minor_todos).

**Compact agent response** (single JSON line returned by each agent):
```json
{"verdict":"approve","score":85,"summary":"One-sentence assessment","findings_file":"/tmp/groundwork-validation-XXXXXX/findings-code-quality-reviewer-iter1.json","counts":{"critical":0,"major":1,"minor":2}}
```

This is the only thing the orchestrator parses from agent responses. It must NOT expect or rely on findings appearing in the conversational response.

## Prerequisites

Before invoking this skill, ensure:
- Implementation is complete
- Tests pass
- Changes are ready for review

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

## Workflow

### 1. Gather Context

**Findings storage prologue (run FIRST in this step):** Create the per-run findings directory before doing anything else:

```bash
mktemp -d -t groundwork-validation-XXXXXX
```

Save the printed path as `findings_dir`. Initialize `iteration_number = 1`. You will pass `{findings_dir}/findings-{agent}-iter{N}.json` to every agent invocation, reference these files in step 4.2, read them in step 5.5, and delete the directory in step 6. See the "Findings Storage" section above for the file layout and contract.

**Maintain orchestrator working notes** (in your in-context working state, NOT in any spec file) of the form:

```
findings_dir: /tmp/groundwork-validation-XXXXXX
iteration_number: 1
iterations:
  1:
    agent_files:
      code-quality-reviewer: /tmp/groundwork-validation-XXXXXX/findings-code-quality-reviewer-iter1.json
      security-reviewer:     /tmp/groundwork-validation-XXXXXX/findings-security-reviewer-iter1.json
      ...
    findings_fixed: []     # populated after the fix-agent runs in this iteration
    findings_skipped: []
```

Append a new iteration block each time you re-run agents in step 4.4.

**CRITICAL — Context budget**: Do NOT read file contents, full diffs, specs, or architecture docs into this orchestrating context. Collect only file paths and metadata. Agents have Read/Grep/Glob tools and will read files in their own context windows.

Collect for the agents:
- Changed file paths: `git diff --name-only HEAD~1` → list of paths (keep, small)
- Diff stat: `git diff --stat HEAD~1` → brief change summary (lines added/removed per file)
- Test file paths: identify associated test files by convention (do NOT read them)
- Task definition (goal, action items, acceptance criteria) → keep, brief
- Specs path: path to `{{specs_dir}}/product_specs.md` or `{{specs_dir}}/product_specs/` (do NOT read contents)
- Architecture path: path to `{{specs_dir}}/architecture.md` or `{{specs_dir}}/architecture/` (do NOT read contents)
- Design system path: path to `{{specs_dir}}/design_system.md` or `{{specs_dir}}/design_system/` (do NOT read contents)

### 1.5. Determine Active Agents

Based on context gathered, skip agents whose primary review subject does not exist:

| Agent | Skip when |
|---|---|
| `design-consistency-checker` | No `design_system_path` AND no CSS/styling files in `changed_file_paths` |
| `spec-alignment-checker` | No `specs_path` found |
| `architecture-alignment-checker` | No `architecture_path` found |

**Always run** regardless of context:
- `code-quality-reviewer` — always applicable to code changes
- `security-reviewer` — always applicable to code changes
- `code-simplifier` — always applicable to code changes
- `performance-reviewer` — always applicable to code changes
- `test-quality-reviewer` — always applicable to code changes
- `housekeeper` — handles missing paths gracefully, still checks task status

Record skipped agents in the aggregation table with verdict `skipped` and a note explaining why.

### 2. Launch Verification Agents

**Token discipline:** Launch all agents in a single tool-use turn. Do NOT output text-only turns while waiting for agents to return — each turn re-reads the full context window. Aggregate results silently and output ONE summary after all agents complete. The same applies to re-validation rounds in Step 4.

Use Agent tool to launch all 9 agents in parallel:

| Agent (`subagent_type`) | Context to Provide |
|-------------------------|-------------------|
| `groundwork:code-quality-reviewer:code-quality-reviewer` | `changed_file_paths`, `diff_stat`, `task_definition`, `test_file_paths` |
| `groundwork:test-quality-reviewer:test-quality-reviewer` | `changed_file_paths`, `diff_stat`, `task_definition`, `test_file_paths` |
| `groundwork:security-reviewer:security-reviewer` | `changed_file_paths`, `diff_stat`, `task_definition` |
| `groundwork:spec-alignment-checker:spec-alignment-checker` | `changed_file_paths`, `diff_stat`, `task_definition`, `specs_path` |
| `groundwork:architecture-alignment-checker:architecture-alignment-checker` | `changed_file_paths`, `diff_stat`, `task_definition`, `architecture_path` |
| `groundwork:code-simplifier:code-simplifier` | `changed_file_paths`, `diff_stat`, `task_definition` |
| `groundwork:housekeeper:housekeeper` | `changed_file_paths`, `diff_stat`, `task_definition`, `task_status`, `specs_path`, `architecture_path`, `design_system_path` |
| `groundwork:performance-reviewer:performance-reviewer` | `changed_file_paths`, `diff_stat`, `task_definition` |
| `groundwork:design-consistency-checker:design-consistency-checker` | `changed_file_paths`, `diff_stat`, `design_system_path` |

**Each agent prompt MUST include both of these lines** (in addition to the agent-specific context above):

```
findings_file: {findings_dir}/findings-{agent_name}-iter{iteration_number}.json
agent_name: {agent_name}
iteration: {iteration_number}
```

Substitute `{agent_name}` with the agent's short name (`code-quality-reviewer`, `security-reviewer`, etc.), `{iteration_number}` with the current iteration number, and `{findings_dir}` with the path you saved in step 1. Record the resulting `findings_file` path in your iteration tracking notes (see step 1) — you will need it in step 4.2 and step 5.5.

Also include in each agent prompt: "Use the Read tool to examine these files. Do NOT expect file contents in this prompt — read them yourself. Write your full review JSON (with the structure described in your Output Format section) to the `findings_file` path above using the Write tool, then return ONLY the compact one-line JSON response. Do NOT print findings inline in your response."

**Each agent's compact response is a single JSON line** in this exact shape:

```json
{"verdict":"approve","score":85,"summary":"One-sentence assessment","findings_file":"/tmp/groundwork-validation-XXXXXX/findings-code-quality-reviewer-iter1.json","counts":{"critical":0,"major":1,"minor":2}}
```

The full review (including the `findings[]` array) lives only in the file at `findings_file`. Do not parse or expect the array in the agent's response.

### 3. Aggregate Results

Parse each agent's compact one-line JSON response. Read **only** these fields: `verdict`, `score`, `summary`, `counts.critical`, `counts.major`, `counts.minor`, and `findings_file`. **Do NOT** read the file at `findings_file` here — those bodies stay out of orchestrator context until step 5.5 (or until handed verbatim to the validation-fixer in step 4.2 as a path, never as content).

Build the aggregation table from the compact responses:

```markdown
## Multi-Agent Verification Report

| Agent | Score | Verdict | Critical | Major | Minor |
|-------|-------|---------|----------|-------|-------|
| Code Quality | 85 | approve | 0 | 1 | 2 |
| Test Quality | 88 | approve | 0 | 1 | 0 |
| Security | 95 | approve | 0 | 0 | 1 |
| Spec Alignment | 90 | approve | 0 | 1 | 0 |
| Architecture | 88 | approve | 0 | 1 | 1 |
| Code Simplifier | 92 | approve | 0 | 0 | 2 |
| Housekeeper | 90 | approve | 0 | 1 | 0 |
| Performance | 82 | approve | 0 | 1 | 1 |
| Design Consistency | 88 | approve | 0 | 1 | 1 |
```

Then update your iteration tracking notes (see step 1) with the `findings_file` path for each agent in this iteration.

### 4. Autonomous Fix-and-Retry Loop

**Rule**: You MUST continue this loop until ALL agents return `approve`. No exceptions. No user overrides.

**On any `request-changes` verdict:**

1. **Log Iteration**
   ```markdown
   ## Verification Iteration [N]
   | Agent | Verdict | Findings |
   |-------|---------|----------|
   | ... | ... | ... |
   Fixing [X] issues...
   ```

2. **Spawn Fix Agent (REQUIRED — see Hard Rule at top)** — You MUST delegate ALL fix work to the validation-fixer subagent. Do NOT call `Edit`, `Write`, or `NotebookEdit` on source files. Do NOT use `Bash` with `sed -i`, `awk -i`, `tee`, `>`, `>>`, or any other file-mutating shell construct on source files. Do NOT "just fix the small one" or "batch the obvious renames" — even a one-character cosmetic change goes through the fixer. The only file mutation allowed in this skill is what happens *inside* the validation-fixer subagent's own context (plus the narrow exemptions in the Hard Rule for `minor_todos.md` and the temp directory).

   Build the list of `findings_file` paths from agents whose verdict in this iteration is `request-changes` (look them up in your iteration tracking notes for the current `iteration_number`). **Do NOT inline the contents of those files into the prompt.** Spawn:

   ```
   Agent(
     subagent_type="groundwork:validation-fixer:validation-fixer",
     description="Fix validation findings (iteration N)",
     prompt="Working directory: [path]
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

3. **Parse Fix Agent Result** — the fixer's `RESULT:` line uses **global IDs** (`{agent}-iter{N}-{id}`), not opaque numbers:
   - `RESULT: FIXED | files_touched: [...] | findings_fixed: [global-id, ...]` → parse both lists, proceed to step 4.4
   - `RESULT: PARTIAL | files_touched: [...] | findings_fixed: [global-id, ...] | findings_skipped: [global-id: reason, ...]` → parse all lists, log skipped findings, proceed to step 4.4 with the fixed subset
   - `RESULT: FAILURE | [reason]` → log the failure reason, escalate to user via `AskUserQuestion`
   - No parseable result → treat as failure, escalate to user

   Record both `findings_fixed` and `findings_skipped` (as global ID lists) in your iteration tracking notes under the current `iteration_number`. These are what step 5.5 uses to compute the unexecuted set.

4. **Re-run Agent Validation** — First, **bump `iteration_number` by 1**. Each re-run agent must receive a *new* `findings_file` path (`...-iter{N+1}.json`) so the previous iteration's findings file is preserved on disk for step 5.5. Append a new iteration block to your tracking notes.

   Always re-launch the code-simplifier and quality-reviewer. For the other agents, re-launch ONLY agents that returned `request-changes` in the previous iteration.

   **Domain spillover**: Use `files_touched` from the fix agent result to determine if a fix modified code relevant to an agent that previously approved. If so, re-run that agent too:

   | Fix touches... | Also re-run |
   |---|---|
   | Auth, crypto, input validation | security-reviewer |
   | Layer boundaries, component structure | architecture-alignment-checker |
   | CSS, design tokens, accessibility | design-consistency-checker |
   | Spec/requirement behavior | spec-alignment-checker |
   | Test files | code-quality-reviewer, test-quality-reviewer |
   | Task status, docs, spec files | housekeeper |
   | Hot paths, algorithmic changes | performance-reviewer |
   | Code structure, naming | code-simplifier |

   **When in doubt, re-run.** False passes are worse than extra agent runs.

   For agents NOT re-run, carry forward their previous `approve` verdict and score into the aggregation table.

   - Do NOT re-read updated files into the orchestrator context — agents will re-read the updated files themselves
   - Only update `changed_file_paths` or `diff_stat` if the set of changed files has changed

5. **Check Results**
   - ALL approve → **PASS**, return success
   - Any request-changes → Return to step 4.1

### 5. Stuck Detection

Track findings by key: `[Agent]-[Category]-[File]-[Line]`. You don't need full finding bodies in context to do this — derive `Agent` from the global ID prefix and rely on the iteration tracking notes (which carry global IDs) to count repeats. When you actually need to escalate to the user, **only then** Read the relevant `findings_file` once to extract `Category`/`File`/`Line`/`finding`/`recommendation` for the message. Stuck detection is rare; this one-shot read is bounded.

If same finding appears **3 times**:

```markdown
## Stuck - Need User Input

Issue persists after 3 attempts:

**[Agent] Finding description**
- File: path/to/file.ts
- Line: 42
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
- Conflicting requirements between agents
- Missing information to implement fix

### 5.5. Persist Unexecuted Findings

After all agents approve, you need to compute the **unexecuted findings** across every iteration. Up to this point in the loop, finding bodies have stayed out of your context. This step is the **one and only** place you read them, and the read is bounded by `(iterations × agents that ran)` files — typically a handful.

**Compute the unexecuted set:**

1. Build the union `all_fixed_global_ids` = ⋃ `findings_fixed` from every iteration in your tracking notes.
2. Iterate over every `findings_file` path in your tracking notes (across all iterations, all agents) and **Read** each file using the `Read` tool. (Reading files under `findings_dir` is allowed by the Hard Rule's narrow exemptions.)
3. For each finding in each file, compute its global ID `{agent}-iter{iteration}-{id}`. Drop the finding if its global ID is in `all_fixed_global_ids`. Keep the rest.
4. The kept findings are the **unexecuted findings**.

If zero unexecuted findings → skip the rest of this step entirely (proceed to step 6).

Otherwise, persist them to `{{specs_dir}}/minor_todos.md` (if `{{specs_dir}}` does not exist, create it). Writing to `{{specs_dir}}/minor_todos.md` is permitted by the Hard Rule's narrow exemptions. Continue with the steps below:

1. **Determine task identifier**: Extract from the task definition context (e.g., `TASK-NNN: Title`). If no task context is available, use `"manual-validation"`.

2. **Create or update `{{specs_dir}}/minor_todos.md`**:
   - If the file does not exist, create it with this header:
     ```markdown
     # Minor TODOs

     Accumulated unexecuted findings from validation runs. Check items off as addressed.
     ```
   - If the file exists, read it for deduplication.

3. **Deduplicate**: For each unexecuted finding, check if an existing **unchecked** entry matches on: agent name + file path + finding text (exclude line numbers from comparison since they shift between runs). Skip duplicates.

4. **Format new entries** as a run block:
   ```markdown
   ---

   ## Run: YYYY-MM-DD | TASK-NNN: Title

   1. [ ] `minor` **agent-name** | `file:line` | category: finding -- recommendation
   2. [ ] `major` **agent-name** | `file:line` | category: finding -- recommendation
   ```

5. **Prepend** the new run block after the file header (newest runs first).

### 6. Return Result

**Cleanup (run BEFORE printing the PASS report):** delete the per-run findings directory created in step 1. This is the only place where the orchestrator may invoke `rm -rf`, and only on the path saved as `findings_dir` (it must be a `groundwork-validation-XXXXXX` mktemp directory):

```bash
rm -rf "{findings_dir}"
```

If `findings_dir` was never created (e.g., the loop bailed out before step 1 finished), skip cleanup.

**On PASS:**
```markdown
## Verification PASSED

All 9 agents approved after [N] iteration(s).

| Agent | Score | Verdict | Summary |
|-------|-------|---------|---------|
| ... | ... | APPROVE | ... |

Issues fixed:
- [Iteration N] Agent: Description

Unexecuted findings: [N] finding(s) persisted to `{{specs_dir}}/minor_todos.md`
```

Return control to calling skill.

## Severity Reference

| Level | Action |
|-------|--------|
| critical | Must fix, loop continues |
| major | Must fix, loop continues |
| minor | Optional, does not block |
