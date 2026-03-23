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

---

**Avoid**: Removing focus indicators without alternatives. Using placeholder text as labels. Touch targets below 44px. Custom controls without ARIA and keyboard support. Relying on hover for functionality (touch users can't hover). `tabindex` values greater than 0 (breaks natural tab order).
