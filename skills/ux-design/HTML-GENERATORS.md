# HTML Artifact Build Specs

Build specs for the six HTML artifacts the ux-design skill produces. Each step in the skill says when to build the artifact and which decision it supports; this file says what to build. Read only the section for the artifact being generated.

**Shared shape — all six artifacts:**

- **Data-driven, one render function.** Styling lives in CSS custom properties. Content lives in one JS config object, or an array with one entry per option. A single render function builds each column or screen from that data. No hand-written per-option markup.
- **Self-contained.** CSS and JS inline. The only external dependency allowed is Google Fonts through `<link>` tags. Responsive layout. `prefers-reduced-motion` respected.
- **Real placeholder content** from the product's domain — never lorem ipsum.
- **An implementation reference where the skill says so.** Token names and values are visible in the file, not only visual impressions. For tui and mobile, the mocks take the form the modality guide's *Comparison & Preview Artifacts* section specifies (terminal-frame or phone-frame, annotated with token values and dimensions).

## Visual comparison

The identity-options comparison (Step 5): identical UI components under each candidate identity, side by side.

1. **CSS custom properties per scheme** — each scheme defines color variables (`--bg-primary`, `--bg-secondary`, `--bg-elevated`, `--text-primary`, `--text-secondary`, `--accent`, `--accent-hover`, `--accent-fg`, `--glass`, `--glass-border`, `--success`, `--success-muted`, `--focus-ring`) AND font overrides (`--font-heading`, `--font-body`).

2. **JavaScript scheme array** — each entry contains:
   - `id`, `name`, `subtitle` (short description)
   - `bgHex`, `accentHex`, `textHex` (for contrast computation)
   - `vars` object mapping CSS custom properties to values
   - `fonts` object with `heading` and `body` font-family strings
   - `mood` array of personality tags
   - `audience`, `personality` descriptions
   - `atmosphere` — a brief description of the visual texture/surface feel (e.g., "subtle grain texture, sharp shadows")
   - `spatialCharacter` — the layout personality (e.g., "generous whitespace, centered compositions")

3. **Single `renderColumn(scheme)` function** — generates identical components per scheme:
   - Navigation bar with logo mark, nav links, avatar
   - Button row (primary, outline, ghost)
   - Glass card with heading, body text, badge
   - Form input with label and placeholder
   - Badge row (default, success, outline)
   - Progress bar with label
   - Content card with image placeholder, title, actions
   - Apply a subtle background texture or overlay per scheme (e.g., noise, gradient wash, grain) based on `scheme.atmosphere` to give each column a different *feel*, not just different colors

4. **Decision helper table** at the bottom with computed rows:
   - Base colors (swatches + hex codes)
   - Text-on-background WCAG contrast ratio (computed, with AA pass/fail badge)
   - Accent-on-background WCAG contrast ratio (computed, with AA pass/fail badge)
   - Mood tags
   - Audience fit
   - Font pairing (heading + body font names)
   - Atmosphere (visual texture/surface description)
   - Spatial character (layout personality)

5. **Responsive grid** — columns per scheme count (`cols-2`, `cols-3`, `cols-4`) with responsive breakpoints.

**Font loading:** Add a single `<link>` to Google Fonts loading all candidate heading and body fonts. Apply per-scheme via `--font-heading` / `--font-body` CSS custom properties and a `.has-custom-fonts` class on each scheme column.

**WCAG contrast computation:** Include `hexToRgb()`, `srgbToLinear()`, `luminance()`, and `contrastRatio()` functions inline. Display results as `N.N:1 AA Pass` (green) or `N.N:1 AA Fail` (red).

## Atmosphere comparison

The atmosphere-directions comparison (Step 7b): the same identity under each atmosphere, as mini page layouts that show how each one *feels*. Mini page layouts rather than isolated components, because atmosphere is about spatial feel.

1. **CSS custom properties** — Identity variables (colors, fonts) shared at `:root`. Per-atmosphere treatment variables on each column: `--surface-texture`, `--card-treatment`, `--card-shadow`, `--divider-style`, `--section-gap`, `--entrance-type`, `--entrance-duration`, `--hover-signature`, `--hover-transform`.

2. **JavaScript atmosphere array** — each entry contains:
   - `id`, `name`, `subtitle`
   - shared `identity` object (colors, fonts — same for all)
   - `treatments` object: texture, cards, dividers, density, entrance, hover
   - `personality` description
   - `bestFor` context

3. **Single `renderColumn(atmosphere)` function** — generates mini page layouts per column:
   - Hero section (headline, subtext, CTA) — shows texture, density, entrance
   - Card grid (2x2) — shows card treatment, hover signature, stagger entrance
   - Form area (2 inputs + submit in a card) — shows card treatment, divider
   - Section dividers between areas

4. **Motion**: Entrance animations auto-play via IntersectionObserver. Hover states interactive. `prefers-reduced-motion` respected.

5. **Decision helper table**: Surface texture, card treatment, dividers, density, entrance animation, hover signature, personality, best-for context.

6. **Textures**: an SVG noise filter inlined for textures.

## Layout comparison

The layout-strategy comparison (Step 7c): each proposed layout architecture as a mini page preview, so the user sees spatial feel, section geometry, scroll hints, and nav behavior rather than reading descriptions.

1. **CSS custom properties** — Identity variables (colors, fonts) shared at `:root`. Per-strategy treatment variables on each column: `--section-geometry`, `--content-hierarchy`, `--nav-behavior`, `--scroll-hint`, `--page-rhythm`.

2. **JavaScript strategies array** — each entry contains:
   - `id`, `name`, `subtitle`, `complexityTier`
   - shared `identity` object (colors, fonts, atmosphere treatments from the atmosphere choice)
   - strategy-specific `layout` object (section widths, geometry style, scroll behavior, content dominance, nav architecture, rhythm pattern)

3. **Single `renderStrategy(strategy)` function** — produces a mini page preview column containing:
   - **Navigation** demonstrating the proposed nav architecture (migratory, dual-layer, embedded hero, etc.)
   - **Hero/header section** showing the content hierarchy approach (image-first, type-dominant, data-dense)
   - **2-3 body sections** demonstrating the section geometry (diagonal breaks, rounded stacking, asymmetric splits, variable widths)
   - **Scroll behavior indicator** — a visual cue showing what scroll architecture the strategy uses (e.g., a subtle label like "parallax" or "pin-and-reveal", or a miniature scroll animation if JS-light/heavy)
   - **Page rhythm** — visible in the vertical spacing and section alternation pattern
   - Each section uses real placeholder content relevant to the product type

4. **Responsive columns** — strategies render side-by-side on wide viewports, stacked on narrow. Each column is labeled with strategy name, subtitle, and complexity tier badge.

## Pattern showcase

The complete-system showcase (Step 7d): identity + chosen atmosphere + all functional patterns in one responsive page, demonstrating the **chosen layout architecture**, not just component treatments.

1. **CSS custom properties** — Single set combining identity variables + chosen atmosphere treatments.

2. **JS config object** (single, not array) — `identity`, `atmosphere`, `patterns` (navigation type, loading type, error approach, empty state style, form validation style).

3. **Single `renderShowcase(config)` function** — full page layout:
   - Navigation demonstrating the chosen navigation *behavior* (migratory, dual-layer, embedded hero, etc. — not just a static nav bar)
   - Hero/landing section using the chosen section geometry and content hierarchy (full-bleed vs contained, image-first vs type-dominant)
   - **Variable section geometry**: some sections full-bleed, some narrow, some wide — matching the chosen layout strategy
   - Card grid (3-4 cards, chosen card treatment, hover signature, stagger)
   - Form section (chosen validation pattern, inline error/success states shown)
   - Empty state panel (chosen empty state pattern)
   - Toast notification (auto-triggers after 2s or via button)
   - Data display with loading skeleton → populated transition
   - **Density contrast**: alternate between sparse breathing sections and dense content sections per the chosen page rhythm

4. **Scroll behavior**: If the chosen layout architecture includes scroll patterns (sticky cascade, parallax, pin-and-reveal), implement them in the showcase. A "Cinematic Scroll Narrative" strategy should show pinned sections; a "Sticky Card Stack" should show cascading sticky cards. Standard vertical scroll strategies need no special behavior.

5. **Motion**: All entrances auto-play on scroll. Hovers interactive. Loading skeleton auto-transitions. Toast auto-triggers. `prefers-reduced-motion` respected.

6. **Layout** follows the chosen strategy — not forced single-column if the strategy calls for variable widths or asymmetric splits.

## UX preview

The persistent developer reference (Step 8b), generated after the design system document is written. Same structure as the pattern showcase, plus what makes it a reference: a header section showing token names, hex values, and font names, and a Layout Architecture section that documents spatial decisions so developers know the intended section structure, not just component styling.

1. **CSS custom properties** — Single set derived from the documented identity (design system document §2.1-2.2) and atmosphere (§2.5) decisions.

2. **JS config object** (single, not array) — `identity` (colors, fonts from BRD decisions), `atmosphere` (treatments from UXD atmosphere decisions), `patterns` (from UXD pattern decisions).

3. **Single `renderPreview(config)` function** — full page layout:
   - Header with design system name, tonal direction badge, generation date
   - Color palette swatches with token names and hex values
   - Typography scale showcase (all `--text-*` tokens with specimen text)
   - Navigation pattern demo
   - Card grid showing card treatment, hover signature, entrance stagger
   - Form section with validation states
   - Empty state panel
   - Toast notification (button-triggered)
   - Loading skeleton → populated transition
   - Motion timing reference (visualized durations)
   - **Layout Architecture section** documenting the chosen spatial strategy:
     - Section geometry diagram (annotated: which sections are full-bleed, narrow, wide, diagonal, rounded)
     - Scroll behavior documentation (what happens on scroll: parallax, pin-and-reveal, sticky cascade, standard)
     - Navigation behavior annotation (how nav transforms across sections)
     - Page rhythm visualization (dense vs sparse section alternation)

## App wireframes

The screen-by-screen wireframes (Step 8c): every screen of the product's experiences, hi-fi and rendered with the documented tokens — not grayscale boxes. The value is flow and layout composition, and pattern gaps surface here: compositing patterns onto real screens exposes states nobody defined.

1. **JS screens array** — each entry: `id`, `name`, `flow` (which experience it belongs to), `variant` (primary/empty/loading/error, where applicable), `notes` (what this screen must accomplish), `content` (real placeholder content from the product domain — no lorem ipsum).

2. **Screen-switcher navigation** — sidebar or top nav listing screens grouped by flow, variant states nested under their screen.

3. **Single `renderScreen(screen)` function** — composites the chosen patterns (navigation pattern, layout architecture, card treatment, forms, empty/loading/error patterns) onto each screen's actual layout.

4. **Screen annotations** — each screen shows its name, flow, variant label, and a one-line note of which patterns it exercises.
