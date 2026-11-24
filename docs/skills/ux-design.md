# `ux-design`

> **Run it:** `/groundwork:ux-design [product-name]` · **Tier:** user-run · **Reads:** the PRD (`specs/product_specs.md` or the `specs/product_specs/` directory); the architecture (`specs/architecture.md`), if present · **Writes:** `specs/design_system.md`, `specs/ux-preview.html`, `specs/wireframes.html`, and the comparison files under `specs/proposed-designs/`

## What it does

Establishes a design system — foundations, brand identity, and UX patterns — for a web, TUI, or mobile app surface. It leads with recommendations drawn from the PRD, and for the identity, atmosphere, and layout choices it generates an HTML comparison for you to open in a browser before you pick. The result is `specs/design_system.md` plus HTML references, built to meet the accessibility and design-slop checklists that `design-consistency-checker` enforces.

## When to reach for it

- A PRD exists and the product has a UI to design — web, TUI, or mobile app.
- You want the identity and the patterns written down before implementation, so later work has something to be checked against.
- **Not when:** the design system exists and the code has moved away from it. That is `source-ux-design-from-code`.

## Common questions

**It stopped and asked whether I want to switch models.**

That is the pre-flight step. It recommends Opus (1M context) at high effort and is skipped silently only when both are already true. Choose *Continue* to proceed as you are. The question is asked once per conversation — a skill invoked by another skill skips it once it has been shown — and a non-interactive run (a batch or the runner) skips it too.

**It said I need a PRD first.**

The personas, vision, and NFRs the system is derived from come from the PRD. Run `/groundwork:design-product` first. The architecture is optional, though it helps with UX pattern decisions.

**Can I delete the files under `specs/proposed-designs/`?**

No. The four comparison and showcase files are kept on purpose as the visual evidence behind the decisions. They show the options as they were when each choice was made; the current system is `specs/design_system.md` with `specs/ux-preview.html`.

**Is this only for web apps?**

No. It detects the surface — web, tui, or mobile — from the architecture and asks only when that is ambiguous or the product targets several. The modality is recorded in the header of `specs/design_system.md`, and the per-modality guides override the web defaults.

## It's working if

- Recommendations come with a reason tied to your PRD, and where you had no preference it named the choice it was taking and moved on.
- The tonal direction is a specific posture, not "professional" or "modern".
- The identity and layout choices each came with an HTML comparison under `specs/proposed-designs/` and an invitation to open it in your browser — and so did the atmosphere choice, unless you had already named the one you wanted.
- The identity comparison's helper table shows computed WCAG contrast ratios with an AA pass or fail.
- `specs/design_system.md` records the modality in its header and has a Decision Log with `DP-`, `BRD-`, and `UXD-` entries.
- `specs/ux-preview.html` shows token names, hex values, and font names next to the visuals.
- `specs/wireframes.html` shows the app's screens, and its screen list was confirmed with you before it was generated.

**It is not working if:** the identity options all feel "clean and minimal", or `specs/design_system.md` was written without a summary shown for your review.
