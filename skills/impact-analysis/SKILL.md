---
name: impact-analysis
description: This skill should be used when the user asks to analyze the impact of changing a requirement, assess blast radius, trace dependencies of a spec ID, or understand what would break if something changes
user-invocable: false
---

# Impact Analysis Skill

Traces a requirement, decision, or task through all downstream artifacts to show the blast radius of a proposed change. Read-only — analyzes but never modifies files.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high` or higher AND you are Sonnet or Opus.
If effort is below `high`, you MUST show the recommendation prompt — regardless of model.
If you are not Sonnet or Opus, you MUST show the recommendation prompt - regardless of effort level.

Otherwise → use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Do you want to switch? Cross-referencing multiple spec types and codebase locations benefits from consistent reasoning.\n\nTo switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke this skill.",
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

## Step 1: Parse Input and Identify Target

Extract the user's input from the command arguments or conversation context.

### Mode A: Requirement/Decision ID Provided

Detect via regex match against these known ID patterns:

| Pattern | Regex | Example |
|---------|-------|---------|
| PRD requirement | `PRD-[A-Z]+-REQ-\d+` | PRD-AUTH-REQ-002 |
| Architecture decision | `DR-\d+` | DR-005 |
| Design principle | `DP-\d+` | DP-001 |
| Brand decision | `BRD-\d+` | BRD-002 |
| UX decision | `UXD-\d+` | UXD-004 |
| Task | `TASK-\d+` | TASK-003 |

If the input matches any pattern → proceed directly to Step 2 with the matched ID as the target.

### Mode B: Natural Language Description

If no ID pattern is matched, the user is describing a proposed change in natural language.

1. Extract significant keywords from the description (domain terms, verbs, nouns — skip stop words)
2. Grep all spec files for lines containing clusters of these keywords
3. Collect candidate matches — requirements, decisions, or tasks whose text relates to the description
4. Present candidates via `AskUserQuestion`:
   > "I found these potentially related spec items. Which would you like to analyze?"
   > - "[ID]: [summary text]" (up to 4 candidates)
5. If the user selects one or more → proceed with those IDs as targets (run the analysis for each, then merge into one report)
6. If the user selects "Other" and specifies none apply → run the analysis using keyword matching only (all matches will be labeled "Semantic" in the report)

## Step 2: Load All Specs

Read the following specs (each may be a single file or directory):

- **Product specs** - PRD with EARS requirements
  - Single file: `{{specs_dir}}/product_specs.md`
  - Directory: `{{specs_dir}}/product_specs/` (aggregate all `.md` files)

- **Architecture** - Architecture decisions
  - Single file: `{{specs_dir}}/architecture.md`
  - Directory: `{{specs_dir}}/architecture/` (aggregate all `.md` files)

- **Design system** - Design decisions and tokens
  - Single file: `{{specs_dir}}/design_system.md`
  - Directory: `{{specs_dir}}/design_system/` (aggregate all `.md` files)

- **Tasks** - Task list (if exists)
  - Single file: `{{specs_dir}}/tasks.md`
  - Directory: `{{specs_dir}}/tasks/` (aggregate all `.md` files)

**Detection:** Check for file first (takes precedence), then directory. When reading a directory, aggregate all `.md` files recursively with `_index.md` first, then numerically-prefixed files, then alphabetically.

**Locate the target:** Find the target ID within its spec type and extract its full text (the requirement statement, decision record, or task definition).

**If no specs exist at all:**
> "Cannot perform impact analysis — no specs found.
>
> Run the appropriate commands to create them:
> - PRD: `/groundwork:design-product`
> - Architecture: `/groundwork:design-architecture`
> - Tasks: `/groundwork:create-tasks`"

If some specs are missing, proceed with what's available — note which spec types are absent in the report.

## Step 3: Trace Spec-to-Spec Dependencies

For the target ID (or keyword set in Mode B), trace through all spec types:

### 3a. Tasks Referencing Target

- Grep task files for the target ID in `Related Requirements` and `Related Decisions` fields
- Also grep task `Goal` and `Action Items` text for keywords extracted from the target's description
- For each match, record:
  - Task ID and title
  - Status (Not Started, In Progress, Complete, Blocked)
  - Milestone
  - Reference type: **Direct** (ID found in Related Requirements/Decisions) or **Semantic** (keyword match in goal/action items)

### 3b. Architecture Decisions Linked to Target

- If target is a PRD requirement → grep architecture files for the requirement ID
- Grep architecture decision context/rationale sections for keywords from the target text
- Record: DR ID, title, and relationship description

### 3c. Design System References

- Grep design system files for the target ID
- If target is a PRD requirement about UI behavior, grep for related component guidelines, UX patterns, or design tokens
- Record: decision ID (DP/BRD/UXD), type, and relationship

### 3d. Cross-Spec Implications

- If target is a requirement: find other requirements in the same feature group (same `PRD-XXX-` prefix)
- Find other requirements or decisions that share the same domain keywords or reference the same architectural components
- These are items that may rest on the same assumptions as the target

## Step 4: Trace Code Locations

Scan the codebase for implementation evidence of the target.

### Tier 1: Direct ID Reference (highest confidence)

Grep all source files for the exact target ID string (e.g., `PRD-AUTH-REQ-002` in comments).

### Tier 2: Semantic Code Match (moderate confidence)

- Extract verbs from the target text: "shall create", "shall display", "shall validate"
- Extract nouns: user, session, token, order, etc.
- Search for function, class, and variable names containing these keywords
- Search for file paths matching the domain (e.g., target about "authentication" → search for `auth`, `login`, `session` in paths and content)

### Tier 3: Configuration and Schema

- Check database migrations/schemas for related tables/columns
- Check configuration files for related settings
- Check API definitions (OpenAPI, GraphQL schemas) for related endpoints
- Check dependency files (package.json, requirements.txt) if the target involves specific technologies

### Common Locations to Search

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
```

Use `Glob` first to discover the actual project structure rather than assuming these directories exist.

Label every code match as **Direct** (Tier 1) or **Semantic** (Tier 2/3) in the report.

## Step 5: Trace Test Coverage

### 5a. Test Files for Affected Code

For each code file identified in Step 4, find its associated test file by convention:
- `src/foo/bar.ts` → look for `src/foo/bar.test.ts`, `src/foo/bar.spec.ts`, `tests/foo/bar.test.ts`, `test/foo/bar.test.ts`, `__tests__/foo/bar.test.ts`
- Glob for `**/*.test.*` and `**/*.spec.*` near the affected code files

### 5b. Direct Test References

- Grep test files for the target ID in `describe`/`it`/`test` blocks or comments
- Grep test files for function/class names found in Step 4

### 5c. Coverage Gaps

For each code location from Step 4, determine if it has associated tests. Flag code locations with no test coverage — these represent higher risk if the requirement changes.

## Step 6: Generate Impact Report

Present the report in this structured format:

```markdown
## Impact Analysis: [TARGET ID or Description]

### Target
**ID:** [ID or "Natural language query"]
**Full text:** [The requirement/decision/task text]
**Spec file:** [Path to the spec file containing this item]

---

### 1. Downstream Tasks

| Task | Title | Status | Milestone | Reference |
|------|-------|--------|-----------|-----------|
| TASK-003 | [title] | [status] | M1 | Direct |
| TASK-007 | [title] | [status] | M2 | Semantic |

**Summary:** [N] tasks directly reference this item, [M] are semantically related.

[Or "No tasks reference this item." if none found]

### 2. Code Locations

| File | Lines | Evidence | Has Tests |
|------|-------|----------|-----------|
| src/auth/login.ts | 15-42 | Direct: comment `// PRD-AUTH-REQ-002` | Yes |
| src/middleware/session.ts | 8-23 | Semantic: function `validateSession` | No |

**Summary:** [N] files with direct references, [M] with semantic matches.

[Or "No code references found." if none]

### 3. Test Coverage

| Test File | Covers | Type |
|-----------|--------|------|
| tests/auth/login.test.ts | src/auth/login.ts | Unit |
| tests/e2e/auth.spec.ts | Login flow | E2E |

**Coverage gaps:** [List code locations from section 2 with Has Tests = No]

[Or "All affected code has test coverage." if fully covered]

### 4. Architecture Decisions

| Decision | Title | Relationship |
|----------|-------|-------------|
| DR-005 | [title] | [how it relates to the target] |

[Or "No architecture decisions reference this item." if none]

### 5. Design System

| Decision | Type | Relationship |
|----------|------|-------------|
| UXD-004 | UX Pattern | [how it relates] |

[Or "No design system references found." / "No design system spec exists." as applicable]

### 6. Cross-Spec Implications

Other spec items that may share assumptions with the target:

| Item | Shared Assumption |
|------|-------------------|
| PRD-AUTH-REQ-003 | Same authentication backend |
| PRD-AUTH-REQ-005 | Shares session token format from DR-005 |

[Or "No cross-spec dependencies detected." if none]

---

### Risk Summary

| Dimension | Count | Risk |
|-----------|-------|------|
| Tasks affected | [N] | [High/Medium/Low] |
| Code files affected | [N] | [High/Medium/Low] |
| Untested code locations | [N] | [High if > 0] |
| Architecture decisions dependent | [N] | [High if > 0] |
| Cross-spec dependencies | [N] | [Medium/Low] |

### Recommended Next Steps

Based on the blast radius, suggest concrete actions:

> If this item changes:
> 1. Update [N] task definitions: [list task IDs]
> 2. Modify code in [N] files: [list paths]
> 3. Add missing test coverage for: [list untested files]
> 4. Review architecture decision [DR-NNN] for continued validity
> 5. Check cross-dependent items: [list IDs]
>
> Useful commands:
> - `/groundwork:design-product` to update requirements
> - `/groundwork:source-architecture-from-code` to update architecture
> - `/groundwork:create-tasks` to regenerate affected tasks
```

### Risk Level Definitions

| Level | Criteria |
|-------|----------|
| **High** | Tasks in progress that would need rework; code with no tests; architecture decisions that would be invalidated |
| **Medium** | Multiple downstream dependencies; tasks not yet started that would need changes |
| **Low** | Single reference; completed and well-tested code; isolated impact |

### Sections with Missing Specs

If a spec type is absent (e.g., no design system exists), include a note in that section:
> "No [spec type] spec exists. Run `/groundwork:[command]` to create one."

Do not treat a missing spec as a failure — report what you can from the specs that do exist.
