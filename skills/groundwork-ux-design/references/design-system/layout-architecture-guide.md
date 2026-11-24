# Layout Architecture Pattern Library

Reference guide for spatial layout decisions in design systems — the decision layer of the pattern library, read when choosing a layout strategy. Each pattern covers what it is, when to use it, its key technique, accessibility considerations, combination warnings, and complexity classification.

**Complexity tiers:**
- **CSS-only** — no JavaScript required, works with pure CSS
- **JS-light** — minimal JS (IntersectionObserver, scroll listener with rAF)
- **JS-heavy** — requires scroll library (GSAP ScrollTrigger, Lenis) or custom controller

**Pattern selection:** one row per pattern; the number is the heading of its full entry.

| Pattern | What it does | Complexity |
|---------|--------------|------------|
| 1.1 Variable Container Widths | Sections alternate narrow, default, wide, and full-bleed container widths | CSS-only |
| 1.2 Negative-Margin Overlap | Elements from adjacent sections visually overlap to suggest depth | CSS-only |
| 1.3 Diagonal Section Breaks | Sections meet at angled boundaries instead of horizontal lines | CSS-only |
| 1.4 Asymmetric Splits | Content areas use unequal column ratios like 60/40 or 70/30 | CSS-only |
| 1.5 Rounded Section Stacking | Large-radius sections stack with visible overlap, like layered cards | CSS-only / JS-light |
| 2.1 Scroll-Scrubbed Animation | Animation progress is tied directly to scroll position | JS-heavy |
| 2.2 Fixed-Position Parallax | Background layers scroll at a different rate than foreground | CSS-only / JS-light |
| 2.3 Pin-and-Reveal | A section pins in the viewport while content reveals within | JS-heavy |
| 2.4 Sticky Card Cascade | Cards stack on staggered sticky positions as you scroll | CSS-only / JS-light |
| 2.5 Horizontal Scroll Conversion | Vertical scrolling drives horizontal movement within one section | JS-heavy |
| 3.1 Migratory Navigation | Nav changes position, shape, or content as sections scroll past | JS-light |
| 3.2 Dual-Layer Contextual Navigation | Fixed global nav plus a sticky section-specific contextual nav | JS-light |
| 3.3 Content-Push Menu | Opening the menu pushes page content aside, not under it | CSS-only / JS-light |
| 3.4 Marquee Navigation | Nav items scroll horizontally in a continuous ticker | CSS-only |
| 3.5 Embedded Hero Navigation | Nav sits inside the hero, becoming fixed once scrolled past | JS-light |
| 3.6 Navigation by Absence | No persistent nav; the page itself is the navigation | CSS-only |
| 4.1 Text-Split Reveals | Headlines split into characters or words that animate in | JS-light |
| 4.2 Three-Tier Animation System | Elements cascade on entry in three timed tiers | JS-light |
| 4.3 Cover-Wipe Reveal | A colored overlay slides away to reveal content beneath | CSS-only |
| 4.4 Dark-to-Light Emotional Arc | Page color scheme shifts from dark to light while scrolling | JS-light |
| 4.5 Kinetic Gallery | An image grid responds to cursor movement with subtle shifts | JS-light |
| 5.1 Image-First Layout | Images dominate the viewport; text plays a supporting role | CSS-only |
| 5.2 Data-Table as Primary UI | Main content is a scannable table or list, not cards | CSS-only |
| 5.3 Same-Component Scale Variation | One component type appears at different scales to signal importance | CSS-only |
| 5.4 Drawer-as-Section | Major sections expand as drawers, hiding detail until requested | CSS-only |
| 5.5 Density Contrast | Page alternates information-dense sections with sparse, breathing ones | CSS-only |
| 6.1 Single-Formula Fluid System | All spacing, sizing, and type derive from one ratio formula | CSS-only |
| 6.2 Fluid Spacing Without Breakpoints | Spacing and type use clamp() instead of spacing breakpoints | CSS-only |
| 6.3 Gradient Dividers | Section dividers blend through gradients instead of hard lines | CSS-only |
| 6.4 Mix-Blend-Mode Layering | Overlapping elements interact visually through CSS blend modes | CSS-only / JS-light |
| 6.5 Scale-Transform Breathing | Elements subtly scale and fade in response to scroll position | JS-light |
| 7.1 Viewport-Dominant Display Type | Display text scales to fill much of the viewport width | CSS-only / JS-light |
| 7.2 Inverse Responsive Scaling | Display text gets proportionally larger on small screens | CSS-only |
| 7.3 Decorated Inline Words | Individual words get highlight, underline, color, or serif treatment | CSS-only |
| 7.4 Knockout / Mask Text | Text masks the image, gradient, or video behind it | CSS-only |
| 7.5 Font-Switching as Semantic Signal | Different typefaces signal editorial, technical, UI, or display content | CSS-only |

The CSS/JS implementation of every pattern is in `layout-techniques.md` under the same section number as its heading here.

---

## Quick Reference: Pattern Compatibility Matrix

| Pattern | Best With | Avoid With |
|---------|-----------|------------|
| Variable Container Widths | Density Contrast, Dark-to-Light Arc | Single-Formula (if uniform) |
| Negative-Margin Overlap | Asymmetric Splits, Blend Modes | Rounded Stacking, Sticky Cards |
| Diagonal Breaks | Parallax, Gradient Dividers | Rounded Stacking |
| Rounded Stacking | Sticky Cards, Scale Breathing | Diagonal Breaks |
| Scroll-Scrubbed | Pin-and-Reveal, Dark-to-Light | Anti-Animation, Horizontal Scroll |
| Fixed Parallax | Diagonal Breaks, Gradient Dividers | Scroll-Scrubbed (same section) |
| Pin-and-Reveal | Scroll-Scrubbed, Dark-to-Light | Sticky Cards |
| Sticky Cards | Rounded Stacking, Scale Breathing | Pin-and-Reveal |
| Migratory Nav | Scroll Narrative, Choreography | Dual-Layer Nav, Absence |
| Marquee Nav | Blend Modes, Text Splits | All other nav patterns |
| Text-Split Reveals | Three-Tier Animation, Wipe Reveal | Heavy scroll animation |
| Dark-to-Light Arc | Scroll-Scrubbed, Pin-and-Reveal | Single-theme products |
| Image-First | Asymmetric Splits, Variable Widths | Data-Table UI |
| Data-Table UI | Density Contrast, Absence Nav | Image-First, Blend Modes |
| Viewport Display Type | Inverse Scaling, Decorated Words | Image-First (same section) |

---

## 1. Section Geometry

Patterns controlling how page sections relate to each other spatially.

### 1.1 Variable Container Widths

**One-line:** Sections alternate between constrained and full-bleed widths to create visual rhythm.

**When to use:** Editorial sites, marketing pages, portfolios — anywhere content density varies between sections. Especially effective when mixing text-heavy and media-heavy sections.

**Technique:** Each section sets a `--container` custom property (48rem narrow, 72rem default, 90rem wide) that `max-width` consumes; a `--full` modifier drops the cap and the inline padding. Consistent `margin-block-start` between sections (`clamp(4rem, 8vw, 8rem)`) keeps the width changes reading as intentional rhythm. Implementation: `layout-techniques.md` § 1.1.

**Accessibility:** No concerns — purely visual rhythm. Ensure text sections maintain comfortable line length (45-75ch) even in wider containers.

**Combinations:** Reinforces **Density Contrast** and **Dark-to-Light Emotional Arc**. Pairs well with **Diagonal Section Breaks** for dramatic transitions. Avoid combining with **Single-Formula Fluid System** if that system enforces uniform width.

**Complexity:** CSS-only

---

### 1.2 Negative-Margin Overlap

**One-line:** Elements from adjacent sections visually overlap, breaking the stacked-boxes default.

**When to use:** Portfolio sites, creative agencies, editorial layouts — when you want to suggest depth and intentional composition. Effective for image/text overlap at section boundaries.

**Technique:** A negative `margin-block-end` pulls media into the next section, or `transform: translateY()` pushes a card across its parent section's boundary; `position: relative` with `z-index` keeps the overlapping element on top, and compensating `padding-block-start` on the section below reserves room for it. Implementation: `layout-techniques.md` § 1.2.

**Accessibility:** Ensure overlapping elements don't obscure interactive content. Tab order must remain logical despite visual overlap. Test with 200% zoom — overlaps may collide at large text sizes.

**Combinations:** Works well with **Asymmetric Splits** and **Mix-Blend-Mode Layering**. Conflicts with **Rounded Section Stacking** (competing depth metaphors). Avoid with **Sticky Card Cascade** in the same viewport.

**Complexity:** CSS-only

---

### 1.3 Diagonal Section Breaks

**One-line:** Sections meet at angled boundaries instead of horizontal lines, creating forward momentum.

**When to use:** SaaS marketing pages, fintech landing pages — when the product narrative has clear progression. Stripe-style energy. Avoid on content-heavy or documentation sites.

**Technique:** Two interchangeable methods: `clip-path: polygon()` on the section itself, or `::before`/`::after` pseudo-elements with `background: inherit` and `transform: skewY(-2deg)` extending past its top and bottom edges. Implementation: `layout-techniques.md` § 1.3.

**Accessibility:** No direct impact. Ensure text within clipped regions isn't cut off at extreme viewport widths. Test with browser zoom.

**Combinations:** Core to **Layered Depth** bundle. Pairs naturally with **Fixed-Position Parallax** and **Gradient Dividers**. Conflicts with **Rounded Section Stacking** (mixing curves and angles feels inconsistent).

**Complexity:** CSS-only

---

### 1.4 Asymmetric Splits

**One-line:** Content areas use unequal column ratios (60/40, 70/30) rather than symmetric halves.

**When to use:** Product pages pairing hero imagery with supporting text, SaaS feature sections, case studies. Creates natural visual hierarchy within a section.

**Technique:** A CSS grid whose `grid-template-columns` sets the ratio (`3fr 2fr` for 60/40, `7fr 3fr` for 70/30, `1.618fr 1fr` for golden). Alternating sections are mirrored with `direction: rtl` on the container (reset to `ltr` on its children), and the split stacks to one column at 48rem and below. Implementation: `layout-techniques.md` § 1.4.

**Accessibility:** Ensure reading order matches DOM order, not visual order. When flipping layout with `direction: rtl`, verify screen reader order is still logical. Content in narrower column must remain readable.

**Combinations:** Strengthens **Variable Container Widths** and **Image-First Layout**. Works with **Negative-Margin Overlap** for overlapping split elements. Neutral with most scroll patterns.

**Complexity:** CSS-only

---

### 1.5 Rounded Section Stacking

**One-line:** Sections have large border-radii and stack with visible overlap like layered cards.

**When to use:** Friendly, approachable products — wellness apps, community platforms, consumer SaaS. Huddle/Notion style. Avoid for corporate fintech or utility-first products.

**Technique:** Each section gets a large top `border-radius`, a negative `margin-block-start` so it overlaps the previous one, and a per-section `z-index` custom property so later sections sit on top. A `--sticky` variant adds `position: sticky; top: 0` so sections peel up to reveal the next. Implementation: `layout-techniques.md` § 1.5.

**Accessibility:** Ensure content isn't hidden behind overlapping sections. Sticky stacking requires careful z-index management so focused elements remain visible. Test keyboard navigation through stacked sections.

**Combinations:** Core to **Sticky Card Stack** bundle. Pairs with **Scale-Transform Breathing** for depth effect. Conflicts with **Diagonal Section Breaks** (competing section boundary metaphors).

**Complexity:** CSS-only (static) / JS-light (sticky variant with IntersectionObserver)

---

## 2. Scroll Architecture

Patterns defining what happens as the user scrolls through the page.

### 2.1 Scroll-Scrubbed Animation

**One-line:** Animation progress is directly tied to scroll position — user controls the timeline by scrolling.

**When to use:** Product narratives, storytelling landing pages, device showcases (Apple-style). When the content has a sequential reveal that benefits from user-paced exploration.

**Canonical reference:** Apple product pages — device rotation tied to scroll position, pinned over 300vh of scroll room.

**Technique:** Either the CSS-native Scroll-driven Animations API (`animation-timeline: view()` with `animation-range`) or GSAP ScrollTrigger with `scrub` and `pin` binding a tween to scroll progress. Implementation: `layout-techniques.md` § 2.1.

**Accessibility:** **Critical** — wrap all scroll-scrubbed animation in `@media (prefers-reduced-motion: no-preference)`. Fallback: show final state immediately with simple fade-in. Content must be readable without scrolling through the animation.

**Combinations:** Core to **Cinematic Scroll Narrative** bundle. Pairs with **Pin-and-Reveal** and **Dark-to-Light Emotional Arc**. Conflicts with **Anti-Animation** philosophy. Heavy when combined with **Horizontal Scroll Conversion**.

**Complexity:** JS-heavy (GSAP ScrollTrigger or equivalent; CSS scroll-driven animations have limited browser support)

---

### 2.2 Fixed-Position Parallax

**One-line:** Background layers scroll at different rates than foreground content, creating depth.

**When to use:** Hero sections, marketing pages with strong imagery, portfolio headers. Effective for a single hero section; avoid applying to every section (causes fatigue).

**Canonical reference:** subtle gradient or particle-node motion behind an otherwise still hero. Stripe's hero-gradient parallax is the quietest production-grade version.

**Technique:** Pure CSS: a scroll container with `perspective: 1px`, a background layer at `translateZ(-2px)` (scaled up to hide gaps), and foreground at `translateZ(0)`. For more control, a `scroll` listener throttled with `requestAnimationFrame` translates the background by a fraction of `window.scrollY`. Implementation: `layout-techniques.md` § 2.2.

**Accessibility:** Disable for `prefers-reduced-motion: reduce` — show static positioned background instead. Pure CSS parallax can cause nausea in motion-sensitive users; always provide fallback.

**Combinations:** Core to **Layered Depth** bundle. Pairs with **Diagonal Section Breaks** and **Gradient Dividers**. Avoid combining with **Scroll-Scrubbed Animation** on the same section (competing scroll behaviors). One parallax section per page is usually enough.

**Complexity:** CSS-only (perspective method) / JS-light (rAF method)

---

### 2.3 Pin-and-Reveal

**One-line:** A section pins in the viewport while content reveals or transforms within it, then releases.

**When to use:** Feature walkthroughs, step-by-step product explanations, comparison sections. When you have 3-5 items that benefit from sequential attention in the same visual context.

**Canonical reference:** Apple product pages — camera/display feature panels reveal over a pinned hero across 3× viewport scroll range.

**Technique:** GSAP ScrollTrigger pins the section (`pin: true`) while a tween slides its panels horizontally by `xPercent`, scrubbed to scroll with `snap` points. The CSS lays the panels out as full-viewport slides in a non-wrapping flex row; under `prefers-reduced-motion: reduce` they wrap into a vertical stack with no pinning. Implementation: `layout-techniques.md` § 2.3.

**Accessibility:** **Critical** — pinned sections trap scroll in a way that can disorient. Provide clear progress indicators (dots, step counter). Reduced motion fallback must show all content in normal document flow. Ensure keyboard users can navigate between pinned panels.

**Combinations:** Core to **Cinematic Scroll Narrative** bundle. Pairs naturally with **Scroll-Scrubbed Animation** and **Dark-to-Light Emotional Arc**. Conflicts with **Sticky Card Cascade** (competing pin behaviors).

**Complexity:** JS-heavy

---

### 2.4 Sticky Card Cascade

**One-line:** Cards stack on top of each other as user scrolls, each catching on a sticky position before the next overlaps.

**When to use:** Pricing tiers, feature comparisons, portfolio pieces, testimonials. When items are peers but benefit from focused sequential reading. Huddle-style.

**Canonical reference:** Notion's bento feature cards stacking on scroll — each card sits at increasing top-offset, previous cards scale down slightly as they're covered.

**Technique:** Each card is `position: sticky` at a `top` offset that increases per card (`--card-offset`: 2rem, 4rem, 6rem) inside a container with extra bottom padding for scroll room. An optional IntersectionObserver scales the previous card down to `scale(0.95)` as the next one covers it. Implementation: `layout-techniques.md` § 2.4.

**Accessibility:** Cards must remain keyboard-navigable. Content on cards below the stack must be reachable via tab. Reduced motion: disable sticky behavior, show as vertical card list.

**Combinations:** Core to **Sticky Card Stack** bundle. Pairs with **Rounded Section Stacking**. Conflicts with **Pin-and-Reveal** (competing sticky behaviors — never use both on the same page).

**Complexity:** CSS-only (basic) / JS-light (with scale animation)

---

### 2.5 Horizontal Scroll Conversion

**One-line:** Vertical scrolling is converted to horizontal movement within a section.

**When to use:** Galleries, portfolios, timelines, case study showcases. When items have a natural left-to-right sequence. Use sparingly — one section per page maximum.

**Canonical reference:** Stripe's customer carousels — scroll-converted horizontal flow with snap points, one panel per viewport width.

**Technique:** GSAP ScrollTrigger pins the section and translates a non-wrapping flex row of full-viewport-width panels (`xPercent`) as the user scrolls vertically, with scroll snapping. Under `prefers-reduced-motion: reduce` the row falls back to native `overflow-x: auto` with `scroll-snap-type`. Implementation: `layout-techniques.md` § 2.5.

**Accessibility:** **Critical** — horizontal scroll conversion breaks expected scroll behavior. Must show clear visual affordance (progress bar, arrows). Reduced motion fallback: native horizontal scroll with `scroll-snap-type`. Keyboard: arrow keys must navigate panels.

**Combinations:** Works in **Cinematic Scroll Narrative** and **Choreographed Studio** bundles. Conflicts with other pinned sections — only one scroll-hijacking section per page. Avoid with **Sticky Card Cascade**.

**Complexity:** JS-heavy

---

## 3. Navigation Innovation

Patterns for navigation behavior beyond standard sticky headers.

### 3.1 Migratory Navigation

**One-line:** Nav transforms its position, shape, or content as the user scrolls past different page sections.

**When to use:** Long single-page sites, product showcases, editorial features. When different sections have different navigation needs (hero CTA vs. section TOC vs. sticky mini-nav).

**Technique:** Each page section declares a `data-nav-mode`; an IntersectionObserver copies it to a `data-mode` attribute on the nav, and per-mode CSS rules reposition and reshape the nav (floating pill in the hero, full-width glass bar over content, collapsed circle in minimal mode), eased by `transition: all`. Implementation: `layout-techniques.md` § 3.1.

**Accessibility:** Nav must remain keyboard-accessible in every mode. `aria-label` should update to describe current nav state. Ensure focus indicators are visible in all nav positions. Reduced motion: instant mode switches, no positional animation.

**Combinations:** Works in **Cinematic Scroll Narrative** and **Choreographed Studio** bundles. Conflicts with **Dual-Layer Contextual Nav** (too many nav behaviors at once). Avoid with **Navigation by Absence**.

**Complexity:** JS-light

---

### 3.2 Dual-Layer Contextual Navigation

**One-line:** Two independent navigation layers — global persistent nav plus section-specific contextual nav.

**When to use:** Large marketing sites, documentation, multi-product pages. When global nav (logo, main links) must persist while section-specific tools change (Stripe-style product nav).

**Technique:** A `position: fixed` global nav (`z-index: 100`) sits above a `position: sticky` contextual nav offset by the global bar's height (`top: 3.5rem`). An IntersectionObserver toggles `aria-hidden` on the contextual nav, and a CSS rule hides it through opacity, `translateY(-100%)`, and `pointer-events: none`. Implementation: `layout-techniques.md` § 3.2.

**Accessibility:** Both layers must be navigable via keyboard. Use `aria-hidden` to remove contextual nav from tab order when not visible. Ensure screen readers announce layer transitions.

**Combinations:** Core to **Layered Depth** bundle. Pairs with **Variable Container Widths**. Conflicts with **Migratory Navigation** and **Embedded Hero Navigation** (too many nav paradigms).

**Complexity:** JS-light

---

### 3.3 Content-Push Menu

**One-line:** Opening the menu pushes page content aside rather than overlaying it.

**When to use:** Sites where maintaining context during navigation is important — e-commerce, portfolios with preview, complex dashboards. Shows menu and content simultaneously.

**Technique:** An `.menu-open` state class translates the fixed off-canvas menu in (`translateX(0)`) and shifts the page wrapper aside by the same distance (`translateX(min(24rem, 80vw))`), optionally scaling the wrapper to `0.95` for depth. Implementation: `layout-techniques.md` § 3.3.

**Accessibility:** Menu must trap focus when open. Escape key closes menu. `aria-expanded` on trigger. Page content behind push should have `aria-hidden="true"` and `inert` when menu is open. Reduced motion: instant show/hide without transform.

**Combinations:** Works in **Choreographed Studio** bundle. Conflicts with **Dual-Layer Contextual Nav** (menu push would shift both layers awkwardly). Pairs with **Mix-Blend-Mode Layering** for visual effect on push.

**Complexity:** CSS-only (with checkbox hack) / JS-light (for focus trapping)

---

### 3.4 Marquee Navigation

**One-line:** Navigation items scroll horizontally in a continuous marquee/ticker, clicked to navigate.

**When to use:** Creative portfolios, studio sites, experimental design. When navigation itself is a design statement. Lorenzo Dal Dosso style. Not for utility-focused or content-heavy sites.

**Technique:** An overflow-hidden container holds an `inline-flex` track animated by a `@keyframes marquee` rule (`translateX(0)` to `translateX(-50%)`) at `20s linear infinite`; hovering pauses it via `animation-play-state: paused`. Implementation: `layout-techniques.md` § 3.4.

**Accessibility:** **Critical** — continuous motion must respect `prefers-reduced-motion` (show static list). Must be keyboard-navigable — pressing Tab should pause marquee and move through items sequentially. Each item needs visible focus indicator. Provide `aria-label="Navigation"` on container.

**Combinations:** Core to **Choreographed Studio** bundle. Conflicts with all other nav patterns — marquee nav is an all-or-nothing statement. Only combine with a minimal secondary nav (hamburger for mobile).

**Complexity:** CSS-only

---

### 3.5 Embedded Hero Navigation

**One-line:** Navigation is integrated into the hero section rather than floating above it, becoming part of the composition.

**When to use:** Portfolio homepages, splash pages, immersive product launches. When the hero IS the first interaction and the nav should feel like part of the content, not separate chrome.

**Technique:** The nav is `position: absolute; inset: 0` over the hero, laid out as a three-column grid (`1fr auto 1fr`) with the logo at the start and links at the end. An IntersectionObserver adds a `--scrolled` class once the hero leaves the viewport, switching the nav to `position: fixed` with a glass background. Implementation: `layout-techniques.md` § 3.5.

**Accessibility:** Ensure nav links have sufficient contrast against the hero background in both embedded and scrolled states. Use glass/blur effect with solid color fallback for browsers without backdrop-filter.

**Combinations:** Core to **Sticky Card Stack** bundle. Pairs with **Fixed-Position Parallax** hero. Conflicts with **Marquee Navigation** and **Migratory Navigation** (competing hero-area nav strategies).

**Complexity:** JS-light

---

### 3.6 Navigation by Absence

**One-line:** No persistent navigation — the page itself is the navigation, with minimal entry/exit points.

**When to use:** Single-purpose landing pages, immersive art/portfolio pieces, experimental sites with few destinations. Teenage Engineering product pages. Absolutely not for apps, e-commerce, or content-heavy sites.

**Canonical reference:** AI-lab marketing surfaces — spare top bar, no persistent mega-menu, nav often just logo + auth. The extreme version is logo + one menu trigger.

**Technique:** Only a fixed logo and a menu trigger sit in the corners, both using `mix-blend-mode: difference` so they stay visible over any background. A full-screen overlay nav (`position: fixed; inset: 0`) is held at `opacity: 0` with `pointer-events: none` until an `--open` class fades it in. Implementation: `layout-techniques.md` § 3.6.

**Accessibility:** Must provide a discoverable way to reach all pages (the menu trigger). The trigger must have an `aria-label` ("Open navigation"). Consider a skip-to-content link that also reveals navigation for keyboard users.

**Combinations:** Core to **Industrial Precision** bundle. Pairs with **Anti-Animation**. Conflicts with every other nav pattern by definition. Only works with minimal site structure (< 8 destinations).

**Complexity:** CSS-only

---

## 4. Content Choreography

Patterns for how content appears, transitions, and sequences.

### 4.1 Text-Split Reveals

**One-line:** Headlines split into individual characters or words that animate independently on entry.

**When to use:** Hero sections, section transitions, portfolio headers. When typography is a primary design element. Balky Studio, Lorenzo Dal Dosso style.

**Technique:** A JS `splitText()` wraps each character in a `<span class="char">` carrying its index as `--i`, and restores the original string as the element's `aria-label`. CSS transitions each span from `translateY(100%)` to `0` with a `calc(var(--i) * 30ms)` stagger once an IntersectionObserver adds a `revealed` class. Implementation: `layout-techniques.md` § 4.1.

**Accessibility:** **Critical** — split text must preserve `aria-label` with the full original text. Individual `<span>` elements should have `aria-hidden="true"` so screen readers read the label, not individual characters. Reduced motion: show all text immediately.

**Combinations:** Core to **Choreographed Studio** bundle. Pairs with **Three-Tier Animation System** (text splits as tier 1). Conflicts with heavy scroll animation — don't split text AND scrub it.

**Complexity:** JS-light

---

### 4.2 Three-Tier Animation System

**One-line:** Page elements are classified into three timing groups that cascade on entry — headlines first, then body, then supporting elements.

**When to use:** Any section with mixed content (heading + text + images + UI elements). Creates ordered reveal that guides the eye. Linear, Wispr Flow style.

**Technique:** Elements opt in with `data-animate="tier-1"`, `"tier-2"`, or `"tier-3"`; CSS gives each tier its `transition-delay` (0s, 0.15s, 0.3s) and duration (0.6s, 0.5s, 0.4s) on an opacity + `translateY(1.5rem)` entrance, and an IntersectionObserver adds an `in-view` class to trigger it. Implementation: `layout-techniques.md` § 4.2.

**Accessibility:** Reduced motion fallback shows all content immediately. Animation distances are subtle (1.5rem) — avoid large translate values that cause content reflow.

**Combinations:** Universal — works with nearly every bundle. Core to **Cinematic Scroll Narrative** and **Layered Depth**. Pairs with **Text-Split Reveals** (split replaces tier-1 default). Conflicts with **Anti-Animation**.

**Complexity:** JS-light (IntersectionObserver only)

---

### 4.3 Cover-Wipe Reveal

**One-line:** A colored overlay slides away to reveal content underneath, like pulling back a curtain.

**When to use:** Image reveals in portfolios, section transitions in editorial layouts, loading state exits. When you want a moment of anticipation before the reveal.

**Technique:** An `::after` pseudo-element in the accent color covers the content at `scaleX(1)`; a `revealed` class collapses it to `scaleX(0)` from the opposite `transform-origin` while the content fades in on a delayed opacity transition. Implementation: `layout-techniques.md` § 4.3.

**Accessibility:** Reduced motion: skip the wipe, show content immediately. Wipe color must meet contrast requirements against surrounding content in case it freezes mid-animation.

**Combinations:** Core to **Choreographed Studio** bundle. Pairs with **Text-Split Reveals** (wipe reveals image, then text splits). Conflicts with **Three-Tier Animation System** on the same element (choose one entrance method).

**Complexity:** CSS-only

---

### 4.4 Dark-to-Light Emotional Arc

**One-line:** Page transitions from dark color scheme to light (or vice versa) as user scrolls, creating emotional progression.

**When to use:** Product narratives (problem→solution), storytelling, brand pages that move from dramatic to inviting. Apple Vision Pro, Wispr Flow style.

**Technique:** Start and end colors are root custom properties; an IntersectionObserver sets each section's `--section-bg` and `--section-text` to a `color-mix(in oklch, …)` blend weighted by the section's index, and a `transition` on `background` and `color` animates the shift. Implementation: `layout-techniques.md` § 4.4.

**Accessibility:** Ensure contrast ratios meet WCAG AA at every interpolation point, not just endpoints. Mid-range gray-on-gray is the danger zone — test at 50% progress. Reduced motion: still apply color changes, just remove transition timing.

**Combinations:** Core to **Cinematic Scroll Narrative** bundle. Pairs with **Scroll-Scrubbed Animation** and **Pin-and-Reveal**. Conflicts with single-theme products where brand consistency requires uniform color. Avoid with **Density Contrast** (too many simultaneous shifts).

**Complexity:** JS-light

---

### 4.5 Kinetic Gallery

**One-line:** Images in a grid respond to cursor movement or scroll with subtle parallax, rotation, or scale shifts.

**When to use:** Portfolios, creative agency sites, e-commerce product showcases. When images are the primary content and should feel alive. Jacky Winter Gallery, Pixel Poetry style.

**Canonical reference:** Pinterest — masonry grid with infinite scroll + hover lift. Template galleries on visual-builder tools follow the same shape with lighter motion.

**Technique:** A `mousemove` listener on the gallery maps the cursor to normalized coordinates and gives each item a small `translate`/`rotate` scaled by its `data-depth`. CSS lays the items out in an `auto-fit` grid with a `transform` transition, and disables the effect under `(hover: none)` and `prefers-reduced-motion`. Implementation: `layout-techniques.md` § 4.5.

**Accessibility:** Disable cursor-tracking on touch devices (`@media (hover: none)`). Respect `prefers-reduced-motion`. Movement must be subtle (< 20px, < 3deg) to avoid disorientation. Images must have alt text regardless of animation.

**Combinations:** Works in **Choreographed Studio** bundle. Pairs with **Mix-Blend-Mode Layering** for visual depth. Conflicts with **Scroll-Scrubbed Animation** on the same elements (competing transforms). Avoid with **Anti-Animation**.

**Complexity:** JS-light

---

## 5. Content Hierarchy

Patterns for what dominates visually and how content is organized.

### 5.1 Image-First Layout

**One-line:** Images occupy the primary visual space (60-80% of viewport), with text as supporting element.

**When to use:** Portfolios, product showcases, photography sites, travel/lifestyle. When visual content IS the value proposition. Jacky Winter Gallery, Apple style.

**Technique:** A single-column grid where the media fills the row at a fixed `aspect-ratio` with `object-fit: cover`, and the caption is capped at `48ch`. A `--hero` variant places the image `position: absolute` behind the section (`height: 90vh`) and anchors white, text-shadowed content to the bottom. Implementation: `layout-techniques.md` § 5.1.

**Accessibility:** All images must have descriptive alt text — in image-first layouts, the image is the content, not decoration. Ensure text overlaid on images has sufficient contrast (use gradient overlay or text-shadow). Provide text alternative paths for users who can't see images.

**Combinations:** Pairs naturally with **Asymmetric Splits** and **Variable Container Widths**. Works in **Cinematic Scroll Narrative** and **Choreographed Studio** bundles. Conflicts with **Data-Table as Primary UI** (opposite hierarchy philosophies).

**Complexity:** CSS-only

---

### 5.2 Data-Table as Primary UI

**One-line:** The main page content is organized as a scannable table/list rather than cards or hero sections.

**When to use:** Directories, job boards, search results, dashboards, tool indexes. When users need to scan and compare many items efficiently. The Index style.

**The common thread:** when the product's core interface screenshot *is* a data table, marketing pages should mirror that shape rather than hide it behind card abstractions. Linear's issue list and Airtable's grid are the clearest versions of "table as product, not artifact".

**Technique:** A full-width collapsing table whose header row is `position: sticky` just under the nav (`top: 3.5rem`) and styled as small uppercase text; rows get a 1px bottom border and a background hover state, with primary cells at `font-weight: 500` and secondary cells in muted small text. Implementation: `layout-techniques.md` § 5.2.

**Accessibility:** Use semantic `<table>`, `<thead>`, `<th scope="col">`. Sortable columns need `aria-sort`. Clickable rows need keyboard activation (`role="link"` or nested `<a>`). Ensure sufficient row height for touch targets (44px minimum).

**Combinations:** Core to **Content-First Directory** bundle. Pairs with **Density Contrast** and **Navigation by Absence** (content IS the interface). Conflicts with **Image-First Layout**, **Kinetic Gallery**, and most scroll animation patterns.

**Complexity:** CSS-only

---

### 5.3 Same-Component Scale Variation

**One-line:** The same component type (card, image, tile) appears at dramatically different scales to signal importance.

**When to use:** Portfolios (featured vs. standard work), e-commerce (hero product vs. grid), blogs (featured vs. list). When items are the same type but not equal in importance.

**Technique:** A 12-column grid where modifier classes set each tier's `grid-column` span and `aspect-ratio` (hero 8 columns and 2 rows, featured 6, standard 4, compact 3), re-spanned to 12 or 6 columns at 48rem and below. Implementation: `layout-techniques.md` § 5.3.

**Accessibility:** Ensure smaller items remain readable and touchable. Minimum touch target 44x44px. Content hierarchy should be conveyed semantically (heading levels, `aria-label`) not just visually.

**Combinations:** Works in most bundles. Pairs with **Image-First Layout** and **Variable Container Widths**. Conflicts with **Data-Table as Primary UI** (tables assume uniform row height).

**Complexity:** CSS-only

---

### 5.4 Drawer-as-Section

**One-line:** Major content sections behave as expandable drawers/accordions, hiding detail until requested.

**When to use:** FAQ pages, product specs, dense information architecture, long-form content with optional depth. When users need overview first, details on demand.

**Technique:** The content area is a grid whose `grid-template-rows` transitions from `0fr` to `1fr` when the section carries the `[open]` state, with an inner wrapper at `overflow: hidden` doing the clipping and the trigger icon rotating 45°. Implementation: `layout-techniques.md` § 5.4.

**Accessibility:** Use `<details>/<summary>` as base (progressive enhancement), or `role="button"` with `aria-expanded`. Ensure keyboard activation (Enter/Space). Announce expanded state to screen readers. Reduced motion: remove transition, instant open/close.

**Combinations:** Pairs with **Density Contrast** and **Data-Table as Primary UI** (drawers for row expansion). Works in **Content-First Directory** and **Industrial Precision** bundles. Conflicts with **Scroll-Scrubbed Animation** (drawers change page height, breaking scroll calculations).

**Complexity:** CSS-only (using `<details>` or `grid-template-rows`)

---

### 5.5 Density Contrast

**One-line:** Alternating between dense, information-packed sections and sparse, breathing sections.

**When to use:** Long marketing pages, documentation landing pages, product pages mixing features and narrative. Creates natural reading rhythm that prevents fatigue.

**Dense vs sparse poles:**
- *Dense marketing surfaces* — information volume is the promise (keyboard-first productivity tools, data-heavy SaaS).
- *Sparse marketing surfaces* — restraint is the promise (AI labs, luxury hardware, aspirational consumer).
- *Masters of the contrast* — Stripe and Notion are the references: sparse narrative opening + dense product/pricing sections within the same page, rhythm as structure.

**Technique:** Three modifier classes set density: sparse sections take `clamp(6rem, 12vw, 12rem)` padding in a 48rem centered measure, dense sections `clamp(3rem, 6vw, 6rem)` padding in a 72rem auto-fit grid, and ultra-dense sections 2rem padding in 90rem at small type. Sequence sparse → dense → sparse for a natural reading pulse. Implementation: `layout-techniques.md` § 5.5.

**Accessibility:** Dense sections must maintain readable font size (≥ 14px). Ensure sufficient line-height in dense sections (≥ 1.4). Sparse sections benefit screen magnifier users by reducing scroll distance to key content.

**Combinations:** Universal — works with every bundle. Core to **Content-First Directory** and **Industrial Precision**. Pairs naturally with **Variable Container Widths**. Conflicts with nothing; enhances everything.

**Complexity:** CSS-only

---

## 6. Spatial Techniques

Patterns for managing space, dividers, and visual depth.

### 6.1 Single-Formula Fluid System

**One-line:** All spacing, sizing, and type scale derive from one mathematical formula, creating self-consistent proportions.

**When to use:** Systems-oriented products, minimalist design, engineering tools. Teenage Engineering, Linear style. When mathematical rigor matters more than per-element fine-tuning.

**Technique:** Two root custom properties — `--base` (1rem) and `--ratio` (1.333, a perfect fourth) — generate a ladder of steps (`--s-2` through `--s4`) via `calc()`, and every padding, gap, and font-size references a step instead of a literal value. Implementation: `layout-techniques.md` § 6.1.

**Accessibility:** Ensure computed values don't drop below minimum readable sizes. Test with browser zoom — formula-based sizes should scale proportionally. Base must be at least 1rem (16px).

**Combinations:** Core to **Industrial Precision** bundle. Pairs with **Anti-Animation** philosophy. May conflict with **Variable Container Widths** if the formula doesn't account for container variation. Conflicts with manually-tuned spacing systems.

**Complexity:** CSS-only

---

### 6.2 Fluid Spacing Without Breakpoints

**One-line:** All spacing uses `clamp()` to continuously adapt between viewport sizes, eliminating media query breakpoints for spacing.

**When to use:** Any modern site aiming for seamless responsiveness. Especially effective for content-focused sites where spacing rhythm is more important than layout restructuring.

**Technique:** Spacing and font-size tokens are defined once as `clamp(min, preferred, max)`, where the preferred value mixes a rem floor with viewport units (`clamp(4rem, 2.5rem + 6vw, 8rem)`), so they scale continuously with no spacing media queries. Implementation: `layout-techniques.md` § 6.2.

**Accessibility:** Ensure `clamp()` minimum values meet readability requirements (16px body, 44px touch targets). Test at 320px and 1920px viewports to verify both extremes are usable.

**Combinations:** Universal — enhances every bundle. Pairs naturally with **Single-Formula Fluid System** (formula generates the clamp values). Works with all layout and scroll patterns.

**Complexity:** CSS-only

---

### 6.3 Gradient Dividers

**One-line:** Section dividers use gradient transitions rather than hard lines, softening boundaries between content areas.

**When to use:** Sites with color-shifting sections, dark-to-light transitions, or where hard borders feel too rigid. Stripe, Apple style.

**Technique:** A spacer element whose `linear-gradient` blends the background color of the section above into the one below; a `--radial` variant adds a low-opacity spotlight, and a `--textured` variant overlays faint noise through an `::after` pseudo-element. Implementation: `layout-techniques.md` § 6.3.

**Accessibility:** No concerns — purely decorative. Ensure the gradient doesn't create a zone where text would be unreadable (no text should be placed over the divider).

**Combinations:** Core to **Layered Depth** and **Cinematic Scroll Narrative** bundles. Pairs with **Dark-to-Light Emotional Arc** and **Diagonal Section Breaks**. Conflicts with nothing; layer freely.

**Complexity:** CSS-only

---

### 6.4 Mix-Blend-Mode Layering

**One-line:** Overlapping elements use CSS blend modes to create depth and visual interaction between layers.

**When to use:** Creative portfolios, art direction sites, experimental design. When layers should feel compositionally aware of each other. Balky Studio, Lorenzo Dal Dosso style.

**Technique:** Large background text uses `mix-blend-mode: multiply` on light backgrounds (`screen` on dark) at low opacity; images blend with `luminosity`, reverting to `normal` on hover; and a circular cursor-following element uses `difference`. Implementation: `layout-techniques.md` § 6.4.

**Accessibility:** Blend modes can reduce text contrast — always verify contrast with the blended result, not source colors alone. `mix-blend-mode: difference` inverts colors unpredictably — never apply to body text. Cursor-following elements should be disabled for `prefers-reduced-motion`.

**Combinations:** Core to **Choreographed Studio** bundle. Pairs with **Text-Split Reveals** and **Marquee Navigation**. Works with **Kinetic Gallery**. Conflicts with **Data-Table as Primary UI** (blend modes on data tables impair readability).

**Complexity:** CSS-only (static) / JS-light (cursor-following)

---

### 6.5 Scale-Transform Breathing

**One-line:** Elements subtly scale in response to scroll position, creating a sense of the page "breathing."

**When to use:** Ambient, meditative sites — wellness, meditation apps, luxury brands. Wispr Flow style. When you want a calm, alive-feeling without aggressive animation.

**Technique:** An IntersectionObserver with 20 thresholds reads each `[data-breathe]` element's `intersectionRatio` and drives `scale()` from 0.95 to 1.0 and opacity from 0.7 to 1.0 as it enters the viewport; CSS supplies the slow `transform`/`opacity` transition and the reduced-motion reset. Implementation: `layout-techniques.md` § 6.5.

**Accessibility:** Movement is very subtle (5% scale, 30% opacity range) — within acceptable motion limits for most users. Still respect `prefers-reduced-motion`. Avoid on interactive elements where scale change might suggest interactivity.

**Combinations:** Pairs with **Rounded Section Stacking** (sections breathe as they enter). Works in **Sticky Card Stack** bundle. Conflicts with **Scroll-Scrubbed Animation** (competing scroll responses). Conflicts with **Anti-Animation**.

**Complexity:** JS-light

---

## 7. Typography as Architecture

Patterns where type itself defines spatial structure.

### 7.1 Viewport-Dominant Display Type

**One-line:** Display text scales to fill a large percentage of viewport width, becoming the dominant structural element.

**When to use:** Hero sections, portfolio headers, brand statements. When the message IS the design. Making Software, sebastianomerlino.com style.

**Canonical reference:** Apple product pages — single-word product names sized in `vw` units, one per hero, line-height 0.9–1.0.

**Technique:** Display type is sized with `clamp(3rem, 12vw, 12rem)` at `line-height: 0.9`. The `--fitted` variant instead measures the text and applies a horizontal `scaleX()` through a `--fitted-scale` custom property so the line fills its container, recomputed on `resize`. Implementation: `layout-techniques.md` § 7.1.

**Accessibility:** Large text is inherently more readable. Ensure text remains meaningful — don't sacrifice readability for visual impact. `overflow-wrap: break-word` prevents horizontal overflow. Test with browser text scaling.

**Combinations:** Core to **Typography-Dominant** bundle. Pairs with **Inverse Responsive Scaling** and **Decorated Inline Words**. Conflicts with **Image-First Layout** (competing for viewport dominance).

**Complexity:** CSS-only (basic) / JS-light (fitted variant)

---

### 7.2 Inverse Responsive Scaling

**One-line:** Display text gets proportionally LARGER on small screens rather than smaller, filling mobile viewports with bold type.

**When to use:** Bold mobile-first experiences, portfolio splash screens, statement pages. When the mobile experience should feel even more impactful than desktop. sebastianomerlino.com style.

**Technique:** The headline uses `clamp(3.5rem, 15vw, 8rem)` — the `15vw` preference hits the 3.5rem minimum on a 375px phone and the 8rem maximum by 1200px — so the type fills roughly 50% of the viewport width on mobile versus about 30% on desktop, while adjacent body text scales normally (capped at `55ch`). Implementation: `layout-techniques.md` § 7.2.

**Accessibility:** Text remains large and readable at all sizes — this is an accessibility-positive pattern. Ensure the oversized text doesn't push critical content below the fold on mobile. Test with system font size adjustments.

**Combinations:** Core to **Typography-Dominant** bundle. Pairs with **Viewport-Dominant Display Type** (different sections). Conflicts with **Single-Formula Fluid System** (formula assumes proportional scaling, not inverse).

**Complexity:** CSS-only

---

### 7.3 Decorated Inline Words

**One-line:** Individual words within body text receive special treatment — highlight, underline, color, or animation — as semantic emphasis.

**When to use:** Marketing copy, brand pages, feature descriptions. When specific words deserve visual emphasis beyond bold/italic. sebastianomerlino.com style.

**Technique:** Four modifier styles on an inline wrapper: `--highlight` (a background gradient covering the lower part of the line), `--underline` (an `::after` that draws on via `scaleX()` once an ancestor gains `.in-view`), `--accent` (color plus weight change), and `--serif` (italic font swap). Implementation: `layout-techniques.md` § 7.3.

**Accessibility:** Decorations must not be the only indicator of meaning — use semantic HTML (`<em>`, `<strong>`) alongside visual treatment. Color-only emphasis fails for color-blind users; pair color with weight or style change. Animated underlines should respect `prefers-reduced-motion`.

**Combinations:** Core to **Typography-Dominant** bundle. Pairs with **Font-Switching as Semantic Signal**. Works in most bundles as accent. Conflicts with heavy use of **Text-Split Reveals** (too much text treatment at once).

**Complexity:** CSS-only

---

### 7.4 Knockout / Mask Text

**One-line:** Text is used as a mask to reveal images, gradients, or video behind it.

**When to use:** Hero sections, artistic splash pages, section dividers. When text and imagery should merge into one visual element. High-impact, use sparingly.

**Technique:** A background image or gradient is clipped to the glyphs with `background-clip: text` plus `-webkit-text-fill-color: transparent` (and a transparent `color` fallback). An `--animated` variant doubles the background size and shifts its position in an 8s keyframe loop, disabled under reduced motion. Implementation: `layout-techniques.md` § 7.4.

**Accessibility:** **Critical** — knockout text is invisible to screen readers if the text content isn't preserved properly. Use standard text in the HTML with the visual effect applied via CSS. Provide a `color` fallback for browsers that don't support `background-clip: text`. Ensure knockout text meets contrast requirements against the page background (test the effective contrast of the image/gradient visible through the text).

**Combinations:** Pairs with **Viewport-Dominant Display Type** (knockout at display scale). Works in **Typography-Dominant** bundle. Conflicts with **Text-Split Reveals** (splitting knockout text breaks the mask).

**Complexity:** CSS-only

---

### 7.5 Font-Switching as Semantic Signal

**One-line:** Different typefaces distinguish content types — serif for editorial, mono for technical, sans for UI — within the same page.

**When to use:** Multi-content-type sites, platforms with editorial + technical content, portfolios with varied project types. When typographic variety adds meaning, not just decoration.

**Technique:** Four font custom properties are declared at `:root` (UI sans, editorial serif, technical mono, display), and a `.content--editorial`, `.content--technical`, `.content--ui`, or `.content--display` modifier assigns one of them with matching size, line-height, and letter-spacing. Implementation: `layout-techniques.md` § 7.5.

**Accessibility:** Limit to 3 font families maximum — more creates cognitive load. Ensure all fonts have adequate x-height for readability. Each font must have a well-matched fallback to prevent layout shift during loading. Use `font-display: swap` for all custom fonts.

**Combinations:** Core to **Typography-Dominant** bundle. Pairs with **Decorated Inline Words** (font swap as decoration). Works in any bundle as a refinement. Conflicts with nothing but imposes a page-weight cost (multiple font downloads).

**Complexity:** CSS-only
