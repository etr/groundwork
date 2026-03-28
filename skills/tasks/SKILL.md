---
name: tasks
description: This skill should be used when the user asks to create a task list, plan implementation, break down work, or generate tickets from product specs and architecture
user-invocable: false
requires: task-validation-loop
---

# Task Generation Skill

Translates product specs and architecture into actionable implementation tasks.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high` or higher AND you are Opus (1M context).
If effort is below `high`, you MUST show the recommendation prompt — regardless of model.
If you are not Opus (1M context), you MUST show the recommendation prompt - regardless of effort level.

Otherwise → use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Do you want to switch? Task granularity judgment and vertical slicing decisions determine execution success.\n\nTo switch: cancel, run `/model opus[1m]` and `/effort high`, then re-invoke this skill.",
    "header": "Recommended: Opus (1M context) at high effort",
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

## File Locations

- **Input:**
  - `{{specs_dir}}/product_specs.md` (PRD with EARS requirements)
  - `{{specs_dir}}/architecture.md` (architecture with decision records)
  - `{{specs_dir}}/design_system.md` (design system with DP/BRD/UXD decisions) - optional
- **Output:** `{{specs_dir}}/tasks/` directory with per-milestone subdirectories:
  ```
  specs/tasks/
  ├── _index.md          # Overview, milestone summary, dependency graph
  ├── M1-core-auth/
  │   ├── TASK-001.md
  │   ├── TASK-002.md
  │   └── TASK-003.md
  ├── M2-upload/
  │   ├── TASK-004.md
  │   └── TASK-005.md
  └── parking-lot.md     # Deferred tasks
  ```

## Workflow Overview

1. **Load Context** - Read PRD and architecture
2. **Identify Milestones** - Define testable product milestones
3. **Generate Tasks** - Break down into implementable tasks
4. **Map Dependencies** - Establish task ordering
5. **Review & Refine** - Iterate with user on task breakdown

**Important:** When asking questions to the user (milestone validation, task review, scope clarification), always use the `AskUserQuestion` tool with appropriate options.

## Step 1: Load Context

Read the input specs (each may be a single file or directory) and extract:

**From PRD:**
- Single file: `{{specs_dir}}/product_specs.md`
- Directory: `{{specs_dir}}/product_specs/` (aggregate all `.md` files)
- Extract: Feature list with EARS requirements, Non-functional requirements, Release strategy (Alpha → Beta → GA)

**From Architecture:**
- Single file: `{{specs_dir}}/architecture.md`
- Directory: `{{specs_dir}}/architecture/` (aggregate all `.md` files)
- Extract: Component list and responsibilities, Technology choices, Decision records (understand constraints)

**From Design System (if exists):**
- Single file: `{{specs_dir}}/design_system.md`
- Extract: Design principles (DP-NNN), Brand decisions (BRD-NNN), UX patterns (UXD-NNN)
- Use for: Design-related tasks, component styling tasks, accessibility requirements

**Detection:** Check for file first (takes precedence), then directory. When reading a directory, aggregate all `.md` files recursively with `_index.md` first, then numerically-prefixed files, then alphabetically.

If PRD or architecture is missing, prompt user:
> "I need both the PRD and architecture to generate tasks.
> - PRD missing? Run `/groundwork:design-product`
> - Architecture missing? Run `/groundwork:design-architecture`"

If design system exists, incorporate design context into UI/frontend tasks.

## Step 2: Check Existing Tasks and Milestones

Before defining milestones, check if tasks already exist:

1. Check for `{{specs_dir}}/tasks/_index.md` or `{{specs_dir}}/tasks.md`
2. If found, read to understand existing milestones, task numbering, and status

**If existing tasks found:**
- List existing milestones and their status (complete, in progress, not started)
- Determine the highest task number (e.g., TASK-047) so new tasks continue the sequence
- Determine the highest milestone number (e.g., M5) so new milestones continue the sequence
- Present to user: "Found existing milestones M1-M5 with 47 tasks. New tasks will be added as TASK-048+."
- Ask: "Should this new work be added to an existing milestone, or should I create a new milestone M6?"

**If no existing tasks:** Proceed to define milestones from scratch.

## Step 2b: Define Milestones

**If adding to existing project:** Either add tasks to a user-selected existing milestone directory, or create a new milestone directory continuing the sequence (e.g., `M6-feature-name/`).

**If starting fresh:** Establish **product milestones** - points where the application can be assessed by a user.

Milestone principles:
- **Vertically sliced** - Each milestone delivers user-visible value
- **Testable** - Clear criteria for "done"
- **Incremental** - Build on previous milestones
- **Aligned with release strategy** - Map to Alpha/Beta/GA phases

Example milestone progression:
```
M1: Core Authentication
    → User can sign up, log in, see empty dashboard

M2: Upload & Verification
    → User can upload images, complete identity verification

M3: Model Training
    → User can initiate training, see progress, view completion

M4: Basic Generation
    → User can generate images with their model

M5: Billing Integration
    → User can subscribe, see quota, pay for overages
```

Present proposed milestones to user for feedback before generating tasks.

**Presentation style:**
- Present milestones one at a time, confirm understanding before continuing
- Use multiple-choice questions to validate milestone scope (e.g., "Should M1 include: A) just signup, B) signup + login, C) full auth flow?")

## Step 3: Research Implementation Patterns

For major technologies in the architecture, gather implementation guidance before generating tasks.

**For each significant technology in the architecture:**

1. Invoke the researcher agent:
   ```
   Agent(
     subagent_type="groundwork:researcher:researcher",
     prompt="Research Topic: [technology from architecture]
     Research Questions:
     - What is the standard project structure?
     - What are idiomatic patterns for [component type]?
     - What are common implementation mistakes?
     - What setup/configuration pitfalls exist?

     Project Context: [from PRD]
     Architecture Decisions: [relevant DRs]"
   )
   ```

2. Use research findings to:
   - Inform task granularity (patterns suggest natural boundaries)
   - Add specific action items based on best practices
   - Include pitfall-avoiding acceptance criteria
   - Add "setup correctly" tasks for technologies with gotchas

**Research Integration:**
When generating tasks in Step 4, incorporate research findings:
- Reference idiomatic patterns in action items
- Include pitfall-prevention in acceptance criteria
- Add explicit setup/configuration tasks when research reveals gotchas
- Use recommended project structure to inform task boundaries

## Step 4: Generate Tasks

For each milestone, generate tasks using the format specified in the "Required Task Format" section below.

## Required Task Format

Every task MUST follow this exact format to ensure compatibility with the skill `groundwork:next-task` and other skills:

```markdown
### TASK-NNN: [Task Title]

**Milestone:** M[X] - [Milestone Name]
**Component:** [Component from architecture]
**Estimate:** S | M | L | XL

**Goal:**
[One sentence describing the outcome]

**Action Items:**
- [ ] [Action 1]
- [ ] [Action 2]
- [ ] [Action 3]

**Dependencies:**
- Blocked by: [TASK-XXX, TASK-YYY or None]
- Blocks: [TASK-ZZZ or None]

**Acceptance Criteria:**
- [Testable criterion 1]
- [Testable criterion 2]

**Related Requirements:** PRD-XXX-REQ-NNN
**Related Decisions:** DR-NNN, DP-NNN, BRD-NNN, UXD-NNN

**Status:** Not Started | In Progress | Complete | Blocked
```

### Format Requirements

| Field | Required | Valid Values |
|-------|----------|--------------|
| Task ID | Yes | `TASK-NNN` (3+ digit number) |
| Milestone | Yes | `M[N] - [Name]` |
| Component | Yes | From architecture document |
| Estimate | Yes | `S`, `M`, `L`, or `XL` |
| Goal | Yes | Single sentence |
| Action Items | Yes | Checkbox list |
| Dependencies | Yes | Task IDs or "None" |
| Acceptance Criteria | Yes | Testable statements |
| Related Requirements | Recommended | PRD IDs |
| Related Decisions | Recommended | DR/DP/BRD/UXD IDs |
| Status | Yes | Exactly one of the four values |

### Status Values

- `**Status:** Not Started` - Task hasn't begun
- `**Status:** In Progress` - Currently being worked on
- `**Status:** Complete` - Task finished and verified
- `**Status:** Blocked` - Cannot proceed due to dependencies

**Important:** The `next-task` skill parses these status values exactly. Any variation will cause parse errors.

## Task Generation Principles

### Granularity
- **Too big:** "Implement authentication" (weeks of work, unclear scope)
- **Too small:** "Create login button component" (not meaningful alone)
- **Right size:** "Implement Cognito integration with magic link flow" (days, clear scope)

Target: 1-3 days of work per task for an experienced developer.

### Vertical Slicing
Prefer tasks that deliver working functionality over horizontal layers:

❌ Horizontal (avoid):
- TASK-001: Create all database schemas
- TASK-002: Create all API endpoints
- TASK-003: Create all UI components

✅ Vertical (prefer):
- TASK-001: User signup flow (DB + API + UI)
- TASK-002: User login flow (DB + API + UI)
- TASK-003: Profile management (DB + API + UI)

### Dependency Minimization
- Identify true dependencies vs. nice-to-haves
- Parallelize where possible
- Flag critical path tasks

### YAGNI for Tasks
- Only create tasks for committed scope, not speculative features
- Challenge tasks that exist "just in case" or "for later"
- If unsure whether a task is needed, defer it to a future milestone
- Ask: "Is this task essential for the milestone, or is it gold-plating?"

### Acceptance Criteria

Each criterion must be something that can be **verified** - checked or tested, not vague.

**Good criteria (verifiable):**
- "Add status column to tasks table with default 'pending'"
- "Filter dropdown has options: All, Active, Completed"
- "Clicking delete shows confirmation dialog"
- "Typecheck passes"
- "Tests pass"

**Bad criteria (vague):**
- "Works correctly"
- "User can do X easily"
- "Good UX"
- "Handles edge cases"

**Standard criteria to include:**
- Always end with: "Typecheck passes"
- For stories with testable logic, also include: "Tests pass"

## Step 5: Map Dependencies

Create a dependency graph showing:
- Which tasks can run in parallel
- Critical path (longest chain of dependencies)
- Milestone boundaries

Format as both:
1. **List view** - Dependencies noted on each task
2. **Graph view** - ASCII diagram showing parallel tracks

```
M1: Auth
├── TASK-001: Cognito setup ─────────────────────┐
├── TASK-002: Auth API (depends: 001) ───────────┼──┐
├── TASK-003: Login UI (depends: 002) ───────────┘  │
└── TASK-004: Session management (depends: 002) ────┘

M2: Upload
├── TASK-005: S3 bucket setup (parallel with M1) 
├── TASK-006: Upload API (depends: 002, 005) ────┐
└── TASK-007: Upload UI (depends: 006) ──────────┘
```

## Step 6: Review & Refine

Present the complete task list organized by milestone. Ask:

> "Here's the task breakdown for [Milestone X].
> - Are the task sizes appropriate for your team?
> - Any missing tasks or unnecessary ones?
> - Do the dependencies look right?
> - Should any tasks be split or combined?"

Iterate until user approves, then write task files to `{{specs_dir}}/tasks/`.

**Output structure:**
1. Create or update `{{specs_dir}}/tasks/_index.md` with overview, milestone summary table, dependency graph, **task status table**, and critical path
2. For each new milestone, create a directory: `{{specs_dir}}/tasks/M{N}-{slug}/` (e.g., `M1-core-auth/`)
3. Write one file per task: `{{specs_dir}}/tasks/M{N}-{slug}/TASK-{NNN}.md`
4. Each task file is self-contained — includes all fields from the Required Task Format
5. Write or update `{{specs_dir}}/tasks/parking-lot.md` for deferred tasks (if any)

**Task status table in `_index.md`** (required — used by `next-task` to find work without reading every task file):
```markdown
### Task Status

| # | Task | Milestone | Status | Blocked by |
|---|------|-----------|--------|------------|
| TASK-001 | Auth setup | M1 | Not Started | None |
| TASK-002 | Login UI | M1 | Not Started | TASK-001 |
```

**If adding to existing tasks:**
- Update `_index.md` — add new rows to the status table, add the new milestone to the summary table, extend the dependency graph
- Continue task numbering from the highest existing task number
- Do NOT regenerate or modify existing milestone directories or task files

**Progressive presentation:**
- Present tasks one milestone at a time
- Wait for approval on each milestone before presenting the next
- This catches scope creep early and keeps stakeholders engaged

## Step 7: Validate Task List

After user approves the task list and before writing final version:

**You MUST call the Skill tool now:** `Skill(skill="groundwork:task-validation-loop")`

Do NOT skip validation or declare the task list complete without running this. It ensures PRD coverage, architecture alignment, and design system compliance.

**Wait for validation loop to pass before proceeding.**

If validation finds issues:
- The loop will automatically fix task list problems
- You may be asked for input on scope decisions
- Once all agents approve, continue to Step 8

## Step 8: Suggest Next Step

After writing the tasks document, suggest the next workflow step:

> "Task list created and validated with [N] tasks across [M] milestones.
> PRD coverage: [X]%
>
> **Next step:** Run `/groundwork:work-on-next-task` to begin implementation, or `/groundwork:work-on N` to work on a specific task."

## Task Categories

Common task types to ensure coverage:

| Category | Examples |
|----------|----------|
| **Infrastructure** | IaC setup, CI/CD pipeline, environments |
| **Data** | Schema design, migrations, seed data |
| **Backend** | API endpoints, business logic, integrations |
| **Frontend** | Components, pages, state management |
| **Design System** | Token setup, component styling, theme implementation |
| **Auth** | Identity setup, authorization rules |
| **Testing** | Unit tests, integration tests, E2E |
| **Observability** | Logging, metrics, alerts |
| **Documentation** | API docs, runbooks, README |
| **Security** | Pen testing, security review, hardening |

### Design System Tasks

When `{{specs_dir}}/design_system.md` exists, include design-specific tasks:

| Task Type | Related Decisions | Example |
|-----------|-------------------|---------|
| Token setup | DP-NNN | Configure CSS variables/Tailwind theme |
| Color system | BRD-001-005 | Implement brand palette, semantic colors |
| Typography | BRD-006-008 | Font loading, type scale utilities |
| Component styling | BRD-NNN, UXD-NNN | Button variants, form controls |
| Loading states | UXD-003-004 | Skeleton screens, spinners |
| Error handling | UXD-005-006 | Toast system, error boundaries |
| Empty states | UXD-007 | First-run, no-data components |
| Responsive layout | UXD-010-011 | Breakpoint utilities, layout adaptation |
| Motion system | UXD-012 | Animation utilities, reduced motion |

Reference design decisions in task Related Decisions field to ensure traceability.

## Reference Files

- `references/tasks-template.md` - Template for tasks document
