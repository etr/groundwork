---
name: groundwork-check-specs-alignment
description: Verify alignment between code and specs.
---
## Portable Project Context

Before interpreting project-context placeholders in this workflow:

1. Resolve the directory containing this `SKILL.md`.
2. Run `node <skill-directory>/scripts/project-context-cli.js resolve --harness zcode` from the repository working directory.
3. Use the returned JSON values as the exact bindings for `{{project_name}}`, `{{project_root}}`, `{{specs_dir}}`, `{{plans_dir}}`, `{{debug_dir}}`, and `{{research_dir}}` everywhere below.
4. If `selection_required` is true, follow the `groundwork-select-project` workflow, then resolve again.


# Check Alignment Skill

Verifies that implementation aligns with product specs and architecture, surfacing misalignments for resolution.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.** Skip this step silently if effort is `high`, `xhigh`, or `max` (the scale is `low` < `medium` < `high` < `xhigh` < `max`, so `xhigh` and `max` are already above `high`). Otherwise ask via `Ask the user` (header "Model check"; options "Continue anyway" / "Cancel — I'll switch first"):

> "Do you want to switch? Drift detection and categorization across implementation and specs benefits from consistent reasoning.
>
> Recommended: GLM with reasoning at max.
>
> To switch: cancel, raise the reasoning effort to max in the model settings (and switch to GLM in the model picker if you are on GLM-Flash), then re-invoke this skill."

If the user selects "Cancel — I'll switch first": output the switching commands and stop. Do not proceed with the skill. Ask once per conversation: a skill invoked by another skill skips this step when the recommendation was already shown. In a non-interactive run (`--noninteractive`, `GROUNDWORK_RUNNER_MODE=true`, or `GROUNDWORK_BATCH_MODE=true`), skip the prompt and continue on the current model.

## Step 0: Resolve Project Context

1. **Monorepo check:** Does `.groundwork.yml` exist at the repo root?
   - If yes → Is `{{project_name}}` non-empty?
     - If empty → Follow the groundwork-select-project workflow steps to select a project, then restart this skill.
     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.
   - If no → Continue (single-project repo).
2. **CWD mismatch check (monorepo only):** skip it when the project was just selected or the invocation carried an explicit `--project`.
   - Compare CWD against the project paths in `.groundwork.yml`: the repo root or the selected project's path → fine, proceed; no project's path → proceed without warning (shared directory).
   - A different project's path → with `--noninteractive`, keep the selected project and continue; otherwise warn via `Ask the user`:
     > "You're working from `<cwd>` (inside **[cwd-project]**), but the selected Groundwork project is **[selected-project]** (`[selected-project-path]/`). What would you like to do?"
     > - "Switch to [cwd-project]"
     > - "Stay with [selected-project]"
     If the user switches, Follow the groundwork-select-project workflow steps.
3. Proceed with the resolved project context.

## Workflow

### Step 1: Load All Context

**Scope:** With no argument, check everything. With an argument, the argument names the scope of this check — a requirement or decision ID (`PRD-XXX-REQ-002`, `DR-003`), a task ID, a feature or component name, or a path. Limit the search and the report to it, title the report `## Alignment Report — [scope]`, and list in one line what was left unchecked.

Read the following specs (each may be a single file or directory):

- **Product specs** - PRD with EARS requirements
  - Single file: `{{specs_dir}}/product_specs.md`
  - Directory: `{{specs_dir}}/product_specs/` (aggregate all `.md` files)

- **Architecture** - Architecture decisions
  - Single file: `{{specs_dir}}/architecture.md`
  - Directory: `{{specs_dir}}/architecture/` (aggregate all `.md` files)

- **Tasks** - Task list (if exists)
  - Single file: `{{specs_dir}}/tasks.md`
  - Directory: `{{specs_dir}}/tasks/` (aggregate all `.md` files)

**Detection:** Check for a single file first (it takes precedence), then a directory. Read a directory as all its `.md` files recursively — `_index.md` first, then numerically-prefixed files, then alphabetically.

Scan codebase for implementation:
- Source files in common locations (src/, lib/, app/, etc.)
- Configuration files
- Database schemas/migrations
- API definitions
- Test files (their names state the expected behavior)

**If specs are missing:**
> "Cannot check alignment - missing specs:
> - [List missing specs]
>
> Run the appropriate commands to create them:
> - PRD: `/groundwork-design-product`
> - Architecture: `/groundwork-design-architecture`
> - Tasks: `/groundwork-create-tasks`"

### Step 2: Check PRD Alignment

For each EARS requirement in the PRD:

1. **Search codebase** for implementation evidence using the requirement's keywords and expected behavior
2. **Categorize** the implementation status:
   - **Implemented** - Code clearly implements the requirement
   - **Partially Implemented** - Some aspects present, others missing
   - **Not Implemented** - No evidence of implementation
   - **Deviated** - Implementation differs from requirement

3. **Detect undocumented features** - Code functionality that doesn't trace to any PRD requirement

### Step 3: Check Architecture Alignment

For each architecture decision (DR-NNN):

1. **Verify implementation** follows the decision by examining:
   - Technology choices in package.json, requirements.txt, or equivalent
   - Code patterns matching the documented approach
   - Component structure matching architecture diagrams

2. **Detect deviations:**
   - Different technology used than documented
   - Different patterns than documented
   - Missing components that should exist per architecture
   - Extra components not mentioned in architecture

### Step 3b: Check Task Status Consistency

This step produces the "Task Status Consistency" table of the report. When the task catalog exists (single file `{{specs_dir}}/tasks.md`, or the `{{specs_dir}}/tasks/` directory — read its `_index.md` status table first), compare each task's recorded status with the code:

1. **Marked complete but code missing** — for each task recorded `Complete`, look for implementation evidence of its goal and acceptance criteria (its component, its files by convention). A task with no trace of its criteria in the code belongs in this row.
2. **Code present but task not complete** — for each task still `Not Started` or `Blocked`, check whether its acceptance criteria are already satisfied in the code. If they are, the status is stale, not the code.

Without a task catalog, write "No task catalog" in that section of the report.

### Step 4: Report Findings

Present the alignment report in a structured format:

```markdown
## Alignment Report

### PRD Alignment

| Requirement | Status | Notes |
|-------------|--------|-------|
| PRD-XXX-REQ-001 | Implemented | Found in src/auth/login.ts |
| PRD-XXX-REQ-002 | Partially Implemented | Missing error handling for edge case |
| PRD-XXX-REQ-003 | Not Implemented | - |
| PRD-YYY-REQ-001 | Deviated | Uses polling instead of WebSocket |

**Summary:** X/Y requirements implemented, Z partially implemented, W not implemented, V deviated

**Undocumented Features:**
- Feature X in src/foo.ts has no PRD requirement
- [Or "None detected" if clean]

### Architecture Alignment

| Decision | Status | Notes |
|----------|--------|-------|
| DR-001 | Aligned | PostgreSQL used as documented |
| DR-002 | Deviated | Using REST instead of GraphQL |
| DR-003 | Aligned | - |

**Summary:** X/Y decisions aligned, Z deviated

**Undocumented Components:**
- src/cache/ not mentioned in architecture
- [Or "None detected" if clean]

### Task Status Consistency

| Condition | Count | Tasks |
|-----------|-------|-------|
| Marked complete but code missing | N | TASK-003, TASK-007 |
| Code present but task not complete | N | TASK-005 |
```

### Step 5: Suggest Resolution

Based on findings, provide actionable next steps:

**For undocumented features:**
> "Run `/groundwork-design-product` to add requirements for undocumented feature X"

**For PRD deviations:**
> "Either:
> - Run `/groundwork-source-product-specs-from-code` to update the PRD to match implementation, OR
> - Fix the implementation to match PRD requirement PRD-XXX-REQ-NNN"

**For architecture deviations:**
> "Either:
> - Run `/groundwork-source-architecture-from-code` to update architecture to match implementation, OR
> - Refactor code to follow DR-NNN (currently using [actual] instead of [documented])"

**For missing implementations:**
> "Run `/groundwork-work-on-next-task` to implement missing requirements, or `/groundwork-work-on N` to work on specific tasks"

**Offer resolution options:**
> "Found [N] misalignments. Would you like me to:
> 1. Update specs to match implementation (`/groundwork-source-product-specs-from-code`, `/groundwork-source-architecture-from-code`)
> 2. List implementation changes needed to match specs
> 3. Go through each misalignment individually"

## Categories of Misalignment

### PRD Alignment Status

| Status | Meaning | Resolution |
|--------|---------|------------|
| **Implemented** | Code matches requirement | None needed |
| **Partially Implemented** | Some aspects implemented | Complete implementation or update PRD scope |
| **Not Implemented** | No code for requirement | Implement via tasks or remove from PRD |
| **Deviated** | Different from spec | Align code OR update PRD |

### Architecture Alignment Status

| Status | Meaning | Resolution |
|--------|---------|------------|
| **Aligned** | Implementation follows decision | None needed |
| **Deviated** | Different approach used | Refactor OR update architecture |

## Search Patterns

When searching for implementation evidence:

### Requirement Keywords
- Extract verbs: "shall create", "shall display", "shall validate"
- Extract nouns: user, order, payment, notification
- Search for related function/class names

### Architecture Patterns
- Check imports/dependencies for technology choices
- Look for documented component names
- Verify directory structure matches architecture
