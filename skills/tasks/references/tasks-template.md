# Tasks Document Template

Use this template when creating `specs/tasks.md`.

```markdown
# Implementation Tasks

**Generated from:** 
- PRD: `specs/product_specs.md`
- Architecture: `specs/architecture.md`

**Last updated:** <today>
**Status:** Draft | In Progress | Complete

---

## Overview

**Total Tasks:** [N]
**Milestones:** [N]
**Estimated Duration:** [X weeks/months]

### Milestone Summary

| Milestone | Description | Tasks | Status |
|-----------|-------------|-------|--------|
| M1 | [Name] | [N] | Not Started |
| M2 | [Name] | [N] | Not Started |
| M3 | [Name] | [N] | Not Started |

### Dependency Graph

```
M1: [Name]
├── TASK-001 ──┐
├── TASK-002 ──┼── TASK-003
└── TASK-004 ──┘

M2: [Name] (depends: M1)
├── TASK-005 ──┐
└── TASK-006 ──┴── TASK-007
```

### Critical Path

TASK-001 → TASK-002 → TASK-003 → TASK-006 → TASK-007

**Estimated critical path duration:** [X days/weeks]

---

## Milestone 1: [Name]

**Goal:** [User-visible outcome]
**Exit Criteria:** [How we know it's done]
**Target Date:** [If known]

### TASK-001: [Title]

**Component:** [From architecture]
**Estimate:** S | M | L | XL

**Goal:** 
[One sentence outcome]

**Action Items:**
- [ ] [Action 1]
- [ ] [Action 2]
- [ ] [Action 3]

**Dependencies:**
- Blocked by: None
- Blocks: TASK-002, TASK-003

**Acceptance Criteria:**
- [Criterion 1]
- [Criterion 2]

**Related Requirements:** PRD-XXX-REQ-NNN
**Related Decisions:** DR-NNN

**Status:** Not Started | In Progress | Complete | Blocked

---

### TASK-002: [Title]

[Same structure...]

---

## Milestone 2: [Name]

[Same structure...]

---

## Parking Lot

Tasks identified but not yet scheduled:

| ID | Description | Reason Deferred |
|----|-------------|-----------------|
| TASK-XXX | [description] | [why deferred] |

---

## Glossary

| Term | Definition |
|------|------------|
| [Term] | [Definition] |

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| [date] | Initial task breakdown | [name] |
```
