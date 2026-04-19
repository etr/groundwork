# Tasks Directory Template

Use this structure when creating task files in `{{specs_dir}}/tasks/`.

## Directory Structure

```
specs/tasks/
├── _index.md
├── M1-{slug}/
│   ├── TASK-001.md
│   ├── TASK-002.md
│   └── TASK-003.md
├── M2-{slug}/
│   ├── TASK-004.md
│   └── TASK-005.md
└── parking-lot.md
```

## `_index.md` Template

```markdown
# Implementation Tasks

**Generated from:**
- PRD: `{{specs_dir}}/product_specs.md`
- Architecture: `{{specs_dir}}/architecture.md`

**Last updated:** <today>
**Status:** Draft | In Progress | Complete

---

## Overview

**Total Tasks:** [N]
**Milestones:** [N]
**Estimated Duration:** [X weeks/months]

### Milestone Summary

| Milestone | Directory | Tasks | Status |
|-----------|-----------|-------|--------|
| M1 | `M1-[slug]/` | [N] | Not Started |
| M2 | `M2-[slug]/` | [N] | Not Started |
| M3 | `M3-[slug]/` | [N] | Not Started |

### Dependency Graph

` ``
M1: [Name]
├── TASK-001 ──┐
├── TASK-002 ──┼── TASK-003
└── TASK-004 ──┘

M2: [Name] (depends: M1)
├── TASK-005 ──┐
└── TASK-006 ──┴── TASK-007
` ``

### Task Status

| # | Task | Milestone | Status | Blocked by |
|---|------|-----------|--------|------------|
| TASK-001 | [Title] | M1 | Not Started | None |
| TASK-002 | [Title] | M1 | Not Started | TASK-001 |
| TASK-003 | [Title] | M1 | Not Started | TASK-001 |
| TASK-004 | [Title] | M2 | Not Started | TASK-002, TASK-003 |
| TASK-005 | [Title] | M2 | Not Started | TASK-004 |

### Critical Path

TASK-001 → TASK-002 → TASK-003 → TASK-006 → TASK-007

**Estimated critical path duration:** [X days/weeks]
```

## Individual Task File Template (`TASK-NNN.md`)

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

## `parking-lot.md` Template

```markdown
# Parking Lot

Tasks identified but not yet scheduled:

| ID | Description | Reason Deferred |
|----|-------------|-----------------|
| TASK-XXX | [description] | [why deferred] |
```
