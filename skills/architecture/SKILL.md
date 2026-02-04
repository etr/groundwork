---
name: architecture
description: Use when user asks to design system architecture, make architectural decisions, or translate PRD into technical design
user-invocable: false
---

# Architecture Design Skill

Interactive workflow for translating product requirements into architecture through iterative decision-making.

## File Locations

- **Input:** `specs/product_specs.md` (PRD with EARS requirements)
- **Output:** `specs/architecture.md` (architecture document with decisions)

## Workflow Overview

1. **Load Context** - Read PRD and understand requirements
2. **Identify Decisions** - List architectural decisions to make
3. **Iterate Decisions** - For each decision: present options → discuss → decide
4. **Document** - Write architecture with full decision records

## Step 1: Load Context

Read the product specs (may be single file or directory) and extract:
- Non-functional requirements (latency, scale, security, compliance)
- Feature list and EARS requirements
- Implicit constraints (budget, team size, timeline if mentioned)

**Detection:** Check for `specs/product_specs.md` first (single file), then `specs/product_specs/` directory. When reading a directory, aggregate all `.md` files recursively with `_index.md` first, then numerically-prefixed files, then alphabetically.

If PRD doesn't exist, prompt user to run `/product-design` first.

Summarize key architectural drivers:
> "Based on your PRD, the key architectural drivers are:
> - [Driver 1 from NFRs]
> - [Driver 2 from features]
> I'll need to make decisions about [list 3-5 major areas]. Let's start with [most foundational one]."

## Step 2: Identify Decision Areas

Common architectural decision categories:

| Category | Example Decisions |
|----------|-------------------|
| **Compute** | Serverless vs containers vs VMs, orchestration |
| **Data** | Database type, multi-tenancy strategy, caching |
| **API** | REST vs GraphQL, gateway pattern, versioning |
| **Frontend** | SPA vs SSR, framework choice, state management |
| **Auth** | Identity provider, token strategy, authorization model |
| **Integration** | Sync vs async, message queues, event sourcing |
| **Infrastructure** | Cloud provider, IaC approach, environments |
| **Observability** | Logging, metrics, tracing, alerting |
| **Security** | Encryption, network isolation, secrets management |
| **Cost** | Pricing model alignment, reserved vs on-demand |

Prioritize decisions by dependency (foundational first).

## Step 3: Iterate on Each Decision

For each decision point, present **2-4 options** using this format:

```markdown
## Decision: [Decision Name]

**Context:** [Why this decision matters, link to PRD requirements]

### Option A: [Name]
**Description:** [1-2 sentences]
**Pros:**
- [Pro 1, ideally linked to PRD requirement]
- [Pro 2]
**Cons:**
- [Con 1, note if it conflicts with PRD requirement]
- [Con 2]
**Cost implications:** [Rough estimate if relevant]

### Option B: [Name]
[Same structure]

### Option C: [Name] (if applicable)
[Same structure]

**My recommendation:** [Option X] because [reasoning tied to PRD].

What are your thoughts? Any constraints I should know about?
```

**Presentation style:**
- Present one decision at a time, wait for resolution before moving on
- For complex options, break explanation into digestible chunks (200-300 words)
- Prefer multiple-choice follow-up questions when gathering constraints

### Exploratory Questions

When presenting options, ask questions to surface hidden constraints:
- "What's your team's experience with [technology X vs Y]?"
- "Are there constraints I should know about? (existing systems, team skills, budget, timeline)"
- "What would you regret in 2 years if we chose wrong here?"
- "Is there organizational momentum toward any particular approach?"
- "What's the cost of changing this decision later if it proves wrong?"

### Decision Conflict Detection

Before recording a decision, check for conflicts with earlier decisions:

**Check against existing decisions:**
- Does this decision contradict or undermine a previous DR?
- Are we choosing a technology incompatible with earlier choices?
- Does this create inconsistency in the architecture?

**If conflict detected:**
> "This decision may conflict with DR-NNN:
> - DR-NNN chose [X] for [reason]
> - This decision would require [Y], which is incompatible because [explanation]
>
> Options:
> 1. Proceed with new decision and update DR-NNN
> 2. Modify this decision to align with DR-NNN
> 3. Accept both and document the exception
>
> Which approach?"

**After user input:**
- If user agrees: Record decision and move to next
- If user has concerns: Discuss, possibly add new options
- If user wants to defer: Note as open question, continue
- If conflict identified: Resolve before proceeding

### YAGNI for Architecture

- Challenge decisions that add complexity "for future flexibility"
- Prefer simple solutions that can evolve over pre-designed extensibility
- When in doubt, choose the option with fewer moving parts
- Ask: "What's the cost of adding this later vs. building it now?"

## Step 4: Document Architecture

When all major decisions are made, create the architecture document using template in `references/architecture-template.md`.

**Output location:** `specs/architecture.md` (single file by default)
- For large architectures, user can later run `/split-spec architecture` to convert to directory format

**Critical:** Include ALL decision records with discarded options and reasoning. This is essential for future maintainers to understand *why* choices were made.

Present the complete document for review before writing.

## Step 5: Suggest Next Step

After writing the architecture document, suggest the next workflow step:

> "Architecture documented with [N] decision records.
>
> **Next step:** Run `/groundwork:create-tasks` to generate implementation tasks from your PRD and architecture."

## Decision Record Format (ADR-lite)

Each decision in the architecture doc follows this format:

```markdown
### DR-NNN: [Decision Title]

**Status:** Accepted | Superseded by DR-XXX | Deprecated
**Date:** YYYY-MM-DD
**Context:** [Why this decision was needed]

**Options Considered:**
1. **[Option A]** - [Brief description]
   - Pros: [list]
   - Cons: [list]
2. **[Option B]** - [Brief description]
   - Pros: [list]
   - Cons: [list]

**Decision:** [Chosen option]

**Rationale:** [Why this option was selected, referencing PRD requirements]

**Consequences:**
- [Implication 1]
- [Implication 2]
```

## Clarifying Questions by Category

### Compute & Scaling
- What's your expected load profile? (steady, spiky, predictable growth)
- Any constraints on cold start latency?
- Team's experience with containers/K8s vs serverless?

### Data
- What consistency guarantees do you need? (eventual OK vs strong)
- Expected data volume and growth rate?
- Any existing database expertise on the team?

### Cost
- Is there a monthly infrastructure budget target?
- Preference for predictable costs vs pay-per-use?
- Any existing cloud commitments or credits?

### Team & Operations
- Team size and composition (backend/frontend/devops)?
- On-call expectations?
- Deployment frequency target?

## Reference Files

- `references/architecture-template.md` - Template for architecture document
- `references/decision-examples.md` - Example decision records from real projects
