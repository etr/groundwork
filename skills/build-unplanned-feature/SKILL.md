---
name: build-unplanned-feature
description: This skill should be used when building a feature from a description without existing task definitions - combines requirement gathering, TDD implementation, and validation
requires: understanding-feature-requests, validation-loop
user-invocable: false
---

# Build Unplanned Feature

Enables ad-hoc feature development without existing task definitions. Combines requirement gathering, worktree isolation, TDD implementation, multi-agent validation, and merge.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high` or higher AND you are Sonnet or Opus.
If effort is below `high`, you MUST show the recommendation prompt — regardless of model.
If you are not Sonnet or Opus, you MUST show the recommendation prompt - regardless of effort level.

Otherwise → use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Do you want to switch? Multi-domain reasoning combining requirements, architecture, and design consistency benefits from consistent reasoning.\n\nTo switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke this skill.",
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

## Workflow

### Step 1: Parse Feature Description

Extract the feature description from:
1. **Argument provided** - Use as initial description
2. **No argument** - Use `AskUserQuestion` to ask: "What feature would you like to build?" and **wait for user response**

Store the raw description for clarification.

### Step 2: Load Existing Specs

Before clarifying requirements, check for existing project specs so the clarification can detect contradictions and the implementation can follow established patterns.

**Check for and read (if they exist):**
- `{{specs_dir}}/product_specs.md` (or `{{specs_dir}}/product_specs/` directory) → `PRD_CONTEXT`
- `{{specs_dir}}/architecture.md` (or `{{specs_dir}}/architecture/` directory) → `ARCHITECTURE_CONTEXT`
- `{{specs_dir}}/design_system.md` → `DESIGN_CONTEXT`

For each, check single file first, then directory. If a directory, aggregate all `.md` files.

If none exist, that's fine — proceed without them.

### Step 3: Clarify Requirements

**You MUST call the Skill tool now:** `Skill(skill="groundwork:understanding-feature-requests")`

Do NOT attempt to gather requirements yourself. The skill handles this.

If existing specs were loaded in Step 2, provide them as context to the clarification skill so it can:
- Detect contradictions with existing PRD requirements
- Identify overlap with existing features
- Understand architectural constraints

Follow the skill to gather:
- Problem being solved
- Target user/persona
- Expected outcome
- Edge cases and scope boundaries

Continue until requirements are clear and internally consistent.

### Step 4: Generate Feature Identifier

Create a feature identifier from the clarified requirements:

**Format:** `FEATURE-<slug>`

**Slug rules:**
- Lowercase, hyphen-separated
- 2-4 words maximum
- Derived from the core functionality

**Examples:**
- "Add user login" → `FEATURE-user-login`
- "Export reports to PDF" → `FEATURE-pdf-export`
- "Rate limiting for API" → `FEATURE-api-rate-limit`

### Step 5: Present Feature Summary

Present summary to the user:

```markdown
## Feature: [Feature Identifier]

### Description
[1-2 sentence summary from clarification]

### Execution Context
**Working Directory:** .worktrees/<feature-identifier>
**Branch:** feature/<feature-identifier>
**Base Branch:** [current branch]

### Requirements
- [Requirement 1]
- [Requirement 2]

### Acceptance Criteria
- [Criterion 1]
- [Criterion 2]

### Out of Scope
- [Exclusion 1]
```

Then use `AskUserQuestion` to ask:

> "Ready to begin implementation?"
> - Option 1: "Yes, begin"
> - Option 2: "No, let me review first"

**Wait for user response before proceeding.**

### Step 6: Implementation (task-executor Agent)

Implementation is dispatched to the **task-executor agent** with a fresh context window. This agent has `use-git-worktree` and `test-driven-development` skills preloaded — it does not need to call `Skill()` or spawn subagents.

**Build the Agent prompt with ALL gathered context from Steps 1-5 (specs from Step 2, requirements from Step 3, feature definition from Steps 4-5).** You MUST include actual values, not placeholders:

    Agent(
      subagent_type="groundwork:task-executor:task-executor",
      description="Implement <identifier>",
      prompt="You are implementing a feature that has already been fully specified.

    PROJECT ROOT: [absolute path to project root]

    FEATURE DEFINITION:
    - Identifier: [FEATURE-slug from Step 4]
    - Title: [1-2 sentence summary from Step 5]

    ACTION ITEMS:
    [Bulleted list of requirements gathered in Steps 1-3]

    ACCEPTANCE CRITERIA:
    [Bulleted list of acceptance criteria from Step 3/5]

    OUT OF SCOPE:
    [Bulleted list of exclusions, or 'None specified']

    PROJECT CONTEXT (follow these established patterns):
    [Include each section below ONLY if the spec was found in Step 2. Omit sections where no spec exists.]

    ARCHITECTURE:
    [Contents of ARCHITECTURE_CONTEXT — pay attention to technology choices, component boundaries, and decision records. Your implementation must follow these.]

    DESIGN SYSTEM:
    [Contents of DESIGN_CONTEXT — use these design tokens, patterns, and component styles. Do not invent new patterns that contradict the established system.]

    EXISTING PRD (for reference only):
    [Contents of PRD_CONTEXT — be aware of existing features to avoid duplication or contradiction. Do not re-implement existing functionality.]

    INSTRUCTIONS:
    1. Follow your preloaded skills to create a worktree, implement with TDD, and commit.
    2. The feature definition above provides all session context — do NOT re-ask the user for requirements.
    3. If project context is provided, follow the established architecture and design patterns.
    4. When complete, output your final line in EXACTLY this format:
       RESULT: IMPLEMENTED | <worktree_path> | <branch> | <base_branch>
       OR:
       RESULT: FAILURE | [one-line reason]

    IMPORTANT:
    - Do NOT run validation-loop or merge — the caller handles those
    - Do NOT use AskUserQuestion for merge decisions
    - Your LAST line of output MUST be the RESULT line
    "
    )

**After the subagent returns**, parse the result:
- `RESULT: IMPLEMENTED | <path> | <branch> | <base-branch>` — Save these values, proceed to Step 7
- `RESULT: FAILURE | ...` — Report the failure and worktree location for investigation, stop
- No parseable RESULT line — Report: "Implementation subagent did not return a structured result. Check worktree status manually." Stop.

### Step 7: Validation (Direct Skill Call)

**Call the validation-loop skill directly.** Do NOT wrap this in a subagent — this skill runs in the main conversation, which CAN spawn the 9 validation subagents it needs.

1. `cd` into the worktree path from Step 6
2. Call: `Skill(skill='groundwork:validation-loop')`
3. The validation-loop skill will run 9 verification agents in parallel and fix issues autonomously.

**After validation-loop completes:**
- All agents approved → Proceed to Step 8
- Validation failed → Report the failure and worktree location for investigation, stop
- Stuck on recurring issue → Report the stuck finding and stop

### Step 8: Merge Decision

**From the project root** (NOT the worktree), handle merge:

Use `AskUserQuestion` to ask:

> "Implementation and validation complete for [identifier]. Would you like me to merge this into [base-branch] now?"
> - Option 1: "Yes, merge now"
> - Option 2: "No, I'll merge manually later"

**Wait for user response before proceeding.**

**If merging:**

1. Ensure you are in the project root (cd out of worktree if needed)
2. Checkout base branch: `git checkout <base-branch>`
3. Merge: `git merge --no-ff <branch> -m "Merge <branch>: [Title]"`
4. If success: Remove worktree and delete branch:
   ```bash
   git worktree remove .worktrees/<identifier>
   git branch -d <branch>
   ```
5. If conflicts: Report conflicts and keep worktree for manual resolution

**If not merging or conflicts occurred:**

Report worktree location and manual merge instructions:

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

### Step 9: Report Completion

Output implementation summary:

```markdown
## Feature Complete: [identifier]

**What was done:**
- [Summary of changes]

**Files modified:**
- `path/to/file` - [description]

**Tests added:**
- `path/to/test` - [what it tests]

**Acceptance criteria verified:**
- [x] [Criterion] - [How verified]

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
