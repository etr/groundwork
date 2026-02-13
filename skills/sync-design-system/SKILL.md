---
name: sync-design-system
description: This skill should be used at session end when design tokens, colors, typography, or UX patterns changed during the session
user-invocable: false
---

# Sync Design System Skill

Keeps `specs/design_system.md` synchronized with design implementation decisions made during sessions.

## File Locations

- **Target:** Design system document (may be single file or directory)
  - Single file: `specs/design_system.md`
  - Directory: `specs/design_system/` (content split across files)
- **Context:** Current session history, codebase changes

**Detection:** Check for single file first (takes precedence), then directory.

## When to Trigger

This skill should activate when:
- User explicitly invokes `/groundwork:source-ux-design-from-code`
- Session involved design token changes (colors, spacing, typography)
- Component styling decisions were made
- UX patterns were implemented or modified
- Brand identity elements were added or changed

## Workflow Overview

1. **Analyze Session** - Review design-relevant changes this session
2. **Detect Changes** - Identify design system implications
3. **Propose Updates** - Draft decisions with appropriate IDs
4. **Apply Changes** - Update document with user approval

## Step 1: Analyze Session

Review the current session for:

**Token Changes:**
- New CSS custom properties or design tokens added
- Color values defined or modified
- Spacing/sizing values established
- Typography settings changed

**Component Styling:**
- New component variants created
- Styling patterns established
- Hover/focus/active states defined
- Responsive breakpoint adjustments

**UX Pattern Implementations:**
- Loading state patterns implemented
- Error handling UI added
- Empty state designs created
- Navigation patterns established
- Form validation approaches implemented
- Animation/motion added

**Brand Identity:**
- Logo usage implemented
- Color palette applied
- Font selections made
- Voice/tone established in UI copy

## Step 2: Detect Change Categories

| Category | Signal | Design System Section |
|----------|--------|----------------------|
| Design principle | Explicit "we should always..." statement | §1.2 Design Principles |
| Accessibility | ARIA labels, contrast fixes, focus states | §1.1 Accessibility Requirements |
| Spacing token | New spacing value, padding/margin pattern | §1.3 Token Categories (Spacing) |
| Elevation token | Shadow values, z-index decisions | §1.3 Token Categories (Elevation) |
| Border radius | Corner radius decisions | §1.3 Token Categories (Border Radius) |
| Color token | New color value, palette adjustment | §2.1 Color System |
| Typography | Font family, size, weight decisions | §2.2 Typography |
| Brand voice | UI copy patterns, tone decisions | §2.4 Brand Voice |
| Navigation | Nav structure, menu patterns | §3.1 Navigation |
| Loading states | Skeleton, spinner, progress patterns | §3.2 Loading States |
| Error handling | Error display, validation feedback | §3.3 Error Handling |
| Empty states | No-data, first-run experiences | §3.4 Empty States |
| Form patterns | Input validation, form layout | §3.5 Form Patterns |
| Responsive | Breakpoint decisions, mobile adaptations | §3.6 Responsive Behavior |
| Motion | Animation timing, transitions | §3.7 Motion Principles |
| Component | New component styling guidelines | §4 Component Guidelines |

## Step 3: Propose Updates

For each detected change, propose a specific update:

```markdown
## Proposed Design System Updates

### 1. New Design Principle

**Trigger:** You established that all interactive elements should have visible focus states.

**Proposed addition to §1.2 Design Principles:**

### DP-00X: Accessible Focus States

**Status:** Accepted
**Date:** [today]
**Context:** Implementing keyboard navigation revealed need for consistent focus indicators.

**Decision:** All interactive elements must have visible focus states with 3:1 contrast ratio.

**Rationale:** Supports keyboard-only users and WCAG 2.1 AA compliance.

---

### 2. New Color Token

**Trigger:** You added a new warning color for form validation.

**Proposed addition to §2.1 Color System:**

| Token | Value | Usage |
|-------|-------|-------|
| `--color-warning-light` | #FEF3C7 | Warning background |

**Proposed addition to §5 Decision Log (Brand Decisions):**

### BRD-00X: Warning Color Variant

**Status:** Accepted
**Date:** [today]
**Context:** Form validation needed softer warning background.

**Decision:** Added `--color-warning-light` (#FEF3C7) for warning backgrounds.

**Rationale:** Maintains warning semantic while providing softer background option.

---

### 3. UX Pattern Implementation

**Trigger:** You implemented skeleton loading screens for data tables.

**Proposed addition to §3.2 Loading States:**

**Data Tables:** Use skeleton rows matching table structure. Show 5 skeleton rows by default. Animate with subtle pulse.

**Proposed addition to §5 Decision Log (UX Decisions):**

### UXD-00X: Table Loading Pattern

**Status:** Accepted
**Date:** [today]
**Context:** Data tables needed loading feedback during API calls.

**Decision:** Use skeleton rows (5 default) with pulse animation for table loading states.

**Rationale:** Maintains layout stability and sets user expectations for content shape.

---

Approve these updates? (yes/no/modify)
```

## Step 4: Apply Changes

On approval:

1. **Detect spec format** - Check if design system is single file or directory
2. **Read current content:**
   - Single file: Read `specs/design_system.md`
   - Directory: Aggregate all `.md` files from `specs/design_system/`
3. **Route updates to appropriate files:**
   - **Single file mode:** Edit `specs/design_system.md` directly
   - **Directory mode:** Route each update:
     - Design principles (DP-NNN) → `specs/design_system/01-foundations.md`
     - Accessibility → `specs/design_system/01-foundations.md`
     - Token changes → `specs/design_system/01-foundations.md`
     - Color system (BRD-NNN) → `specs/design_system/02-brand-identity.md`
     - Typography → `specs/design_system/02-brand-identity.md`
     - Brand voice → `specs/design_system/02-brand-identity.md`
     - UX patterns (UXD-NNN) → `specs/design_system/03-ux-patterns.md`
     - Component guidelines → `specs/design_system/04-components.md`
     - Decision log entries → `specs/design_system/05-decisions.md`
4. Maintain decision ID sequences (find highest DP/BRD/UXD-NNN, increment)
5. Update "Last updated" timestamp
6. Update "Status" if appropriate

**Important:**
- New decisions get the next available ID in their prefix sequence
- Never reuse deleted decision IDs (maintain traceability)
- Preserve existing content - add to sections, don't replace unless correcting errors

## Change Detection Heuristics

**Strong signals (likely design system change):**
- New CSS custom properties or variables defined
- Explicit design decisions ("let's use X for all buttons")
- Accessibility fixes (contrast, ARIA, focus states)
- New component variants with distinct styling
- Animation/transition values established
- Breakpoint or responsive behavior decisions

**Weak signals (maybe design system change):**
- One-off styling for specific component
- Temporary styling during development
- Framework default overrides
- Bug fixes to existing styles

Focus on strong signals. For weak signals, ask: "Is this a pattern we want to establish, or a one-time implementation detail?"

## Session Summary Format

At session end, provide summary:

```markdown
## Design System Sync Summary

**Session Date:** [date]

### Changes Detected:
1. [Change 1] → New principle DP-00X
2. [Change 2] → New color token BRD-00X
3. [Change 3] → UX pattern UXD-00X
4. [Change 4] → No design system impact (implementation detail)

### Design System Document:
- [X] Updated with approved changes
- [ ] No changes needed
- [ ] Changes pending user review

### Decision IDs Added/Modified:
- DP-00X (new)
- BRD-00X (new)
- UXD-00X (new)

### Open Items:
- [Any unresolved design questions from session]
```

---

## Interaction with Other Skills

This skill works in concert with:
- `groundwork:design-system` - For deliberate, interactive design system creation
- `groundwork:sync-specs` - PRD changes may affect design requirements
- `groundwork:sync-architecture` - Architecture changes may affect UX patterns

When multiple sync skills run:
1. Run `groundwork:sync-specs` first (product drives design)
2. Run `groundwork:sync-design-system` second (design supports product)
3. Run `groundwork:sync-architecture` last (architecture implements both)

