---
name: product-design
description: Use when user invokes `/product-design` or asks to add features, modify requirements, update the PRD, write EARS requirements, or iterate on product specifications
---

# Product Design Skill

Interactive workflow for iteratively designing and documenting product requirements in EARS format.

## Workflow Overview

1. **Understand** - Clarify the feature/change request through targeted questions
2. **Design** - Draft EARS requirements and check for contradictions
3. **Approve** - Present draft for user approval
4. **Commit** - Edit the PRD document when requirements are approved

## Step 1: Understand the Request

When the user proposes a feature or change, ask clarifying questions to understand:

**Core Questions (always ask):**
- What problem does this solve for the user?
- Who is the target user/persona?
- What is the expected outcome or behavior?

**Exploratory Questions (for open-ended or vague requests):**
- "What inspired this feature idea?"
- "Have you seen this done well elsewhere? What did you like about it?"
- "What would make this feature 'delightful' vs just 'adequate'?"
- "What's the simplest version that would provide value?"
- "If you had to cut half the scope, what would you keep?"

**Conditional Questions (ask as relevant):**
- What triggers this behavior? (for event-driven features)
- What are the edge cases or error conditions?
- What is explicitly out of scope?
- Are there dependencies on other features?
- What metrics would indicate success?

**Keep questions focused** - ask 2-3 at a time, not all at once. Build understanding iteratively.

**Question Style:**
- Prefer multiple-choice questions when possible - they're easier to answer and keep conversations focused
- Explore one topic at a time to avoid overwhelming stakeholders
- When presenting alternatives, lead with your recommendation

## Step 2: Design EARS Requirements

Once the feature is understood, draft requirements using EARS syntax.

### EARS Syntax Reference

| Pattern | Template | Use When |
|---------|----------|----------|
| **Event-Driven** | When `<trigger>` then the system shall `<response>` | Behavior triggered by events |
| **State-Driven** | While `<state>` the system shall `<behavior>` | Continuous behavior during state |
| **Unwanted** | If `<condition>` then the system shall `<mitigation>` | Handling errors/edge cases |
| **Optional** | Where `<feature enabled>` the system shall `<behavior>` | Configurable features |
| **Complex** | While `<state>`, when `<trigger>`, the system shall `<response>` | Compound conditions |

### Requirement Quality Checklist

Each requirement must be:
- [ ] **Atomic** - One behavior per requirement
- [ ] **Testable** - Clear pass/fail criteria exist
- [ ] **Technology-agnostic** - No implementation details
- [ ] **Unambiguous** - Single interpretation possible
- [ ] **Traceable** - Has unique ID following project convention

### ID Convention

Follow the existing PRD convention: `PRD-<FEATURE>-REQ-<NNN>`

Examples from the project:
- `PRD-FINE-REQ-001` (Finetuning feature)
- `PRD-GEN-REQ-001` (Generation feature)
- `PRD-IMP-REQ-001` (Impersonation detection)
- `PRD-MON-REQ-001` (Monetization)
- `PRD-DEL-REQ-001` (Data deletion)

For new features, propose a short code (3-4 chars) and confirm with user.

## Step 2.5: Check for Contradictions

Before presenting the draft, review for conflicts:

### Internal Contradictions
Requirements within this feature that may contradict each other:
- Conflicting behaviors (e.g., "shall be real-time" AND "shall work offline-first")
- Incompatible constraints (e.g., "shall complete in <100ms" AND "shall process 10,000 items")
- Mutually exclusive states

### Cross-Feature Conflicts
Compare new requirements against existing PRD:
- **Behavioral conflicts:** New behavior contradicts existing behavior
- **Resource competition:** Features that compete for same limited resources
- **UX inconsistency:** Different patterns for similar interactions
- **Data conflicts:** Contradictory data ownership or access rules

Example: New "anonymous posting" requirement conflicts with existing "all user actions must be audited"

### Technical Incompatibilities
Requirements that may be technically difficult to satisfy together:
- Performance constraints that conflict
- Security requirements that limit functionality
- Scalability needs that conflict with simplicity

**If conflicts found, surface them:**
> "I noticed a potential conflict:
> - [Existing requirement or pattern] requires [X]
> - This new requirement requires [Y]
> These may be incompatible because [reason].
>
> Options:
> 1. Modify the new requirement to [alternative]
> 2. Update the existing requirement
> 3. Accept the conflict as a known trade-off
>
> How should we resolve this?"

**After resolution:**
- If user chooses option 1 (modify new): Update the draft requirement and re-present
- If user chooses option 2 (update existing): Note the PRD change needed and proceed
- If user chooses option 3 (accept trade-off): Document the trade-off in the feature block and proceed

Do not proceed to Step 3 until conflicts are resolved or explicitly accepted.

## Step 2.6: Present Progressively

When presenting complex feature blocks:
- Break into 200-300 word segments
- Seek confirmation after each section before continuing
- Start with problem/outcome, then scope, then requirements
- This catches misunderstandings early and keeps stakeholders engaged

## Step 3: Present Draft for Approval

Before editing the PRD, present the complete feature block:

```markdown
### [Feature Number] Feature Name

**Problem / outcome**
[1-2 sentences describing the problem and desired outcome]

**In scope**
- [Capability 1]
- [Capability 2]

**Out of scope**
- [Explicit exclusion 1]

**EARS Requirements**
- `PRD-XXX-REQ-001` When [trigger] then the system shall [response].
- `PRD-XXX-REQ-002` When [trigger] then the system shall [response].

**Acceptance criteria**
- [Testable criterion 1]
- [Testable criterion 2]

**Telemetry** (optional)
- [Metric to track]

**Rollout** (optional)
- Phase 1: [description]
- Phase 2: [description]
```

Ask: "Does this capture your requirements? Any changes before I update the PRD?"

**Scope discipline:**
- Apply YAGNI thinking - challenge every "nice to have"
- Ask: "What's the simplest version that delivers the core value?"
- If scope feels large, propose a phased approach

## Step 4: Commit to PRD

**PRD Location:** The PRD may be stored as:
- Single file: `specs/product_specs.md`
- Directory: `specs/product_specs/` (with content split across files)

When the user approves:

1. **Check if PRD exists** - Look for single file first, then directory
   - If missing, create `specs/product_specs.md` using the template in `references/prd-template.md`
   - Ensure `specs/` directory exists first

2. **Route the content** - Determine where to write based on spec format:
   - **Single file mode:** Edit `specs/product_specs.md` directly
   - **Directory mode:** Route to appropriate file:
     - Features with ID (e.g., PRD-AUTH-*) → `specs/product_specs/03-features/<feature-code>.md`
     - Open questions → `specs/product_specs/05-open-questions.md`
     - If unsure, append to `specs/product_specs/_index.md`

3. **Find insertion point** - New features go in Section 3 (Feature list) after existing features
4. **Edit the document** - Use `str_replace` to insert the new feature block
5. **Update open questions** - If any remain, add to Section 5 (Open questions log)
6. **Update traceability note** - Mention new requirement IDs if relevant

After editing, confirm: "I've added [feature] to the PRD with requirements PRD-XXX-REQ-001 through PRD-XXX-REQ-NNN."

## Step 5: Suggest Next Step

After successfully updating the PRD, suggest the next workflow step:

> "PRD updated with [feature/changes].
>
> **Next step:** Run `/architecture` to design the technical approach for these requirements, or continue adding features with `/product-design`."

## Conversation Patterns

### Adding a New Feature
```
User: I want to add a feature for artists to share their portfolios publicly.

Claude: Great idea! Let me understand this better:
1. What should be shareable - just the generated outputs, or training images too?
2. Should other users be able to interact (like/comment) or just view?
3. Are there privacy controls the artist should have?

[User answers...]

Claude: Based on your answers, here's what I'm proposing:

### 3.X Portfolio Sharing

**Problem / outcome**
Artists want to showcase their AI-generated work publicly to attract commissions.

**In scope**
- Public gallery page per artist
- ...

**EARS Requirements**
- `PRD-PORT-REQ-001` When an artist enables public portfolio then the system shall...

Does this capture it? Any changes?
```

### Modifying an Existing Requirement
```
User: PRD-IMP-REQ-008 should lock the account after 5 attempts, not N.

Claude: I'll update PRD-IMP-REQ-008 to specify 5 attempts:

**Before:** When impersonation attempts exceed N per day...
**After:** When impersonation attempts exceed 5 per day...

Should I also add a configuration option for admins to adjust this threshold, or keep it fixed at 5?
```

### Clarifying Ambiguity
```
User: Add a requirement for faster generation.

Claude: "Faster" needs to be specific for a testable requirement. Currently PRD specifies p95 < 2s.
- What latency target do you have in mind? (e.g., p95 < 1s, p99 < 2s)
- Does this apply to all generation types or specific ones?
- Are there trade-offs you'd accept (e.g., lower quality for speed)?
```

## Reference Files

For detailed examples of well-written EARS requirements, see:
- `references/ears-examples.md` - Curated examples from various domains
- `references/prd-template.md` - Template for creating new PRD files
