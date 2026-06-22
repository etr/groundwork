# Accessibility Review Checklist

Authoritative criteria for accessibility review, targeting **WCAG 2.1 Level AA**. Organized by the four POUR principles. An interface that a keyboard or screen-reader user cannot operate is broken, not merely imperfect — flag it.

## Perceivable

- [ ] Every non-decorative image/icon has a meaningful `alt`; decorative ones have empty `alt=""` (or `aria-hidden`)
- [ ] Text contrast ≥ **4.5:1** (normal) / **3:1** (large ≥ 18.66px bold or 24px); UI components & graphical objects ≥ **3:1**
- [ ] Information is never conveyed by **color alone** (add text, icon, or pattern)
- [ ] Content reflows and stays usable at 200% zoom and 320px width; no loss of content/function
- [ ] Media has captions/transcripts where applicable
- [ ] Respects `prefers-reduced-motion`; no content flashes more than 3×/second

## Operable

- [ ] **Every interactive element is keyboard-reachable and operable** (Tab/Shift-Tab/Enter/Space/Arrows); no mouse-only behavior
- [ ] **No keyboard trap** — focus can always move away
- [ ] **Visible focus indicator** on every focusable element (don't remove outlines without a replacement)
- [ ] Logical focus order matches visual/reading order; DOM order sensible
- [ ] Focus is **managed** on route changes, dialog open/close (move to dialog, return to trigger), and dynamic content
- [ ] Targets are adequately sized; not time-limited without a way to extend
- [ ] A "skip to content" link exists for repeated nav blocks

## Understandable

- [ ] Page has a descriptive `<title>` and a single logical `<h1>`; headings nest without skipping levels
- [ ] `lang` attribute set on `<html>`
- [ ] **Form inputs have programmatic labels** (`<label for>`, `aria-label`, or `aria-labelledby`) — placeholder is not a label
- [ ] Errors are identified in text (not color alone), associated with their field (`aria-describedby`), and suggest a fix
- [ ] Required fields and input formats are communicated before submission
- [ ] Navigation and component behavior are consistent across the app

## Robust

- [ ] **Semantic HTML first** — real `<button>`, `<a>`, `<nav>`, `<main>`, `<ul>`; reach for ARIA only when no native element fits
- [ ] ARIA is correct: valid roles, required states/properties present, no contradicting native semantics ("no ARIA is better than bad ARIA")
- [ ] Custom widgets implement the expected **ARIA Authoring Practices** keyboard pattern (menu, combobox, tabs, dialog, etc.)
- [ ] Dynamic updates announced via appropriate live regions (`aria-live`) without spamming
- [ ] Name, role, value are exposed for all custom controls; state changes (expanded, selected, checked) reflected in ARIA

## Testing

- [ ] Automated pass (axe / Lighthouse / pa11y) with no serious violations — automated tools catch ~30–40%, so also:
- [ ] **Keyboard-only walkthrough** of each primary flow
- [ ] Screen-reader smoke test (VoiceOver / NVDA) on key flows
- [ ] Verify at 200% zoom and with reduced-motion enabled

> Automated checks are necessary, not sufficient. The keyboard and screen-reader walkthroughs find what scanners miss.
