---
name: design-system
description: This skill should be used when establishing a design system - foundations, brand identity, and UX patterns in one workflow
user-invocable: false
---

# Design System Skill

Establishes a complete design system through guided collaboration: foundations, brand identity, and UX patterns.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high` or higher AND you are Opus (1M context).
If effort is below `high`, you MUST show the recommendation prompt — regardless of model.
If you are not Opus (1M context), you MUST show the recommendation prompt - regardless of effort level.

Otherwise → use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Do you want to switch? Creative and analytical synthesis — resisting generic defaults requires active judgment.\n\nTo switch: cancel, run `/model opus[1m]` and `/effort high`, then re-invoke this skill.",
    "header": "Recommended: Opus (1M context) at high effort",
    "options": [
      { "label": "Continue" },
      { "label": "Cancel — I'll switch first" }
    ],
    "multiSelect": false
  }]
}
```

If the user selects "Cancel — I'll switch first": output the switching commands above and stop. Do not proceed with the skill.

## Collaboration Approach

- **Lead with recommendations** - "I recommend X because [your context]"
- **Minimize questions** - Most context is in PRD/architecture
- **Iterate on feedback** - Adjust specific elements, don't restart
- **Accept user direction** - If user has specific preferences, incorporate them
- **Use AskUserQuestion tool** - When asking the user questions, always use the AskUserQuestion tool with appropriate options

When user doesn't have a preference:
> "I'll go with [X] because [reason]. I can adjust later if needed."

Document and move on.

## Design Philosophy

Every design system should have a **distinctive identity**, not just be functional. The goal is a system that someone could recognize — "that's [product name]" — from its visual identity alone.

**Anti-generic principle:** Never default to the most common choices just because they're safe. If you find yourself reaching for Inter + enterprise blue + clean minimal, stop and ask why. Those choices should require justification, not be the path of least resistance.

**Tonal direction:** Every design system should commit to a recognizable aesthetic posture — not a vague descriptor like "professional" or "modern" (which describe everything and nothing), but a specific tonal direction:

- Brutally minimal, maximalist, retro-futuristic, organic warmth, quiet luxury, playful, editorial, brutalist, art deco, soft atmospheric, industrial, geometric bold

The tonal direction is derived from the product's persona, vision, and competitive context. It guides every downstream decision — color strategy, typography personality, spatial character, motion style.

**Memorability test:** After defining the identity, ask: "Would a user recognize this product from its visual identity alone?" If swapping the logo onto a competitor's site would go unnoticed, the identity isn't distinctive enough.

**Distinctiveness and accessibility are not in tension.** Bold color choices can meet WCAG AA. Characterful typography can be highly readable. Atmospheric surfaces can have clear contrast. Never trade accessibility for aesthetics — find the intersection.

## File Locations

- **Input:**
  - `{{specs_dir}}/product_specs.md` (PRD with personas, vision, NFRs)
  - `{{specs_dir}}/architecture.md` (technical constraints, API patterns)
- **Output:**
  - `{{specs_dir}}/design_system.md`
  - `{{specs_dir}}/ux-preview.html` (visual reference, regenerated when design system changes)
- **Transient:**
  - `{{specs_dir}}/design-comparison.html` (color/font comparison, deleted after identity is chosen)
  - `{{specs_dir}}/atmosphere-comparison.html` (atmosphere comparison, deleted after atmosphere is chosen)
  - `{{specs_dir}}/pattern-showcase.html` (complete system preview, deleted after Step 8 documentation)

## Step 0: Resolve Project Context

**Before anything else, resolve the project context:**

1. **Monorepo check:** Does `.groundwork.yml` exist at the repo root?
   - If yes → Is `{{project_name}}` non-empty?
     - If empty → Invoke `Skill(skill="groundwork:project-selector")` to select a project, then restart this skill.
     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.
   - If no → Continue to item 3.
2. **CWD mismatch check (monorepo only):**
   - Skip if not in monorepo mode or if the project was just selected in item 1 above.
   - If CWD is the repo root → fine, proceed.
   - Check which project's path CWD falls inside (compare against all projects in `.groundwork.yml`).
   - If CWD is inside the selected project's path → fine, proceed.
   - If CWD is inside a different project's path → warn via `AskUserQuestion`:
     > "You're working from `<cwd>` (inside **[cwd-project]**), but the selected Groundwork project is **[selected-project]** (`[selected-project-path]/`). What would you like to do?"
     > - "Switch to [cwd-project]"
     > - "Stay with [selected-project]"
     If the user switches, invoke `Skill(skill="groundwork:project-selector")`.
   - If CWD doesn't match any project → proceed without warning (shared directory).
3. **Check `{{specs_dir}}/`:** Does a specs directory exist?
   - If yes → Single-project repo, proceed normally.
   - If no → Ask the user: "Is this a single-project repo or a monorepo with multiple projects?"
     - **Single project** → Proceed normally (specs will be created at `{{specs_dir}}/`)
     - **Monorepo** → Invoke `Skill(skill="groundwork:repo-setup")` to create `.groundwork.yml`, then continue.

## Prerequisites

Check for PRD first. Look for `{{specs_dir}}/product_specs.md` (single file) or `{{specs_dir}}/product_specs/` (directory). If neither exists, prompt user to run `/product-design` first.

When reading the PRD:
- **Single file:** Read `{{specs_dir}}/product_specs.md`
- **Directory:** Aggregate all `.md` files from `{{specs_dir}}/product_specs/` with `_index.md` first, then numerically-prefixed files, then alphabetically

Architecture file is optional but helpful for UX pattern decisions.

---

## Phase 1: Foundations

### Step 1: Context Gathering

Extract design-relevant context from PRD + a few targeted questions.

**From PRD (already available):**
- Personas -> accessibility needs, expertise level
- Product vision -> personality keywords
- NFRs -> any explicit accessibility requirements

**Targeted Questions (only what's missing):**

> "Before we define the design system, a few quick questions:
> 1. Do you have existing brand colors/fonts, or starting fresh?
> 2. Any specific accessibility requirements? (WCAG level, legal compliance)
> 3. Is this mobile-first, desktop-first, or balanced?"

Move on quickly after gathering constraints.

### Step 2: Propose Design Principles

Based on context, propose principles and explain why. One principle should address **visual identity and aesthetic commitment** — not as decoration, but as a functional design value.

Also derive a **tonal direction** from the PRD's persona and vision. Avoid vague non-directions like "professional", "modern", or "clean" — these describe nearly every product and guide no decisions. Instead, commit to a specific aesthetic posture (see the tonal direction list in Design Philosophy above).

> "Based on [specific context from PRD], I recommend these guiding principles:
>
> **DP-001: Clarity First**
> Your [persona] users need to make quick decisions - clarity beats cleverness.
>
> **DP-002: [Principle Name]**
> Because [specific reason tied to their context].
>
> **DP-003: Distinctive Identity**
> [Product] should be visually recognizable — its personality should come through in every screen, not just the marketing site. This means committing to [tonal direction] as our aesthetic posture.
>
> **Tonal Direction: [specific direction]**
> Derived from [persona characteristic] and [product vision element]. This will guide our color strategy, typography choices, spatial feel, and motion character.
>
> Does this direction feel right? I can adjust if something's off."

**Handle Feedback:**
- User agrees -> Document and proceed to Phase 2
- User pushes back -> Adjust specific principle, don't restart

### Step 3: Establish Tokens

Define foundational token categories without waiting for approval on each:

**Spacing Scale (4px base):**
- `--space-1`: 4px through `--space-16`: 64px

**Elevation Scale:**
- `--elevation-0` (flat) through `--elevation-3` (modals)

**Border Radius:**
- `--radius-none` (0) through `--radius-full` (pills)

**Token Architecture Principles:**
- **Two-layer hierarchy:** Define primitive tokens (raw values like `--blue-500`) and semantic tokens (contextual names like `--color-primary`). Only the semantic layer changes for dark mode.
- **Semantic names:** `--space-sm` communicates intent better than `--spacing-8`. Names describe purpose, not pixel values.
- **Gap over margins:** Prefer CSS `gap` for spacing between siblings — eliminates margin collapse and simplifies composition.
- **Semantic z-index scale:** Define named layers (dropdown, sticky, modal-backdrop, modal, toast, tooltip) rather than arbitrary numbers.

See `references/spatial-design-guide.md` for full spatial system rationale (4pt grid, optical adjustments, container queries).

Present as a cohesive system. Only adjust if user has concerns.

---

## Phase 2: Brand Identity

### Step 4: Propose Identity Options

Before proposing options, confirm the **tonal direction** established in Step 2. Each option should be a genuine exploration of that direction (or a deliberate contrast if offering range), not a convergence on "clean professional minimal."

Propose 2-4 complete visual identity options, each pairing a color strategy with typography that suits its personality. Draw from the product context, personas, and design principles.

**Color System Guidance:**
- **Use OKLCH color space** for palette generation — perceptually uniform (unlike HSL where "50% lightness" varies wildly across hues). Define palettes in OKLCH, output hex/RGB for implementation.
- **Tinted neutrals:** Never use pure gray. Add a subtle brand hue to the neutral scale (chroma ~0.01 in OKLCH). Creates warmth and cohesion without visible color.
- **Never pure black or white:** `#000000` and `#ffffff` don't exist in nature. Use tinted near-black/near-white from the neutral scale.
- **60-30-10 visual weight:** Neutral surfaces 60%, secondary/structural color 30%, accent 10%. Accent works because it's rare.
- **Alpha is a design smell:** If using `rgba()` or `opacity` for color variations, the palette is incomplete. Define explicit tokens for every needed shade.

See `references/color-and-contrast-guide.md` for dangerous color combinations, dark mode strategy, and the two-layer token approach.

**Anti-pattern warnings:**
- Do not propose options where all use the same font family
- Do not copy palettes from famous brands (see "Colors to Avoid as Primary" in color reference)
- Do not let all options converge on the same personality — if they all feel "clean and minimal," the exercise failed
- At least one option should use a characterful or unexpected font pairing

> "Based on [context] and our **[tonal direction]** direction, here are identity options to compare:
>
> **Option A: [Name] — [Personality tag]**
> **Tonal Direction:** [specific direction this option embodies]
> Colors: Primary [hex], Secondary [hex], Accent [hex]
> Color Strategy: [e.g., Dominant + Sharp Accent, Monochrome + One]
> Fonts: [Heading font] / [Body font]
> **Visual Atmosphere:** [texture/surface concept — e.g., "subtle grain texture on surfaces, sharp card shadows"]
> **Spatial Character:** [layout personality — e.g., "generous whitespace, asymmetric hero layouts"]
> Personality: [1-sentence description]
>
> **Option B: [Name] — [Personality tag]**
> **Tonal Direction:** [specific direction]
> Colors: Primary [hex], Secondary [hex], Accent [hex]
> Color Strategy: [approach]
> Fonts: [Heading font] / [Body font]
> **Visual Atmosphere:** [different texture/surface concept]
> **Spatial Character:** [different layout personality]
> Personality: [1-sentence description]
>
> **Option C: [Name] — [Personality tag]** *(if warranted)*
> ...
>
> I'll generate a visual comparison so you can see these side-by-side in your browser."

**Handle Feedback:**
- User has specific colors/fonts → Incorporate as an additional candidate
- User eliminates options → Note preferences, carry forward survivors
- User wants different direction → Propose new candidates

Aim for 2-4 candidates total (avoids decision fatigue). Include user-provided colors/fonts as a candidate if offered.

### Step 5: Generate Visual Comparison

Generate `{{specs_dir}}/design-comparison.html` — a self-contained file that renders identical UI components under each candidate identity option, side-by-side, with a decision helper table.

**Architecture — data-driven, single render function:**

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

5. **Self-contained** — no external dependencies except Google Fonts `<link>` tags for candidate fonts. All CSS and JS inline.

6. **Responsive grid** — columns per scheme count (`cols-2`, `cols-3`, `cols-4`) with responsive breakpoints.

**Font loading:** Add a single `<link>` to Google Fonts loading all candidate heading and body fonts. Apply per-scheme via `--font-heading` / `--font-body` CSS custom properties and a `.has-custom-fonts` class on each scheme column.

**WCAG contrast computation:** Include `hexToRgb()`, `srgbToLinear()`, `luminance()`, and `contrastRatio()` functions inline. Display results as `N.N:1 AA Pass` (green) or `N.N:1 AA Fail` (red).

**After generating:**

> "I've generated the visual comparison at `{{specs_dir}}/design-comparison.html`. Open it in your browser to see the identity options side-by-side."

**Handle evaluation feedback:**
- User picks a winner → Document as BRD decisions, define semantic colors and type scale, proceed to Step 6
- User wants tweaks → Regenerate with adjustments
- User likes colors from one option + fonts from another → Regenerate a mixed comparison
- User can't decide → Generate a focused 2-scheme comparison

**After identity is chosen, define the full palette and type scale:**

Semantic colors (propose based on chosen palette temperature):

| Semantic | Color | Usage |
|----------|-------|-------|
| Success | Green | Confirmations, completed states |
| Warning | Amber | Cautions, pending actions |
| Error | Red | Errors, destructive actions |
| Info | Blue | Informational messages |

Neutral palette: Define gray scale for text, backgrounds, borders based on chosen primary color temperature.

Type scale based on chosen body font:

| Token | Size | Usage |
|-------|------|-------|
| `--text-xs` | 12px | Captions, labels |
| `--text-sm` | 14px | Secondary text |
| `--text-base` | 16px | Body text |
| `--text-lg` | 18px | Lead paragraphs |
| `--text-xl` | 20px | Section headers |
| `--text-2xl` | 24px | Page headers |
| `--text-3xl` | 30px | Hero text |

**Typography System Principles:**
- **Vertical rhythm:** Use line-height as the base unit for all vertical spacing. If base line-height is 24px, section margins should be multiples of 24px.
- **Fewer sizes, more contrast:** A 5-size system with clear visual steps beats 8 muddy-close sizes. Use a modular scale ratio (1.25 major third, 1.333 perfect fourth) — see `references/typography-examples.md`.
- **Measure:** Set `max-width: 65ch` on body text containers for optimal readability.
- **Fluid type for display, fixed for UI:** Use `clamp()` for hero/display text. Use fixed `rem` for app UI and controls — they need predictable sizing.
- **Font loading:** Always use `font-display: swap` and metric-matched fallback stacks to prevent layout shift.
- **16px minimum body text** — anything smaller is an accessibility issue on mobile.

See `references/typography-guide.md` for OpenType features, dark mode typography adjustments, and font selection anti-patterns.

Delete `{{specs_dir}}/design-comparison.html` after the palette and typography are documented.

### Step 6: Brand Voice & UX Writing

> "For UI copy, I recommend this voice:
>
> **Voice:** [constant personality — e.g., confident but warm, precise but human]
> **Tone adapts to moment:** Celebratory for success, empathetic for errors, encouraging for empty states. Voice stays constant; tone shifts.
>
> **Button labels:** Verb + object — "Save changes" not "OK". Name destructive actions: "Delete project" not "Yes".
> **Error formula:** What happened + Why + How to fix. Never blame the user.
> **Empty states:** Acknowledge + Explain value + Provide action. Empty states are onboarding moments, not dead ends.
> **Link text:** Must stand alone — "View pricing details" not "Click here".
>
> Example error: 'Couldn't save — the file exceeds 10MB. Compress it or choose a smaller file.'
> Example empty state: 'No projects yet. Projects help you organize related tasks. Create your first one.'
> Example success: 'Changes saved'
>
> Does this tone feel right?"

**UX Writing Principles (for design_system.md documentation):**
- One term per concept — build a glossary if the domain has ambiguous terms
- Plan for text expansion (German +30%, French +20%) — never design to exact English string length
- Avoid redundant copy — if the heading explains it, the intro paragraph is noise
- Never use humor for error messages
- Alt text describes information, not decoration: "Revenue increased 40% in Q3" not "Chart showing data"

See `references/ux-writing-guide.md` for the full UX writing framework.

---

## Phase 3: UX Patterns

### Step 7: Define Patterns and Atmosphere

Derive from architecture + PRD (minimal questions needed). This step has three phases: propose patterns and atmosphere candidates (7a), visually compare atmosphere options (7b), and showcase the complete system (7d).

#### Step 7a: Propose Patterns and Atmosphere Candidates

Present functional pattern recommendations for immediate approval, plus 2-3 named atmosphere candidates for visual comparison.

> "Based on your architecture, product needs, and our **[tonal direction]** direction, here's the UX pattern system:
>
> **Navigation: [Pattern] — [why]**
> [Specific recommendation tied to feature count and product type.]
>
> **Loading: [Pattern] — [why]**
> [Specific recommendation tied to API characteristics.]
>
> **Errors: Layered approach**
> - Inline for field validation
> - Toast for operation failures
> - Banner for system issues
>
> **Empty States: [Pattern] — [why]**
> [Specific recommendation tied to first-run experience needs.]
>
> **Forms: [Pattern] — [why]**
> [Specific recommendation tied to user expertise level.]
>
> **Responsive: [Pattern] — [why]**
> [Specific recommendation tied to primary device context.]
> Mobile-first (`min-width` queries). Content-driven breakpoints — let content determine where to break, not device sizes. Detect input method (`pointer: fine/coarse`, `hover: hover/none`) rather than inferring from screen width. Account for safe areas on modern devices (`env(safe-area-inset-*)`).
>
> ---
>
> For the visual feel, I have **[2-3] atmosphere directions** to compare. Each bundles texture, card treatment, spacing, animation, and hover feel into a coherent package — same identity colors and fonts, different spatial and tactile character:
>
> **Atmosphere A: [Name]**
> Surface: [texture description]. Cards: [treatment]. Dividers: [style]. Density: [spatial feel]. Entrances: [animation style]. Hover: [signature]. Best for: [context].
>
> **Atmosphere B: [Name]**
> Surface: [texture]. Cards: [treatment]. Dividers: [style]. Density: [spatial feel]. Entrances: [animation style]. Hover: [signature]. Best for: [context].
>
> **Atmosphere C: [Name]** *(if warranted)*
> ...
>
> I'll generate a visual comparison so you can see these atmosphere directions side-by-side."

**Motion Design Principles (inform atmosphere choice):**
- **100/300/500 rule:** Instant feedback 100-150ms, state transitions 200-300ms, layout shifts 300-500ms, entrances 500-800ms.
- **Exit faster than enter:** Exit animations at ~75% of entrance duration.
- **Exponential easing only:** Use ease-out-quart/quint/expo for natural motion. Never linear (mechanical), never bounce/elastic (dated) unless tonal direction demands it.
- **Only animate `transform` and `opacity`** — everything else triggers layout recalculation and jank.
- **Reduced motion is not optional:** 35% of adults 40+ affected. Use `prefers-reduced-motion` to preserve functional animations while removing decorative spatial movement.
- **Stagger cap:** Cap total stagger time regardless of item count (~400ms max).

See `references/motion-design-guide.md` for perceived performance techniques, grid-template-rows height animation, and the 80ms perception threshold.

**Interaction Design Principles (apply across all patterns):**
- **Eight interactive states:** Every interactive element must define: default, hover, focus, active, disabled, loading, error, success. Undefined states get improvised during implementation.
- **Focus via `:focus-visible`** — show focus rings for keyboard, suppress for mouse. Rings need 3:1 contrast, 2-3px width, offset from element.
- **Validate on blur, not keystroke** (except password strength meters).
- **Undo over confirm dialogs** — users click through confirmations without reading. Provide undo for reversible actions instead.
- **Touch targets 44px minimum** — even if the visual element is smaller, the tap area must be 44px.

See `references/interaction-design-guide.md` for roving tabindex, skip links, native dialog/popover usage, and gesture discoverability.

**Handle Feedback:**
- User agrees with functional patterns → Document as UXD-001 through UXD-00N, proceed to 7b
- User questions a pattern → Explain reasoning, adjust if needed
- User has strong atmosphere preference already → Skip 7b, go to 7d

#### Step 7b: Generate Atmosphere Comparison (`{{specs_dir}}/atmosphere-comparison.html`)

Generate a self-contained HTML file that renders the same identity (colors, fonts) under each atmosphere direction side-by-side, with mini page layouts showing how each atmosphere *feels* in practice.

**Architecture — data-driven, single render function:**

1. **CSS custom properties** — Identity variables (colors, fonts) shared at `:root`. Per-atmosphere treatment variables on each column: `--surface-texture`, `--card-treatment`, `--card-shadow`, `--divider-style`, `--section-gap`, `--entrance-type`, `--entrance-duration`, `--hover-signature`, `--hover-transform`.

2. **JS atmosphere array** — each entry contains:
   - `id`, `name`, `subtitle`
   - shared `identity` object (colors, fonts — same for all)
   - `treatments` object: texture, cards, dividers, density, entrance, hover
   - `personality` description
   - `bestFor` context

3. **Single `renderColumn(atmosphere)` function** — generates mini page layouts per column (not isolated components, because atmosphere is about spatial feel):
   - Hero section (headline, subtext, CTA) — shows texture, density, entrance
   - Card grid (2x2) — shows card treatment, hover signature, stagger entrance
   - Form area (2 inputs + submit in a card) — shows card treatment, divider
   - Section dividers between areas

4. **Motion**: Entrance animations auto-play via IntersectionObserver. Hover states interactive. `prefers-reduced-motion` respected.

5. **Decision helper table**: Surface texture, card treatment, dividers, density, entrance animation, hover signature, personality, best-for context.

6. **Self-contained**: No external deps except Google Fonts. SVG noise filter inlined for textures.

**After generating:**

> "Open `{{specs_dir}}/atmosphere-comparison.html` to see the atmosphere directions side-by-side. Same identity in every column — different feel."

**Handle evaluation feedback:**
- User picks a winner → Document as UXD decisions, delete file, proceed to 7d
- User wants tweaks → Regenerate with adjustments
- User likes elements from multiple → Regenerate a mixed option

#### Step 7c: Propose Layout Architecture + Generate Comparison (`{{specs_dir}}/layout-comparison.html`)

Based on tonal direction, product type, and atmosphere choice, propose 2-3 layout architecture strategies. Each strategy is a coherent bundle of spatial decisions combining:

- **Section geometry** — how sections relate spatially (variable widths, diagonal breaks, rounded stacking, asymmetric splits)
- **Scroll architecture** — what happens as user scrolls (scroll-scrubbed, parallax, pin-and-reveal, sticky cascade, standard vertical)
- **Content hierarchy approach** — what dominates visually (image-first, type-dominant, data-dense, balanced)
- **Navigation architecture** — how nav behaves beyond its type (migratory, dual-layer, embedded hero, content-push, navigation by absence)

See `references/layout-architecture-guide.md` for the full pattern library (~35 patterns with CSS/JS implementation) and `references/layout-examples.md` for 7 curated strategy bundles showing how patterns combine.

**Each proposed strategy should:**
- Be derived from tonal direction + product type + atmosphere choice (not arbitrary)
- Reference a curated bundle from `layout-examples.md` as starting point, adapted to this product
- Name the specific patterns from `layout-architecture-guide.md` being combined
- Be described in ~5 sentences covering section geometry, scroll behavior, content hierarchy, nav behavior, and page rhythm
- Note the complexity tier (CSS-only / JS-light / JS-heavy)

**Generate a visual comparison file** before presenting the choice. This file renders each proposed layout strategy as a mini page preview so the user can see spatial feel, section geometry, scroll hints, and nav behavior — not just read descriptions.

**Architecture — data-driven, single render function:**

1. **CSS custom properties** — Identity variables (colors, fonts) shared at `:root`. Per-strategy treatment variables on each column: `--section-geometry`, `--content-hierarchy`, `--nav-behavior`, `--scroll-hint`, `--page-rhythm`.

2. **JS strategies array** — each entry contains:
   `id`, `name`, `subtitle`, `complexityTier`
   shared `identity` object (colors, fonts, atmosphere treatments from 7b choice)
   strategy-specific `layout` object (section widths, geometry style, scroll behavior, content dominance, nav architecture, rhythm pattern)

3. **Single `renderStrategy(strategy)` function** — produces a mini page preview column containing:
   - **Navigation** demonstrating the proposed nav architecture (migratory, dual-layer, embedded hero, etc.)
   - **Hero/header section** showing the content hierarchy approach (image-first, type-dominant, data-dense)
   - **2-3 body sections** demonstrating the section geometry (diagonal breaks, rounded stacking, asymmetric splits, variable widths)
   - **Scroll behavior indicator** — a visual cue showing what scroll architecture the strategy uses (e.g., a subtle label like "parallax" or "pin-and-reveal", or a miniature scroll animation if JS-light/heavy)
   - **Page rhythm** — visible in the vertical spacing and section alternation pattern
   - Each section uses real placeholder content relevant to the product type (not lorem ipsum)

4. **Responsive columns** — strategies render side-by-side on wide viewports, stacked on narrow. Each column is labeled with strategy name, subtitle, and complexity tier badge.

5. **Self-contained** — all CSS/JS inline, Google Fonts via `<link>`, no external dependencies.

**Tell the user** to open `{{specs_dir}}/layout-comparison.html` in their browser, then present the choice:

**Present via AskUserQuestion:**
```json
{
  "questions": [{
    "question": "I've generated a visual comparison at {{specs_dir}}/layout-comparison.html — open it in your browser to see each strategy rendered. Which layout architecture fits your product best?",
    "header": "Layout arch",
    "options": [
      {
        "label": "[Strategy A name]",
        "description": "[~2 sentences: key spatial decisions + complexity tier]"
      },
      {
        "label": "[Strategy B name]",
        "description": "[~2 sentences]"
      },
      {
        "label": "[Strategy C name] (if warranted)",
        "description": "[~2 sentences]"
      }
    ],
    "multiSelect": false
  }]
}
```

**Handle feedback:**
- User picks a strategy → Document as UXD decisions (section geometry, scroll architecture, content hierarchy, nav behavior, page rhythm), proceed to 7d
- User wants tweaks → Adjust the comparison file and re-present
- User wants elements from multiple → Propose a hybrid, regenerate comparison showing the hybrid alongside the originals, verify pattern compatibility using the guide's combination warnings

#### Step 7d: Generate Pattern Showcase (`{{specs_dir}}/pattern-showcase.html`)

Generate a single-page preview of the complete finalized system — identity + chosen atmosphere + all functional patterns in one responsive page. This is NOT a comparison — one full-width layout showing how everything works together.

**Architecture — data-driven, single render function:**

1. **CSS custom properties** — Single set combining identity variables + chosen atmosphere treatments.

2. **JS config object** (single, not array) — `identity`, `atmosphere`, `patterns` (navigation type, loading type, error approach, empty state style, form validation style).

3. **Single `renderShowcase(config)` function** — full page layout demonstrating the **chosen layout architecture**, not just component treatments:
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

6. **Self-contained, responsive layout** — layout follows the chosen strategy (not forced single-column if the strategy calls for variable widths or asymmetric splits).

**After generating:**

> "Open `{{specs_dir}}/pattern-showcase.html` to see the complete system in action. Scroll through and hover over elements to feel the interaction character."

**Handle evaluation feedback:**
- User approves → Proceed to Step 8
- User wants adjustments → Regenerate with changes
- User spots conflict between patterns → Adjust pattern, regenerate

---

## Step 8: Document Design System

Create `{{specs_dir}}/design_system.md` using template in `references/design-system-template.md`.

Populate all sections:
1. **Foundations** - DP-NNN principles, accessibility level, tokens
2. **Brand Identity** - Colors, typography, voice
3. **UX Patterns** - Navigation, loading, errors, forms, responsive, motion
4. **Decision Log** - All decisions with context and rationale

Delete `{{specs_dir}}/pattern-showcase.html` after the design system document is written.

### Step 8b: Generate UX Preview (`{{specs_dir}}/ux-preview.html`)

After writing `{{specs_dir}}/design_system.md`, generate a persistent visual reference from the finalized documented decisions. This is similar in structure to the pattern-showcase but serves as a developer reference — it includes token names, hex values, and font names alongside the visual demonstrations.

**Architecture — data-driven, single render function:**

1. **CSS custom properties** — Single set derived from the documented identity (§2.1-2.2) and atmosphere (§2.5) decisions.

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

4. **Key difference from pattern-showcase:** Includes a reference header section showing token names, hex values, and font names — making it useful as a developer reference, not just a visual impression. The Layout Architecture section documents spatial decisions so developers know the intended section structure, not just component styling.

5. **Self-contained**, responsive layout. `prefers-reduced-motion` respected.

**After generating:**

> "I've also generated `{{specs_dir}}/ux-preview.html` — a visual reference for the design system. Open it anytime to see how the system looks and feels."

Present summary for review, then write the file.

> "Here's the complete design system:
>
> **Foundations:** [N] design principles, WCAG [level], token system
> **Brand:** [Primary color], [Font], [Voice tone]
> **Tonal Direction:** [specific direction — e.g., warm editorial, brutally minimal]
> **Visual Atmosphere:** [surface/texture summary — e.g., subtle grain textures, glass cards, generous whitespace]
> **UX Patterns:** [Nav type], [Loading strategy], [Error approach], [Motion character]
>
> Ready to document this in `{{specs_dir}}/design_system.md`?"

## Step 9: Suggest Next Step

After successfully writing the design system document, ask what should be the next workflow step:

```json
{
  "questions": [{
    "question": "What would you like to do next?",
    "header": "Next step",
    "options": [
      {
        "label": "Design architecture",
        "description": "Translate these requirements into technical architecture decisions"
      },
      {
        "label": "Create tasks",
        "description": "Break product/architecture/UX down into tasks"
      }
    ],
    "multiSelect": false
  }]
}
```

**Handle the response:**

- **Design architecture**: Invoke the `groundwork:architecture` skill to design the technical approach
- **Create tasks**: Invoke the `groundwork:tasks` skill to create a list of executable tasks

---

## Decision Record Format

Each decision follows a lightweight format:

```markdown
### [PREFIX]-NNN: [Decision Title]

**Status:** Accepted
**Date:** YYYY-MM-DD
**Context:** [Why this matters for this product]

**Decision:** [What was decided]

**Rationale:** [Why, referencing context or other decisions]
```

**Prefixes:**
- `DP-NNN` - Design Principles
- `BRD-NNN` - Brand Identity decisions
- `UXD-NNN` - UX Pattern decisions

---

## Reference Files

- `references/design-system-template.md` - Template for design system document
- `references/color-examples.md` - Color strategy approaches and reference palettes
- `references/color-and-contrast-guide.md` - OKLCH, tinted neutrals, dark mode strategy, dangerous color combinations
- `references/typography-examples.md` - Example type systems and font pairings
- `references/typography-guide.md` - Vertical rhythm, fluid type, font loading, OpenType features
- `references/pattern-examples.md` - Example UX patterns
- `references/interaction-design-guide.md` - Eight states, focus management, touch targets, native elements
- `references/motion-design-guide.md` - Timing rules, easing, perceived performance, reduced motion
- `references/spatial-design-guide.md` - 4pt grid, semantic tokens, container queries, optical adjustments
- `references/ux-writing-guide.md` - Button labels, error formulas, empty states, terminology, text expansion
- `references/layout-architecture-guide.md` - Section geometry, scroll architecture, navigation, content choreography, typography as architecture (~35 patterns)
- `references/layout-examples.md` - 7 curated strategy bundles combining layout patterns into coherent layouts
