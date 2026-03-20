---
name: check-alignment
description: This skill should be used when the user asks to check alignment, verify consistency, detect drift, or ensure code matches specs and architecture
user-invocable: false
---

# Check Alignment Skill

Verifies that implementation aligns with product specs and architecture, surfacing misalignments for resolution.

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

### Step 1: Load All Context

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

**Detection:** Check for file first (takes precedence), then directory. When reading a directory, aggregate all `.md` files recursively with `_index.md` first, then numerically-prefixed files, then alphabetically.

Scan codebase for implementation:
- Source files in common locations (src/, lib/, app/, etc.)
- Configuration files
- Database schemas/migrations
- API definitions

**If specs are missing:**
> "Cannot check alignment - missing specs:
> - [List missing specs]
>
> Run the appropriate commands to create them:
> - PRD: `/groundwork:design-product`
> - Architecture: `/groundwork:design-architecture`
> - Tasks: `/groundwork:create-tasks`"

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

### Step 4: Report Findings

Present the alignment report in a structured format:

```markdown
## Alignment Report

### PRD Alignment

| Requirement | Status | Notes |
|-------------|--------|-------|
| PRD-XXX-REQ-001 | Implemented | Found in src/auth/login.ts |
| PRD-XXX-REQ-002 | Partial | Missing error handling for edge case |
| PRD-XXX-REQ-003 | Not Implemented | - |
| PRD-YYY-REQ-001 | Deviated | Uses polling instead of WebSocket |

**Summary:** X/Y requirements implemented, Z partial, W not implemented, V deviated

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
> "Run `/product-design` to add requirements for undocumented feature X"

**For PRD deviations:**
> "Either:
> - Run `/groundwork:source-product-specs-from-code` to update the PRD to match implementation, OR
> - Fix the implementation to match PRD requirement PRD-XXX-REQ-NNN"

**For architecture deviations:**
> "Either:
> - Run `/groundwork:source-architecture-from-code` to update architecture to match implementation, OR
> - Refactor code to follow DR-NNN (currently using [actual] instead of [documented])"

**For missing implementations:**
> "Run `/groundwork:work-on-next-task` to implement missing requirements, or `/groundwork:work-on N` to work on specific tasks"

**Offer resolution options:**
> "Found [N] misalignments. Would you like me to:
> 1. Update specs to match implementation (`/groundwork:source-product-specs-from-code`, `/groundwork:source-architecture-from-code`)
> 2. List implementation changes needed to match specs
> 3. Go through each misalignment individually"

## Categories of Misalignment

### PRD Alignment Status

| Status | Meaning | Resolution |
|--------|---------|------------|
| **Implemented** | Code matches requirement | None needed |
| **Partial** | Some aspects implemented | Complete implementation or update PRD scope |
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

### Common Locations
```
src/           - Main source code
lib/           - Libraries
app/           - Application code (Next.js, Rails, etc.)
api/           - API routes
components/    - UI components
services/      - Service layer
models/        - Data models
database/      - Migrations, schemas
config/        - Configuration
tests/         - Test files (can verify expected behavior)
```
