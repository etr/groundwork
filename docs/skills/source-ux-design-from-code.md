# `source-ux-design-from-code`

> **Run it:** `/groundwork:source-ux-design-from-code` · **Tier:** user-run · **Reads:** the current session, the codebase changes, `specs/design_system.md` (or the `design_system/` directory) · **Writes:** the same design system document, only after you approve each update; `specs/ux-preview.html` and `specs/wireframes.html`, when they exist

## What it does

Brings the design system document back in line with what was built. It gathers the session's token changes, component styling, UX patterns, and brand decisions, sorts each one into a section of the design system, and proposes an update with an ID: `DP-` for a design principle, `BRD-` for a brand decision, `UXD-` for a UX decision. It applies only what you approve and ends with a `Design System Sync Summary`.

## When to reach for it

- The end of a session in which design tokens changed — colors, spacing, typography — or brand identity did: logo usage, palette, fonts, voice in UI copy.
- Component styling was decided, or a UX pattern was implemented or modified: loading, error, and empty states, navigation, forms, motion.
- When more than one sync skill is due, run `source-product-specs-from-code` first, this one second, and `source-architecture-from-code` last.
- **Not when:** you are creating the design system on purpose. That is `ux-design`; this skill records decisions already made in code.

## Common questions

**It opened by asking me to switch model or effort.**

That is the pre-flight check. It is skipped only when effort is `high`, `xhigh`, or `max` and the model is Sonnet or Opus. "Continue anyway" goes ahead; "Cancel — I'll switch first" prints the switching commands and stops. The question is asked once per conversation — a skill invoked by another skill skips it once it has been shown — and a non-interactive run (a batch or the runner) skips it too.

**What does it read — the session or the code?**

Both. The session history and the codebase changes: new CSS custom properties or tokens, color values, spacing, typography, component variants — and, for TUI and mobile apps, theme and style-constant edits.

**It asked whether a one-off style is a pattern.**

One-off styling, temporary styling, framework default overrides, and style bug fixes are weak signals. For those it asks: "Is this a pattern we want to establish, or a one-time implementation detail?"

**Where does it write?**

Into `specs/design_system.md`, or across `specs/design_system/` when the design system is already a directory; a single file is checked first and takes precedence. If `specs/ux-preview.html` exists it is regenerated, and so is `specs/wireframes.html`: the wireframes go stale on any token or pattern change.

## It's working if

- Every proposal names its trigger from the session and the section it changes.
- Nothing was written before you approved it.
- A new decision is a record with Status, Date, Context, Decision, and Rationale.
- New decisions carry the next available ID in their prefix — `DP-`, `BRD-`, or `UXD-` — and a deleted ID is never reused.
- `ux-preview.html` and `wireframes.html` were regenerated, if they exist.
- The run ends with a `Design System Sync Summary` listing the decision IDs added or modified and the open items.

**It is not working if:** the design system changed before you approved it, or a section was replaced rather than added to.
