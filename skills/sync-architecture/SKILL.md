---
name: sync-architecture
description: Use when user invokes `/sync-architecture` or at session end when architectural decisions were made, new tech choices added, or implementation deviated from documented architecture
---

# Sync Architecture Skill

Keeps `specs/architecture.md` synchronized with actual implementation decisions.

## File Locations

- **Target:** `specs/architecture.md`
- **Context:** Current session history, codebase changes

## When to Trigger

This skill should activate when:
- User explicitly invokes `/sync-architecture`
- Session involved architectural decisions (new tech choices, pattern changes)
- Implementation deviated from documented architecture
- New components or integrations were added

## Workflow Overview

1. **Analyze Session** - Review what happened this session
2. **Detect Changes** - Identify architectural implications
3. **Propose Updates** - Draft specific changes to architecture doc
4. **Apply Changes** - Update document with user approval

## Step 1: Analyze Session

Review the current session for:

**Explicit Decisions:**
- "Let's use X instead of Y"
- "We should add a cache layer"
- "This needs to be async"

**Implicit Decisions (from implementation):**
- New dependencies added (package.json, requirements.txt)
- New services/components created
- New integrations configured
- Database schema changes

**Deviations:**
- Implementation differs from architecture doc
- Workarounds that changed the design
- Scope changes affecting architecture

## Step 2: Detect Change Categories

| Category | Signal | Architecture Section |
|----------|--------|---------------------|
| New component | New service/module created | §4 Component Details |
| Tech change | Different library/framework used | §3 System Overview, relevant DR |
| Data change | Schema migration, new store | §5 Data Architecture |
| Integration | New external service | §6 Integration Architecture |
| Security | Auth/encryption changes | §7 Security Architecture |
| Infra | New environment, deployment change | §8 Infrastructure |
| Decision | Explicit "let's do X" statement | §11 Decision Records |

## Step 3: Propose Updates

For each detected change, propose a specific update:

```markdown
## Proposed Architecture Updates

### 1. New Decision Record

**Trigger:** You decided to use Redis for session caching instead of DynamoDB.

**Proposed addition to §11 Decision Records:**

### DR-00X: Session Cache Technology

**Status:** Accepted
**Date:** [today]
**Context:** [extracted from session]

**Options Considered:**
1. **DynamoDB** - Originally planned
   - Pros: AWS native, no new service
   - Cons: Overkill for simple key-value, higher latency
2. **Redis (ElastiCache)** - New choice
   - Pros: Sub-millisecond latency, built for sessions
   - Cons: Additional service to manage

**Decision:** Redis via ElastiCache

**Rationale:** [from session discussion]

---

### 2. Component Update

**Trigger:** Added new `NotificationService` module.

**Proposed addition to §4 Component Details:**

### 4.X Notification Service

**Responsibility:** Send transactional emails and push notifications

**Technology:** AWS SES + SNS

**Interfaces:**
- Exposes: Internal event handlers
- Consumes: EventBridge events

**Related Requirements:** PRD-XXX-REQ-NNN

---

Approve these updates? (yes/no/modify)
```

## Step 4: Apply Changes

On approval:
1. Read current `specs/architecture.md`
2. Apply each update to the appropriate section
3. Update "Last updated" timestamp
4. Add entry to change log if present

**Important:** Preserve existing content. Add to sections, don't replace unless explicitly correcting an error.

## Change Detection Heuristics

**Strong signals (likely architectural):**
- New infrastructure resources (Terraform, CDK changes)
- New service directories created
- Database migrations
- New external API integrations
- Changes to authentication/authorization
- New environment variables for services

**Weak signals (maybe architectural):**
- New utility functions
- Refactoring within existing components
- Bug fixes
- Test additions
- Documentation updates

Focus on strong signals. Ask about weak signals only if they seem significant.

## Session Summary Format

At session end, provide summary:

```markdown
## Architecture Sync Summary

**Session Date:** [date]

### Changes Detected:
1. [Change 1] → Proposed DR-00X
2. [Change 2] → Updated §4.3
3. [Change 3] → No architecture impact (implementation detail)

### Architecture Document:
- [X] Updated with approved changes
- [ ] No changes needed
- [ ] Changes pending user review

### Open Items:
- [Any unresolved architectural questions from session]
```

---

## Converting to Claude Code Agent

For automatic triggering in Claude Code, create an agent at `.claude/agents/sync-architecture.md`:

```markdown
---
name: sync-architecture
description: Automatically sync architecture doc at session end
trigger: session_end
allowed-tools: Read, Write, Glob
---

At the end of each session, analyze changes and update specs/architecture.md.

[Include workflow from this SKILL.md]
```

Alternatively, use a **hook** for lightweight triggering:

```json
{
  "hooks": {
    "post_session": {
      "command": "claude --skill sync-architecture --auto"
    }
  }
}
```

This skill is designed to work as both:
- **Manual skill** - User invokes `/sync-architecture`
- **Claude Code agent** - Automatically triggers at session end
