# Accessibility Review Checklist

Authoritative criteria for accessibility review, targeting **WCAG 2.1 Level AA**. Read by the `ux-design` skill (build to this bar) and the `design-consistency-checker` agent (review against it). Accessibility failures (no focus state, contrast failure, missing label) are critical — they lock real users out, not just degrade polish.

Project-specific specs (exact focus-ring width, AAA targets, brand semantic colors) come from the project's `design_system.md`, not this file.

## WCAG 2.1 AA — The Four Principles

- **Perceivable** — text alternatives for non-text content; captions/transcripts for media; sufficient contrast; content adapts to 320px width and 200% zoom without loss
- **Operable** — everything works by keyboard; no keyboard traps; no seizure-inducing flashing (>3/sec); skip links; visible focus
- **Understandable** — predictable navigation; inputs labeled; errors identified with suggestions; consistent components
- **Robust** — valid semantic HTML; ARIA used correctly; works with assistive tech

## Keyboard Navigation

- [ ] Every interactive element is reachable and operable by keyboard alone (Tab, Enter, Space, arrows, Esc)
- [ ] Tab order is logical and follows visual/reading order; no positive `tabindex` (`tabindex` is only `0` or `-1`)
- [ ] No keyboard traps — focus can always move away (esp. modals, embeds, custom widgets)
- [ ] Component groups (tabs, menus, radios, listboxes) use roving tabindex, not one stop per item
- [ ] Skip-to-main-content link present for pages with repeated nav
- [ ] No `onClick` on `<div>`/`<span>` without `role`, `tabindex="0"`, and a key handler — prefer `<button>`/`<a>`

## Screen Reader / ARIA

- [ ] Semantic HTML first: `<button>`, `<a href>`, `<nav>`, `<main>`, `<h1>`–`<h6>` in order, `<table>` for tabular data
- [ ] ARIA only when native semantics are insufficient — "no ARIA is better than bad ARIA"
- [ ] Icon-only buttons/links have an accessible name (`aria-label` or visually-hidden text)
- [ ] Images: meaningful ones have descriptive `alt`; decorative ones have `alt=""` or `aria-hidden="true"`
- [ ] `alt` describes content/function, not the medium (`alt="image"`/`"icon"`/`"logo"` is a fail)
- [ ] Dynamic updates announced via `aria-live` (`polite`/`assertive`) regions
- [ ] ARIA roles/states valid and kept in sync (`aria-expanded`, `aria-selected`, `aria-checked`, `aria-disabled`)
- [ ] `aria-hidden="true"` never on a focusable element

## Color & Contrast

- [ ] Normal text ≥ **4.5:1**; large text (≥ 18.66px bold or 24px) ≥ **3:1**
- [ ] UI components and graphical objects (icons, input borders, focus rings) ≥ **3:1** against adjacent colors
- [ ] Information is never conveyed by color alone (add icon, text, or pattern — e.g. error state)
- [ ] Semantic colors (error/warning/success) checked against their backgrounds, including dark mode

## Focus Management

- [ ] Every interactive element has a visible focus indicator; never `outline: none` without a replacement
- [ ] Focus indicator ≥ 3:1 contrast, with offset, not relying on color change alone
- [ ] Use `:focus-visible` (keyboard) rather than bare `:focus` (also fires on mouse click)
- [ ] Modals/dialogs: trap focus inside, move focus in on open, return focus to the trigger on close
- [ ] Background made inert (`inert` / `aria-hidden`) while a modal is open
- [ ] Route changes / new content move focus to a sensible target (heading or main region)

## Forms & Labels

- [ ] Every input has a programmatically associated `<label>` (`for`/`id` or wrapping) — placeholder is **not** a label
- [ ] Related controls grouped with `<fieldset>` + `<legend>` (radio/checkbox groups)
- [ ] Required fields and constraints communicated in text, not color/asterisk alone
- [ ] Errors: identified in text, tied to the field (`aria-describedby`), and offer a fix suggestion
- [ ] Error summary on submit moves focus to itself / first invalid field
- [ ] Autocomplete attributes on common fields (`autocomplete="email"`, etc.)
- [ ] Touch targets ≥ 44×44px (or small visual + enlarged hit area)

## Structure & Media

- [ ] One `<h1>`; headings nest without skipping levels
- [ ] Page has a descriptive `<title>` and `lang` attribute on `<html>`
- [ ] Viewport meta allows zoom — no `user-scalable=no` or `maximum-scale=1`
- [ ] Body/reading text ≥ 16px; layout survives 200% zoom and 320px width
- [ ] `prefers-reduced-motion` honored — every animation/transition has a reduced-motion path
- [ ] Video/audio has captions/transcripts; no autoplay with sound

## Testing

- **Automated (catches ~30–40%):** axe-core / `@axe-core/playwright`, Lighthouse a11y audit, `eslint-plugin-jsx-a11y`, Pa11y, WAVE
- **Manual contrast:** browser DevTools contrast checker, WebAIM Contrast Checker
- **Keyboard:** unplug the mouse — Tab/Shift+Tab/Enter/Space/Esc/arrows through the whole flow
- **Screen readers:** VoiceOver (macOS/iOS), NVDA (Windows), TalkBack (Android), Orca (Linux)
- **Zoom/reflow:** 200% browser zoom and 320px-wide viewport

> Automated tools never prove accessibility — they only flag a subset. Manual keyboard + screen-reader passes are required for real coverage.
