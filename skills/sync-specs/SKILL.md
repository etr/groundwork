---
name: sync-specs
description: Use when user invokes `/sync-specs` or at session end when product requirements, features, or scope changed during the session
---

# Sync Product Specs Skill

Keeps `specs/product_specs.md` synchronized with product decisions made during sessions.

## File Locations

- **Target:** Product specs (may be single file or directory)
  - Single file: `specs/product_specs.md`
  - Directory: `specs/product_specs/` (content split across files)
- **Context:** Current session history

**Detection:** Check for single file first (takes precedence), then directory.

## When to Trigger

This skill should activate when:
- User explicitly invokes `/sync-specs`
- Session involved product decisions (new features, requirement changes)
- User feedback changed scope or priorities
- New edge cases or requirements were discovered

## Workflow Overview

1. **Analyze Session** - Review product-relevant discussions
2. **Detect Changes** - Identify PRD implications
3. **Propose Updates** - Draft EARS requirements or modifications
4. **Apply Changes** - Update document with user approval

## Step 1: Analyze Session

Review the current session for:

**New Requirements:**
- "We also need to handle X"
- "What if the user does Y?"
- "Add support for Z"

**Requirement Changes:**
- "Actually, that should be 5 attempts, not 3"
- "Let's make that optional"
- "Remove the email notification"

**Scope Changes:**
- "Let's defer that to v2"
- "That's out of scope"
- "We need to add this for launch"

**New Edge Cases:**
- Error conditions discovered during implementation
- User feedback revealing gaps
- Integration constraints

## Step 2: Detect Change Categories

| Category | Signal | PRD Section |
|----------|--------|-------------|
| New feature | Discussion of new capability | §3 Feature List (new subsection) |
| New requirement | "System should..." statements | §3.X EARS Requirements |
| Requirement change | Modifying existing behavior | §3.X EARS Requirements (edit) |
| NFR change | Performance, security, scale discussion | §2 Non-functional |
| Scope change | "Out of scope" or "must have for launch" | §3.X In/Out of scope |
| Open question | Unresolved product decision | §5 Open Questions |
| Question resolved | Answer to existing OQ | §5 Open Questions (remove) |

## Step 3: Propose Updates

For each detected change, propose a specific update:

```markdown
## Proposed PRD Updates

### 1. New Requirement

**Trigger:** You discussed that artists should be warned before their quota expires.

**Proposed addition to §3.3 Monetization:**

- `PRD-MON-REQ-005` When artist quota falls below 10% remaining then the system shall send a warning notification via email.

---

### 2. Requirement Modification

**Trigger:** Changed impersonation lockout from N to 5 attempts.

**Current:** 
- `PRD-IMP-REQ-008` When impersonation attempts exceed N per day by same user then the system shall lock account pending admin review.

**Proposed:**
- `PRD-IMP-REQ-008` When impersonation attempts exceed 5 per day by same user then the system shall lock account pending admin review.

---

### 3. New Open Question

**Trigger:** Unresolved discussion about handling rate limits.

**Proposed addition to §5:**

- `OQ-008` How should the system handle rate-limited users - queue requests or reject immediately?

---

### 4. Scope Change

**Trigger:** Multi-artist collaborative models deferred to v2.

**Proposed update to §3.1 Out of scope:**

Add: "Multi-artist collaborative models (deferred to v2)"

---

Approve these updates? (yes/no/modify)
```

## Step 4: Apply Changes

On approval:

1. **Detect spec format** - Check if PRD is single file or directory
2. **Read current content:**
   - Single file: Read `specs/product_specs.md`
   - Directory: Aggregate all `.md` files from `specs/product_specs/`
3. **Route updates to appropriate files:**
   - **Single file mode:** Edit `specs/product_specs.md` directly
   - **Directory mode:** Route each update:
     - Features with ID (e.g., PRD-AUTH-*) → Find or create in `specs/product_specs/03-features/<feature-code>.md`
     - Open questions → `specs/product_specs/05-open-questions.md`
     - NFR changes → `specs/product_specs/02-non-functional.md`
     - Updates to existing content → Find the file containing that content
4. Maintain requirement ID sequence (find highest PRD-XXX-REQ-NNN, increment)
5. Update "Last updated" timestamp
6. Update "Doc status" if appropriate

**Important:**
- New requirements get the next available ID in their feature's sequence
- Never reuse deleted requirement IDs (maintain traceability)
- Preserve EARS format for all requirements

## EARS Format Reminder

All requirements must follow EARS syntax:

| Pattern | Template |
|---------|----------|
| Event-Driven | When `<trigger>` then the system shall `<response>` |
| State-Driven | While `<state>` the system shall `<behavior>` |
| Unwanted | If `<condition>` then the system shall `<mitigation>` |
| Optional | Where `<feature enabled>` the system shall `<behavior>` |

## Change Detection Heuristics

**Strong signals (likely PRD change):**
- User explicitly states a requirement
- Edge case discovered that needs handling
- User feedback contradicting current spec
- "Must have for launch" statements
- Explicit scope decisions

**Weak signals (maybe PRD change):**
- Implementation difficulties (might be architecture, not requirements)
- Performance optimizations (might be NFR or architecture)
- UI/UX discussions (might be design, not requirements)

Focus on strong signals. For weak signals, ask: "Should this be captured as a product requirement, or is it an implementation/design detail?"

## Session Summary Format

At session end, provide summary:

```markdown
## PRD Sync Summary

**Session Date:** [date]

### Changes Detected:
1. [Change 1] → New requirement PRD-XXX-REQ-NNN
2. [Change 2] → Modified PRD-YYY-REQ-NNN
3. [Change 3] → Added open question OQ-NNN
4. [Change 4] → No PRD impact (implementation detail)

### PRD Document:
- [X] Updated with approved changes
- [ ] No changes needed
- [ ] Changes pending user review

### Requirement IDs Added/Modified:
- PRD-XXX-REQ-NNN (new)
- PRD-YYY-REQ-NNN (modified)

### Open Items:
- [Any unresolved product questions from session]
```

---

## Converting to Claude Code Agent

For automatic triggering in Claude Code, create an agent at `.claude/agents/sync-specs.md`:

```markdown
---
name: sync-specs
description: Automatically sync PRD at session end
trigger: session_end
allowed-tools: Read, Write, Glob
---

At the end of each session, analyze changes and update specs/product_specs.md.

[Include workflow from this SKILL.md]
```

Alternatively, use a **hook** for lightweight triggering:

```json
{
  "hooks": {
    "post_session": {
      "command": "claude --skill sync-specs --auto"
    }
  }
}
```

## Interaction with Other Skills

This skill works in concert with:
- `/product-design` - For deliberate, interactive requirement creation
- `/sync-architecture` - PRD changes may trigger architecture updates

When both `/sync-specs` and `/sync-architecture` run:
1. Run `/sync-specs` first (product drives architecture)
2. Note any new requirements that may need architectural support
3. Run `/sync-architecture` with awareness of PRD changes
