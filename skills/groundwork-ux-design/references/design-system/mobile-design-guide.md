# Mobile Design Guide

Applies when the design system declares **Modality: mobile** (native or cross-platform apps). The web defaults elsewhere in this skill (px units, hover states, breakpoints, viewport meta) do not apply. The surface is a touch-first, single-window, user-personalized device: system dark mode, system text size, one thumb, and platform conventions the user has been trained on by every other app.

Load this guide for Steps 3–8 whenever modality is `mobile`. It follows the same step names as the web track; sections below map to them.

## Scope Resolution (before Step 1)

Record in the design system header, resolving from the architecture doc — asking the user only if it doesn't say:

| Question | Values | Why it matters |
|----------|--------|----------------|
| Platforms | iOS / Android / both | Convention set per platform |
| Stack | Native (SwiftUI / Jetpack Compose) or cross-platform (React Native / Flutter / KMP) | Determines how tokens are expressed and how deep platform adaptation can go |
| Minimum OS | e.g., iOS 17 / Android 12 | Gates Dynamic Type, Material 3, adaptive APIs |
| Form factors | phone / tablet / foldable | Tablet+foldable changes navigation architecture (see Layout) |

Vocabulary worth keeping precise (Flutter's usage): **responsive** = fits the available space; **adaptive** = selects the appropriate layout/navigation *for* that space and platform. Mobile apps need both, and "adaptive" is the part web habits forget.

## The Identity Decision: Brand vs Platform (Step 2/4)

Every modality has one "brand vs environment" decision. For mobile it is: **how much does the product behave like the platform's other apps?**

| Posture | What follows the platform | What carries the brand |
|---------|--------------------------|------------------------|
| **Platform-native** | Navigation, gestures, system chrome, motion, haptics | Palette accent, typography within system text styles, content voice |
| **Opinionated brand** | Only the irreducibles (safe areas, text scaling, a11y) | Custom everything — justified by a strong tonal direction |
| **Balanced (recommended default)** | Navigation model, back behavior, system gestures, motion curves | Color identity, type personality, component character |

Record the posture as a BRD decision. Cross-platform stacks force the choice explicitly: a single shared skin across iOS/Android is the classic cross-platform tell (see slop); either adapt per platform (Flutter's `Platform` widgets, RN's platform-specific files) or own the opinionated-brand posture deliberately. Per-platform deltas are documented, not accidental.

## Tokens (Step 3)

The two-layer principle carries over (primitives → semantic slots). Units and categories change:

| Category | Tokens | Notes |
|----------|--------|-------|
| Sizing | logical units only — `pt` (iOS) / `dp` (Android) / RN's density-independent unit | Never raw px; never absolute pixel assumptions |
| Spacing | `space-xs`…`space-xl` in dp/pt (4-grid still applies) | Same semantic naming as web |
| Touch targets | `target-min`: **44pt (iOS HIG) / 48dp (Android)** — floor, not aspiration | Visual element may be smaller; hit area never is |
| Safe areas | `safe-top`, `safe-bottom`, `safe-leading/trailing` | Notches, home indicator, gesture bars — tokens, not literals |
| Type | system text styles (iOS `body`/`headline`/…; Material `labelLarge`…) with brand family overrides | Ramp scales with the user's text-size setting — see Typography |
| Color | same semantic slots as web (`color-primary`…) | Dark mode = semantic layer swap, driven by the *system* setting |
| Elevation | Material elevation levels on Android; on iOS express hierarchy with layers/blur/overlap, not shadows | The two platforms mean different things by "depth" |

## Color (Step 4)

- **Dark mode is system-wide and non-negotiable.** Same strategy as web dark mode (semantic token swap), but the trigger is the OS setting and both variants ship from day one.
- **Platform dynamic color:** decide explicitly whether the brand opts into it — iOS tint color + asset-catalog dark variants; Android Material You (user wallpaper-derived palettes). Opting in dilutes brand recognition but earns the user's phone feels like *their* phone; record the choice.
- **Contrast:** WCAG 2.2 ratios apply (4.5:1 / 3:1), checked in **both** light and dark, including text over photos/blur.
- Never color alone: state changes carry an icon, glyph, or text (error = icon + label, not just red).

## Typography (Step 5)

- **Text scales with the user's setting** — Dynamic Type (iOS) / font-scale with sp (Android). Fixed-size body text is a defect, not a choice. Layout must survive the largest standard setting (headers may cap; body never truncates by design).
- **Custom fonts** are a real decision: bundle size, license, and a metric-compatible fallback for missing glyphs; on iOS prefer overriding the *system text styles* with your family rather than building a parallel ramp. Minimum readable body size follows platform defaults (11pt iOS small print floors, 16sp Android body).
- **Never design to exact strings.** Truncation and wrapping are designed states: define line-clamp rules per component, and remember localization expansion (German +30%) — the Step 6 rule matters more on mobile than on web.

## Navigation & Layout (Steps 7a/7c)

- **Navigation architecture** is the mobile layout decision (the analogue of web's layout architecture): bottom tab bar (≤5 destinations), stack navigation with system back, sheets/modals for focused tasks, drawer for rare destinations. Pick the primary pattern per the product's shape and record it as a UXD decision.
- **Thumb zone as principle, not diagram:** primary actions live in the bottom-reachable band; destructive/confirming actions avoid the top corners. (Hoober's research popularized this; he later corrected his own reachability map — apply the principle, test on real devices.)
- **One-handed operation:** the primary flow is completable without a second hand or stretch gestures.
- **Tablets/foldables:** navigation adapts (bottom bar → rail/side panel); lists+detail become two-pane. Adaptive ≠ stretched phone UI.
- No hover exists; "menu bars" and other pointer idioms are porting tells.

## Interaction & Motion (Step 7a)

- **States:** default / pressed / focused (a11y focus is separate from touch) / disabled / loading / error / success. Long-press and drag are *additional* gestures, and every gesture needs a non-gestural alternative (WCAG 2.5.7/2.5.8 territory — dragging movements and target sizes).
- **Motion:** prefer platform conventions — iOS standard transitions and spring physics, Material easing/motion — unless the tonal direction demands custom; custom motion is where mobile brands most often overreach. Honor the OS **Reduce Motion / Remove Animations** settings: replace spatial/decorative motion with crossfades, keep functional transitions.
- **Haptics** are part of the design system if used: a small, named set (selection, success, warning) — never decorative-only, never for errors alone without visual info.

## Accessibility

Anchor: **W3C "Guidance on Applying WCAG 2.2 to Mobile Applications"** (w3.org/TR/wcag2mobile-22) — the normative mobile dialect. The essentials:

- Every control has a programmatic label: `accessibilityLabel` (iOS) / `contentDescription` (Android); traits/roles match function (is it a button? say so).
- VoiceOver (iOS) / TalkBack (Android) traversal order matches visual/logical order; custom gestures have screen-reader-equivalent actions.
- Dynamic Type survives (see Typography); contrast in both modes; target sizes meet the 44pt/48dp floor.
- Custom components (canvas, charts, maps) need text alternatives — the same "describe the information, not the medium" rule as web alt text.

See `checklists/accessibility.md` → "Mobile Dialect" for the checklist form.

## App-Specific Patterns (Step 7a)

- **Loading/offline:** skeletons or system progress (not both); pull-to-refresh where lists are primary; offline is a designed state (cached content + status), never a blank screen.
- **Permissions:** ask in context, explain the value *before* the system prompt; one permission at a time; design the "denied" path as a first-class flow.
- **Onboarding/first run:** value-permission-request-order; a carousel of padding slides is the canonical mobile slop (see checklist).
- **Keyboard:** fields scroll into view; the form survives keyboard show/hide without layout jumps.
- **Notifications:** an explicit, honest ask, tied to real value — never the launch-time prompt.

## Writing (Step 6)

Step 6 transfers intact. Mobile additions: brevity defaults (labels ≤ 3 words where structure carries meaning); truncation rules per component (see Typography); system-dialog phrasing stays platform-native; localized strings planned from day one.

## Slop tells specific to mobile

The general slop checklist applies; the authoritative mobile shape list lives in `checklists/design-slop.md` → Group B ("Mobile shapes") — this section mirrors it for design-time guidance:

- Onboarding carousel of 3–5 padding slides before any value
- Splash screens that linger; logo animations on every launch
- Hamburger menu for ≤5 destinations (a tab bar was right there)
- Bottom navigation with 6+ items, or "More" tabs
- Dead settings toggles and placeholder rows in shipped settings screens
- In-app "5-star rating" prompts interrupting the first session
- The same pixel-identical skin on iOS and Android (the cross-platform tell) with no adaptation decision recorded
- Web-ported idioms: hover tooltips, tiny text links, pointer-precision targets

## Comparison & Preview Artifacts (Steps 5, 7b, 7d, 8b)

All comparison/preview artifacts remain self-contained HTML, rendered as **phone-frame mocks** that double as implementation references for the building agent:

- Phone frame at the **smallest supported width**, annotated in dp/pt (not px), with safe-area regions marked
- Every color/spacing value labeled with its **token name** alongside the value
- Light and dark variants side by side (dark is not optional in comparisons)
- System states shown: keyboard raised over the form, largest Dynamic Type on the key screen
- When platform postures diverge (e.g., iOS sheet vs Android bottom-sheet), render both columns rather than averaging them

## Sources

- Apple Human Interface Guidelines — developer.apple.com/design/human-interface-guidelines (Foundations / Patterns / Components)
- Material 3 — m3.material.io (Foundations incl. Design Tokens; Styles; M3-in-Compose on developer.android.com)
- Flutter adaptive & responsive guidance — docs.flutter.dev/ui/adaptive-responsive (+ platform adaptations)
- React Native platform-specific code — reactnative.dev/docs/platform-specific-code
- W3C, "Applying WCAG 2.2 to Mobile Applications" — w3.org/TR/wcag2mobile-22; WAI mobile overview — w3.org/WAI/standards-guidelines/mobile
- Hoober, "How Do Users Really Hold Mobile Devices?" + "Design for Fingers and Thumbs Instead of Touch" (UXmatters 2013) — principles only; author later corrected his own reachability map
