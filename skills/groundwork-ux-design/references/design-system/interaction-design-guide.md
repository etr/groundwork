# Interaction Design Guide

## The Eight Interactive States

Every interactive element needs all applicable states designed:

| State | When | Visual Treatment |
|-------|------|------------------|
| **Default** | At rest | Base styling |
| **Hover** | Pointer over (not touch) | Subtle lift, color shift |
| **Focus** | Keyboard/programmatic focus | Visible ring (see below) |
| **Active** | Being pressed | Pressed in, darker |
| **Disabled** | Not interactive | Reduced opacity, no pointer |
| **Loading** | Processing | Spinner, skeleton |
| **Error** | Invalid state | Red border, icon, message |
| **Success** | Completed | Green check, confirmation |

**The common miss**: Designing hover without focus, or vice versa. They're different states — keyboard users never see hover. If any state is left undefined, it will be improvised during implementation.

## Focus Management

### Focus Rings

Never `outline: none` without replacement. Use `:focus-visible` to show focus rings only for keyboard users:

```css
button:focus { outline: none; }
button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

**Specification:**
- Contrast: 3:1 minimum against adjacent colors
- Width: 2-3px
- Offset: outside the element, not overlapping content
- Consistency: same treatment across all interactive elements

### Roving Tabindex

For component groups (tabs, menu items, radio groups), one item is tabbable; arrow keys move within:

```html
<div role="tablist">
  <button role="tab" tabindex="0">Tab 1</button>
  <button role="tab" tabindex="-1">Tab 2</button>
  <button role="tab" tabindex="-1">Tab 3</button>
</div>
```

Arrow keys move `tabindex="0"` between items. Tab moves to the next component entirely.

### Skip Links

Provide `<a href="#main-content">Skip to main content</a>` for keyboard users to bypass navigation. Hide off-screen, show on focus.

## Form Interaction

**Placeholders are not labels** — they disappear on input. Always use visible `<label>` elements associated via `for`/`id`.

**Validate on blur**, not on every keystroke. Exception: password strength meters benefit from live feedback. Place errors below fields with `aria-describedby` connecting them.

## Confirmation Patterns

**Undo is better than confirmation dialogs** — users click through confirmations mindlessly. For reversible actions: remove from UI immediately, show undo toast, actually execute after toast expires.

Use confirmation dialogs only for:
- Truly irreversible actions (account deletion)
- High-cost actions (payments, bulk operations)
- Actions affecting other users

When confirming: name the action specifically, explain consequences, use verb+object button labels ("Delete project" / "Keep project", not "Yes" / "No").

## Touch Targets

44px minimum tap area, even when the visual element is smaller. Use pseudo-elements to enlarge hit areas without changing visual size:

```css
.icon-button {
  width: 24px; height: 24px;
  position: relative;
}
.icon-button::before {
  content: '';
  position: absolute;
  inset: -10px;  /* Expands tap target to 44px */
}
```

## Native Elements

**Use native `<dialog>` for modals.** It provides focus trapping, Escape to close, and accessibility for free:

```html
<main inert><!-- Background content locked --></main>
<dialog open>
  <h2>Modal Title</h2>
  <!-- Focus stays inside -->
</dialog>
```

**Use the Popover API for tooltips and dropdowns.** It provides light-dismiss, proper stacking, no z-index wars, and accessibility by default:

```html
<button popovertarget="menu">Open menu</button>
<div id="menu" popover>
  <button>Option 1</button>
</div>
```

Prefer native elements over custom implementations — they handle edge cases (screen readers, keyboard, stacking) that custom code consistently misses.

## Gesture Discoverability

Swipe, drag, and similar gestures are invisible. Always:
- Provide a visible fallback (menu with "Delete" alongside swipe-to-delete)
- Hint at gesture existence (partially revealed action area)
- Never make gestures the only path to an action

## Interaction Signatures

Products converge on characteristic input styles — observed across the 59-brand survey. Use these to commit to one primary input channel rather than supporting every modality equally (which dilutes all of them).

### Keyboard-First

The product assumes a physical keyboard, invests in shortcuts, and makes them *visible* (keycap pills, hint overlays, ⌘K command palette that teaches its own bindings).

**Canonical reference:** Linear — every action has a shortcut and the shortcut is shown inline next to it, so the interface teaches itself. See also spacebar-peek previews (`pattern-examples.md`) for the macOS-Finder-style keyboard affordance ported to the web.

**Design implications:** Keycap pills in marketing + product. ⌘K palette is non-negotiable. Every modal must close on `Esc`. Tab order must follow reading order, never DOM order.

### Hover-Reveal

Actions are hidden at rest and reveal on hover/focus, keeping the resting UI calm. Works only on pointer devices — needs a touch fallback.

**Canonical reference:** GitHub-style row hovers — actions invisible at rest, revealed on hover or focus. Stripe's customer tables and Notion's block handles use the same rule.

**Design implications:** Always provide a `:focus-within` fallback so keyboard users see the same affordances. On touch, surface a `…` overflow affordance — never rely on long-press as discovery path. Ensure the hover-reveal doesn't shift layout (reserve the space at rest).

### Gesture-Heavy

The product is built around pointer gestures — drag, pan, zoom, multi-select-drag. Input is the product.

**Canonical reference:** Figma — pan, zoom, and drag *are* the canvas; no amount of buttons would compensate if the gestures weren't right.

**Design implications:** Gestures must be discoverable — always pair a drag gesture with a visible menu option for the same action. Provide a touch fallback that preserves the affordance (slide-to-delete + "Delete" button). Never make a gesture the *only* way to reach a destination.

### Chat / Command

The primary input is a single text box — natural language or commands — and the UI renders responses streamed back. A recent archetype owned by AI products.

**Canonical reference:** Claude / ChatGPT — a single text box as the hero; streaming tokens rendered as they arrive, structured results (tables, code) inline, "stop" surfaced more prominently than "regenerate".

**Design implications:** The input box is the hero. Streaming output needs to read as immediate — render tokens as they arrive, never buffer sentences. Provide "stop" more prominently than "regenerate". Show structured results (tables, code) inline, never as attachments.

### Tap / Thumb-First

Designed for one-handed mobile use — large thumb-reachable targets, bottom-sheet UI, swipe-to-dismiss.

**Canonical reference:** rideshare and streaming mobile apps — bottom nav, every CTA in the bottom third of the viewport, gestures backed by visible affordances (chevrons, handles).

**Design implications:** Bottom nav, not top. Every CTA sits in the bottom third of the viewport on mobile. Gestures backed by visible affordances (chevrons, handles). Desktop versions should not replicate mobile gestures — redesign for pointer.

### Choose one primary — not all five

A product that invests equally in keyboard, hover, gesture, chat, and touch will feel inconsistent on every surface. Pick the signature that matches how your best users actually work, build it exceptionally, and treat the other channels as graceful degradations.

---

**Avoid**: Removing focus indicators without alternatives. Using placeholder text as labels. Touch targets below 44px. Custom controls without ARIA and keyboard support. Relying on hover for functionality (touch users can't hover). `tabindex` values greater than 0 (breaks natural tab order).
