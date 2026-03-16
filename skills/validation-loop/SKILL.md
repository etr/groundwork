---
name: validation-loop
description: This skill should be used when implementation is complete to run multi-agent verification with autonomous fix-and-retry until all agents approve
user-invocable: false
---

# Validation Loop Skill

Autonomous verification loop that runs 9 specialized agents and fixes issues until all approve.

## Prerequisites

Before invoking this skill, ensure:
- Implementation is complete
- Tests pass
- Changes are ready for review

## Step 0: Resolve Project Context

**Before loading specs, ensure project context is resolved:**

1. **Check `.groundwork.yml`:** Does a monorepo config file exist at the repo root?
   - If yes → Check if `GROUNDWORK_PROJECT` is set. If not, list projects and ask the user to select one.
2. Proceed with the resolved project context. All `{{specs_dir}}/` paths will resolve to the correct location.

## Workflow

### 1. Gather Context

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

Use Task tool to launch all 9 agents in parallel:

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

In each agent prompt, include: "Use the Read tool to examine these files. Do NOT expect file contents in this prompt — read them yourself."

Each returns JSON:
```json
{
  "summary": "One-sentence assessment",
  "score": 0-100,
  "findings": [{"severity": "critical|major|minor", "category": "...", "file": "...", "line": N, "finding": "...", "recommendation": "..."}],
  "verdict": "approve|request-changes"
}
```

### 3. Aggregate Results

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

2. **Fix Each Finding** - Apply each non-minor recommendation
   - **Behavioral fixes** (new logic, async changes, control flow, debouncing): write or update a failing test first, then apply the fix, then verify green — follow TDD
   - **Cosmetic fixes** (class names, constants, formatting): apply directly, verify tests still pass
   - **How to tell:** if the fix requires new/changed test assertions, it's behavioral
   - Track what was changed
   - Note which finding each fix addresses

3. **Re-run Self-Validation**
   - Verify action items still complete
   - Run tests - must pass
   - Confirm acceptance criteria

4. **Re-run Agent Validation** — Always re-launch the code-simplifier and quality-reviewer. For the other agents, re-launch ONLY agents that returned `request-changes` in the previous iteration.

   **Domain spillover**: If a fix modified code relevant to an agent that previously approved, re-run that agent too:

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
   - Any request-changes → Return to step 1

### 5. Stuck Detection

Track findings by key: `[Agent]-[Category]-[File]-[Line]`

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

After all agents approve, collect **all findings from every iteration** across all agents. Exclude findings that were fixed during the fix-and-retry loop (Step 4 tracks which finding each fix addresses). The remainder are **unexecuted findings**.

If zero unexecuted findings → skip this step entirely.

Otherwise, persist them to `{{specs_dir}}/minor_todos.md`:

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

   - [ ] `minor` **agent-name** | `file:line` | category: finding -- recommendation
   - [ ] `major` **agent-name** | `file:line` | category: finding -- recommendation
   ```

5. **Prepend** the new run block after the file header (newest runs first).

### 6. Return Result

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
