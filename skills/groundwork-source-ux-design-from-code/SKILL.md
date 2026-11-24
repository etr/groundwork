---
name: groundwork-source-ux-design-from-code
description: Synchronize design system document with codebase changes.
---
## Portable Project Context

Before interpreting project-context placeholders in this workflow:

1. Resolve the directory containing this `SKILL.md`.
2. Run `node <skill-directory>/scripts/project-context-cli.js resolve --harness zcode` from the repository working directory.
3. Use the returned JSON values as the exact bindings for `{{project_name}}`, `{{project_root}}`, `{{specs_dir}}`, `{{plans_dir}}`, `{{debug_dir}}`, and `{{research_dir}}` everywhere below.
4. If `selection_required` is true, follow the `groundwork-select-project` workflow, then resolve again.


# Sync Design System Skill

Keeps `{{specs_dir}}/design_system.md` synchronized with design implementation decisions made during sessions.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.** Skip this step silently if effort is `high`, `xhigh`, or `max` (the scale is `low` < `medium` < `high` < `xhigh` < `max`, so `xhigh` and `max` are already above `high`). Otherwise ask via `Ask the user` (header "Model check"; options "Continue anyway" / "Cancel — I'll switch first"):

> "Do you want to switch? Design token and pattern change categorization benefits from consistent reasoning.
>
> Recommended: GLM with reasoning at max.
>
> To switch: cancel, raise the reasoning effort to max in the model settings (and switch to GLM in the model picker if you are on GLM-Flash), then re-invoke this skill."

If the user selects "Cancel — I'll switch first": output the switching commands and stop. Do not proceed with the skill. Ask once per conversation: a skill invoked by another skill skips this step when the recommendation was already shown. In a non-interactive run (`--noninteractive`, `GROUNDWORK_RUNNER_MODE=true`, or `GROUNDWORK_BATCH_MODE=true`), skip the prompt and continue on the current model.

## Step 0: Resolve Project Context

1. **Monorepo check:** Does `.groundwork.yml` exist at the repo root?
   - If yes → Is `{{project_name}}` non-empty?
     - If empty → Follow the groundwork-select-project workflow steps to select a project, then restart this skill.
     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.
   - If no → Continue (single-project repo).
2. **CWD mismatch check (monorepo only):** skip it when the project was just selected or the invocation carried an explicit `--project`.
   - Compare CWD against the project paths in `.groundwork.yml`: the repo root or the selected project's path → fine, proceed; no project's path → proceed without warning (shared directory).
   - A different project's path → with `--noninteractive`, keep the selected project and continue; otherwise warn via `Ask the user`:
     > "You're working from `<cwd>` (inside **[cwd-project]**), but the selected Groundwork project is **[selected-project]** (`[selected-project-path]/`). What would you like to do?"
     > - "Switch to [cwd-project]"
     > - "Stay with [selected-project]"
     If the user switches, Follow the groundwork-select-project workflow steps.
3. Proceed with the resolved project context.

## File Locations

- **Target:** Design system document (may be single file or directory)
  - Single file: `{{specs_dir}}/design_system.md`
  - Directory: `{{specs_dir}}/design_system/` (content split across files)
- **Context:** Current session history, codebase changes

**Detection:** Check for a single file first (it takes precedence), then a directory. Read a directory as all its `.md` files recursively — `_index.md` first, then numerically-prefixed files, then alphabetically.

## When to Trigger

Run this skill at the end of a session in which:
- User explicitly invokes `/groundwork-source-ux-design-from-code`
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
- TUI: theme/color-slot or text-style constants added (Textual `.tcss`/themes, Lip Gloss styles, ratatui `Style`, Ink styles); border/glyph/key-hint vocabulary changed
- Mobile: theme edits (SwiftUI `Color` extensions/asset catalogs, Compose `MaterialTheme`, RN style tokens); text-style or safe-area usage changed

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
- TUI: keybinding maps, pane layouts, degradation-ladder or line-oriented-mode changes
- Mobile: navigation architecture, gesture handling, haptics, permission flows

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
| Visual atmosphere | Surface treatments, textures, spatial character, tonal direction | §2.5 Visual Atmosphere |
| Navigation | Nav structure, menu patterns | §3.1 Navigation |
| Loading states | Skeleton, spinner, progress patterns | §3.2 Loading States |
| Error handling | Error display, validation feedback | §3.3 Error Handling |
| Empty states | No-data, first-run experiences | §3.4 Empty States |
| Form patterns | Input validation, form layout | §3.5 Form Patterns |
| Responsive | Breakpoint decisions, mobile adaptations | §3.6 Responsive Behavior |
| Motion | Animation timing, transitions, entrance patterns, hover signatures | §3.7 Motion & Interaction Character |
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
   - Single file: Read `{{specs_dir}}/design_system.md`
   - Directory: Aggregate all `.md` files from `{{specs_dir}}/design_system/`
3. **Route updates to appropriate files:**
   - **Single file mode:** Edit `{{specs_dir}}/design_system.md` directly
   - **Directory mode:** Route each update:
     - Design principles (DP-NNN) → `{{specs_dir}}/design_system/01-foundations.md`
     - Accessibility → `{{specs_dir}}/design_system/01-foundations.md`
     - Token changes → `{{specs_dir}}/design_system/01-foundations.md`
     - Color system (BRD-NNN) → `{{specs_dir}}/design_system/02-brand-identity.md`
     - Typography → `{{specs_dir}}/design_system/02-brand-identity.md`
     - Brand voice → `{{specs_dir}}/design_system/02-brand-identity.md`
     - UX patterns (UXD-NNN) → `{{specs_dir}}/design_system/03-ux-patterns.md`
     - Component guidelines → `{{specs_dir}}/design_system/04-components.md`
     - Decision log entries → `{{specs_dir}}/design_system/05-decisions.md`
4. Maintain decision ID sequences (find highest DP/BRD/UXD-NNN, increment)
5. Update "Last updated" timestamp
6. If `{{specs_dir}}/ux-preview.html` exists, regenerate it to reflect the updated design system decisions
7. If `{{specs_dir}}/wireframes.html` exists, regenerate it too — the wireframes composite the design system onto the app's screens and go stale on any token/pattern change (Step 8c of `ux-design` for the format; screens and flows come from the PRD, so only regenerate screens that still exist)
8. Update "Status" if appropriate

**Important:**
- New decisions get the next available ID in their prefix sequence
- Never reuse deleted decision IDs (maintain traceability)
- Preserve existing content - add to sections, don't replace unless correcting errors

## Change Detection Heuristics

**Strong signals (likely design system change):**
- New CSS custom properties or variables defined
- TUI: theme/color-constant modules or style enums changed; keybinding/help vocabulary changed
- Mobile: `MaterialTheme`/SwiftUI theme edits; Dynamic Type or dark-mode variant changes
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

When done, report:

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
- `/groundwork-ux-design` - For deliberate, interactive design system creation
- `/groundwork-source-product-specs-from-code` - PRD changes may affect design requirements
- `/groundwork-source-architecture-from-code` - Architecture changes may affect UX patterns

When multiple sync commands run:
1. Run `/groundwork-source-product-specs-from-code` first (product drives design)
2. Run `/groundwork-source-ux-design-from-code` second (design supports product)
3. Run `/groundwork-source-architecture-from-code` last (architecture implements both)
