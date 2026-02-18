---
name: build-unplanned-feature
description: This skill should be used when building a feature from a description without existing task definitions - combines requirement gathering, TDD implementation, and validation
requires: understanding-feature-requests, implement-feature, validation-loop
user-invocable: false
---

# Build Unplanned Feature

Enables ad-hoc feature development without existing task definitions. Combines requirement gathering, worktree isolation, TDD implementation, multi-agent validation, and merge.

## Workflow

### Step 1: Parse Feature Description

Extract the feature description from:
1. **Argument provided** - Use as initial description
2. **No argument** - Use `AskUserQuestion` to ask: "What feature would you like to build?" and **wait for user response**

Store the raw description for clarification.

### Step 2: Clarify Requirements

**You MUST call the Skill tool now:** `Skill(skill="groundwork:understanding-feature-requests")`

Do NOT attempt to gather requirements yourself. The skill handles this.

Follow the skill to gather:
- Problem being solved
- Target user/persona
- Expected outcome
- Edge cases and scope boundaries

Continue until requirements are clear and internally consistent.

### Step 3: Generate Feature Identifier

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

### Step 4: Present Feature Summary

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

### Step 5: Implementation (task-executor Agent)

Implementation is dispatched to the **task-executor agent** with a fresh context window. This agent has `implement-feature`, `use-git-worktree`, and `test-driven-development` skills preloaded — it does not need to call `Skill()` or spawn subagents.

**Build the Task prompt with ALL gathered context from Steps 1-4.** You MUST include actual values, not placeholders:

    Task(
      subagent_type="groundwork:task-executor:task-executor",
      description="Implement <identifier>",
      prompt="You are implementing a feature that has already been fully specified.

    PROJECT ROOT: [absolute path to project root]

    FEATURE DEFINITION:
    - Identifier: [FEATURE-slug from Step 3]
    - Title: [1-2 sentence summary from Step 4]

    ACTION ITEMS:
    [Bulleted list of requirements gathered in Steps 1-2]

    ACCEPTANCE CRITERIA:
    [Bulleted list of acceptance criteria from Step 2/4]

    OUT OF SCOPE:
    [Bulleted list of exclusions, or 'None specified']

    INSTRUCTIONS:
    1. Follow your preloaded skills to create a worktree, implement with TDD, and commit.
    2. The feature definition above provides all session context — do NOT re-ask the user for requirements.
    3. When complete, output your final line in EXACTLY this format:
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
- `RESULT: IMPLEMENTED | <path> | <branch> | <base-branch>` — Save these values, proceed to Step 6
- `RESULT: FAILURE | ...` — Report the failure and worktree location for investigation, stop
- No parseable RESULT line — Report: "Implementation subagent did not return a structured result. Check worktree status manually." Stop.

### Step 6: Validation (Direct Skill Call)

**Call the validation-loop skill directly.** Do NOT wrap this in a subagent — this skill runs in the main conversation, which CAN spawn the 8 validation subagents it needs.

1. `cd` into the worktree path from Step 5
2. Call: `Skill(skill='groundwork:validation-loop')`
3. The validation-loop skill will run 8 verification agents in parallel and fix issues autonomously.

**After validation-loop completes:**
- All agents approved → Proceed to Step 7
- Validation failed → Report the failure and worktree location for investigation, stop
- Stuck on recurring issue → Report the stuck finding and stop

### Step 7: Merge Decision

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

### Step 8: Report Completion

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
