---
name: validation-loop
description: Use when implementation is complete to run multi-agent verification with autonomous fix-and-retry until all agents approve
user-invocable: false
---

# Validation Loop Skill

Autonomous verification loop that runs 5 specialized agents and fixes issues until all approve.

## Prerequisites

Before invoking this skill, ensure:
- Implementation is complete
- Tests pass (from execute-task self-validation)
- Changes are ready for review

## Workflow

### 1. Gather Context

Collect for the agents:
- Changed files: `git diff --name-only HEAD~1`
- Full diff: `git diff HEAD~1`
- File contents of changed files
- Associated test files
- Task definition (goal, action items, acceptance criteria)
- Relevant product specs (EARS requirements)
- Relevant architecture decisions

### 2. Launch Verification Agents

Use Task tool to launch all 5 agents in parallel:

| Agent (`subagent_type`) | Context to Provide |
|-------------------------|-------------------|
| `groundwork:code-quality-reviewer:code-quality-reviewer` | Changed files, contents, tests, task definition |
| `groundwork:security-reviewer:security-reviewer` | Changed files, contents, task definition |
| `groundwork:spec-alignment-checker:spec-alignment-checker` | Changed files, contents, task definition, product specs |
| `groundwork:architecture-alignment-checker:architecture-alignment-checker` | Changed files, contents, task definition, architecture |
| `groundwork:code-simplifier:code-simplifier` | Changed files, contents, task definition |

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
| Security | 95 | approve | 0 | 0 | 1 |
| Spec Alignment | 90 | approve | 0 | 1 | 0 |
| Architecture | 88 | approve | 0 | 1 | 1 |
| Code Simplifier | 92 | approve | 0 | 0 | 2 |
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
   - Track what was changed
   - Note which finding each fix addresses

3. **Re-run Self-Validation**
   - Verify action items still complete
   - Run tests - must pass
   - Confirm acceptance criteria

4. **Re-run Agent Validation** - Launch all 5 agents again

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

### 6. Return Result

**On PASS:**
```markdown
## Verification PASSED

All 5 agents approved after [N] iteration(s).

| Agent | Score | Verdict | Summary |
|-------|-------|---------|---------|
| ... | ... | APPROVE | ... |

Issues fixed:
- [Iteration N] Agent: Description

Minor suggestions (optional):
- ...
```

Return control to calling skill.

## Severity Reference

| Level | Action |
|-------|--------|
| critical | Must fix, loop continues |
| major | Must fix, loop continues |
| minor | Optional, does not block |
