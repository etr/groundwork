# Accessibility Review Checklist

Authoritative criteria for accessibility review, targeting **WCAG Level AA**. Read by the `ux-design` skill (build to this bar) and the `design-consistency-checker` agent (review against it). Accessibility failures (no focus state, contrast failure, missing label) are critical — they lock real users out, not just degrade polish.

Project-specific specs (exact focus-ring width, AAA targets, brand semantic colors) come from the project's `design_system.md`, not this file — including its declared **Modality**, which selects the dialect below.

Structure: the **Four Principles** apply to every modality; the dialect sections state the concrete criteria. Apply the dialect matching the `design_system.md` header — **Web Dialect** (WCAG 2.1 AA), **TUI Dialect**, or **Mobile Dialect** (WCAG 2.2 mobile guidance). When the modality is undeclared, default to the web dialect.

## WCAG Core — The Four Principles (all modalities)

- **Perceivable** — text alternatives for non-text content; captions/transcripts for media; sufficient contrast; content adapts without loss (reflow/zoom on web, resize/degradation on tui, text scaling on mobile)
- **Operable** — everything works via the modality's primary input (keyboard on web/tui; touch with alternatives on mobile); no traps; no seizure-inducing flashing (>3/sec); visible focus; ways past repeated blocks
- **Understandable** — predictable navigation; inputs labeled; errors identified with suggestions; consistent components
- **Robust** — semantics exposed to assistive tech (semantic HTML/ARIA on web; accessibility elements/traits on mobile; linear text output on tui)

## Web Dialect (WCAG 2.1 AA)

### Keyboard Navigation

- [ ] Every interactive element is reachable and operable by keyboard alone (Tab, Enter, Space, arrows, Esc)
- [ ] Tab order is logical and follows visual/reading order; no positive `tabindex` (`tabindex` is only `0` or `-1`)
- [ ] No keyboard traps — focus can always move away (esp. modals, embeds, custom widgets)
- [ ] Component groups (tabs, menus, radios, listboxes) use roving tabindex, not one stop per item
- [ ] Skip-to-main-content link present for pages with repeated nav
- [ ] No `onClick` on `<div>`/`<span>` without `role`, `tabindex="0"`, and a key handler — prefer `<button>`/`<a>`

### Screen Reader / ARIA

- [ ] Semantic HTML first: `<button>`, `<a href>`, `<nav>`, `<main>`, `<h1>`–`<h6>` in order, `<table>` for tabular data
- [ ] ARIA only when native semantics are insufficient — "no ARIA is better than bad ARIA"
- [ ] Icon-only buttons/links have an accessible name (`aria-label` or visually-hidden text)
- [ ] Images: meaningful ones have descriptive `alt`; decorative ones have `alt=""` or `aria-hidden="true"`
- [ ] `alt` describes content/function, not the medium (`alt="image"`/`"icon"`/`"logo"` is a fail)
- [ ] Dynamic updates announced via `aria-live` (`polite`/`assertive`) regions
- [ ] ARIA roles/states valid and kept in sync (`aria-expanded`, `aria-selected`, `aria-checked`, `aria-disabled`)
- [ ] `aria-hidden="true"` never on a focusable element

### Color & Contrast

- [ ] Normal text ≥ **4.5:1**; large text (≥ 18.66px bold or 24px) ≥ **3:1**
- [ ] UI components and graphical objects (icons, input borders, focus rings) ≥ **3:1** against adjacent colors
- [ ] Information is never conveyed by color alone (add icon, text, or pattern — e.g. error state)
- [ ] Semantic colors (error/warning/success) checked against their backgrounds, including dark mode

### Focus Management

- [ ] Every interactive element has a visible focus indicator; never `outline: none` without a replacement
- [ ] Focus indicator ≥ 3:1 contrast, with offset, not relying on color change alone
- [ ] Use `:focus-visible` (keyboard) rather than bare `:focus` (also fires on mouse click)
- [ ] Modals/dialogs: trap focus inside, move focus in on open, return focus to the trigger on close
- [ ] Background made inert (`inert` / `aria-hidden`) while a modal is open
- [ ] Route changes / new content move focus to a sensible target (heading or main region)

### Forms & Labels

- [ ] Every input has a programmatically associated `<label>` (`for`/`id` or wrapping) — placeholder is **not** a label
- [ ] Related controls grouped with `<fieldset>` + `<legend>` (radio/checkbox groups)
- [ ] Required fields and constraints communicated in text, not color/asterisk alone
- [ ] Errors: identified in text, tied to the field (`aria-describedby`), and offer a fix suggestion
- [ ] Error summary on submit moves focus to itself / first invalid field
- [ ] Autocomplete attributes on common fields (`autocomplete="email"`, etc.)
- [ ] Touch targets ≥ 44×44px (or small visual + enlarged hit area)

### Structure & Media

- [ ] One `<h1>`; headings nest without skipping levels
- [ ] Page has a descriptive `<title>` and `lang` attribute on `<html>`
- [ ] Viewport meta allows zoom — no `user-scalable=no` or `maximum-scale=1`
- [ ] Body/reading text ≥ 16px; layout survives 200% zoom and 320px width
- [ ] `prefers-reduced-motion` honored — every animation/transition has a reduced-motion path
- [ ] Video/audio has captions/transcripts; no autoplay with sound

## TUI Dialect

The terminal is keyboard-first by default and screen-reader-hostile by default. Design against both.

**Keyboard & focus**
- [ ] Every action reachable by keyboard alone — this is the baseline input, not an accommodation
- [ ] Focus always visible: selected row/cursor **and** a pane-level indicator of which pane receives input
- [ ] Focus order matches reading order (top-left → bottom-right); `?`/`F1` help, `Esc` closes overlays, `Ctrl-C` always interrupts
- [ ] No keyboard traps in overlays/modals — Esc always exits

**Screen readers**
- [ ] A line-oriented output mode (or `--plain` screen-reader mode) exists as a first-class pattern — state changes as appended lines, not full-screen repaints
- [ ] Alt-screen/full-screen takeover is a deliberate documented decision (it hides scrollback and breaks screen readers); inline rendering is the safer default
- [ ] Dynamic changes are expressible as text; nothing is communicated only by cursor position or repaint

**Color & contrast**
- [ ] Fixed fg/bg pairings (selection bars, banners) meet 4.5:1 (3:1 UI); colors worn against the *user's* theme pass against both a light and a dark reference theme
- [ ] `NO_COLOR`, non-TTY, and `TERM=dumb` degrade to plain text — never garbage escapes
- [ ] Never color alone: state differs in glyph or weight (✗/✓, bold), not just hue
- [ ] Truecolor palettes declare ANSI-16 fallbacks

**Layout & motion**
- [ ] Content survives resize; at 80×24 nothing informative disappears (degradation ladder)
- [ ] No flashing faster than 3/sec; spinners live in chrome, not over content; no animation when output is piped or `NO_COLOR` is set

## Mobile Dialect

Anchored on the W3C "Applying WCAG 2.2 to Mobile Applications" guidance (w3.org/TR/wcag2mobile-22).

**Labels & semantics**
- [ ] Every control has a programmatic label — `accessibilityLabel` (iOS) / `contentDescription` (Android); placeholder-shaped hints are not labels
- [ ] Traits/roles match function (button, header, selected); state changes exposed programmatically
- [ ] Custom components (charts, canvas, maps) provide text alternatives describing the information, not the medium

**Focus & traversal**
- [ ] VoiceOver (iOS) / TalkBack (Android) traversal order matches visual/logical order
- [ ] Custom gestures have screen-reader-accessible equivalents; dragging movements have alternative controls
- [ ] Focus moves to a sensible target on screen changes (title or first content)

**Text & display**
- [ ] Text scales with Dynamic Type (iOS) / font scale (Android); layout survives the largest standard setting
- [ ] Contrast meets WCAG 2.2 ratios in **both** light and dark mode, including text over photos/blur
- [ ] Never color alone — states carry icons, glyphs, or text

**Targets & motion**
- [ ] Touch targets ≥ 44pt (iOS) / 48dp (Android); the visual element may be smaller with an enlarged hit area
- [ ] OS Reduce Motion / Remove Animations honored — decorative spatial motion replaced with crossfades; functional transitions kept

## Testing

- **Automated (catches ~30–40%):** axe-core / `@axe-core/playwright`, Lighthouse a11y audit, `eslint-plugin-jsx-a11y`, Pa11y, WAVE
- **Manual contrast:** browser DevTools contrast checker, WebAIM Contrast Checker
- **Keyboard:** unplug the mouse — Tab/Shift+Tab/Enter/Space/Esc/arrows through the whole flow
- **Screen readers:** VoiceOver (macOS/iOS), NVDA (Windows), TalkBack (Android), Orca (Linux)
- **Zoom/reflow:** 200% browser zoom and 320px-wide viewport
- **TUI:** run in a light and a dark terminal theme; at 80×24; with `NO_COLOR` set and output piped; spot-check with a screen reader (e.g., VoiceOver in Terminal.app), including the line-oriented mode if the app has one
- **Mobile:** VoiceOver (iOS) / TalkBack (Android) traversal of the primary flow; Dynamic Type at the largest standard setting; dark mode; one-handed reach for primary actions

> Automated tools never prove accessibility — they only flag a subset. Manual keyboard + screen-reader passes are required for real coverage.
