---
name: tasks
description: Use when user asks to create task list, plan implementation, break down work, or generate tickets from product specs and architecture
user-invocable: false
requires: task-validation-loop
---

# Task Generation Skill

Translates product specs and architecture into actionable implementation tasks.

## File Locations

- **Input:**
  - `specs/product_specs.md` (PRD with EARS requirements)
  - `specs/architecture.md` (architecture with decision records)
  - `specs/design_system.md` (design system with DP/BRD/UXD decisions) - optional
- **Output:** `specs/tasks.md` (task list with dependencies)

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
- Single file: `specs/product_specs.md`
- Directory: `specs/product_specs/` (aggregate all `.md` files)
- Extract: Feature list with EARS requirements, Non-functional requirements, Release strategy (Alpha → Beta → GA)

**From Architecture:**
- Single file: `specs/architecture.md`
- Directory: `specs/architecture/` (aggregate all `.md` files)
- Extract: Component list and responsibilities, Technology choices, Decision records (understand constraints)

**From Design System (if exists):**
- Single file: `specs/design_system.md`
- Extract: Design principles (DP-NNN), Brand decisions (BRD-NNN), UX patterns (UXD-NNN)
- Use for: Design-related tasks, component styling tasks, accessibility requirements

**Detection:** Check for file first (takes precedence), then directory. When reading a directory, aggregate all `.md` files recursively with `_index.md` first, then numerically-prefixed files, then alphabetically.

If PRD or architecture is missing, prompt user:
> "I need both the PRD and architecture to generate tasks.
> - PRD missing? Run `/groundwork:design-product`
> - Architecture missing? Run `/groundwork:design-architecture`"

If design system exists, incorporate design context into UI/frontend tasks.

## Step 2: Define Milestones

Before generating tasks, establish **product milestones** - points where the application can be assessed by a user.

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
   Task(
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

Iterate until user approves, then write to `specs/tasks.md`.

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

When `specs/design_system.md` exists, include design-specific tasks:

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
