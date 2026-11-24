---
name: ux-design
description: Create design system with foundations, brand identity, and UX patterns for web, TUI, or mobile app surfaces.
argument-hint: "[product-name]"
allowed-tools: ["Read", "Edit", "Write", "Glob", "Grep", "Task", "Skill"]
disable-model-invocation: true
---

# Design System Skill

Establishes a complete design system through guided collaboration: foundations, brand identity, and UX patterns.

**Accessibility standard:** Design to the bar your patterns will be reviewed against. Treat `${CLAUDE_PLUGIN_ROOT}/references/checklists/accessibility.md` as the WCAG 2.1 AA standard your color choices, components, focus behavior, and patterns must meet — the same checklist `design-consistency-checker` enforces.

**Anti-slop standard:** Real content or clearly-labeled placeholders, working controls, and no unreasoned default shapes. Treat `${CLAUDE_PLUGIN_ROOT}/references/checklists/design-slop.md` as the catalog of fabricated-content and default-shape patterns the design system must steer implementations away from — the same checklist `design-consistency-checker` reviews against.

**Modality standard:** Design for the declared modality — **web** (default), **tui**, or **mobile app**. Resolve it at Step 0b and record it in the design system header. Steps 3–8 below state web defaults; the per-modality guides (`${CLAUDE_PLUGIN_ROOT}/references/design-system/tui-design-guide.md`, `${CLAUDE_PLUGIN_ROOT}/references/design-system/mobile-design-guide.md`) override them where the modality differs. The accessibility bar is the WCAG core plus the matching modality dialect in the accessibility checklist.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.** Skip this step silently if effort is `high`, `xhigh`, or `max` (the scale is `low` < `medium` < `high` < `xhigh` < `max`, so `xhigh` and `max` are already above `high`) AND you are Opus (1M context). Otherwise ask via `AskUserQuestion` (header "Model check"; options "Continue anyway" / "Cancel — I'll switch first"):

> "Do you want to switch? Creative and analytical synthesis — resisting generic defaults requires active judgment.
>
> Recommended: Opus (1M context) at high effort.
>
> To switch: cancel, run `/model opus[1m]` and `/effort high`, then re-invoke this skill."

If the user selects "Cancel — I'll switch first": output the switching commands and stop. Do not proceed with the skill. Ask once per conversation: a skill invoked by another skill skips this step when the recommendation was already shown. In a non-interactive run (`--noninteractive`, `GROUNDWORK_RUNNER_MODE=true`, or `GROUNDWORK_BATCH_MODE=true`), skip the prompt and continue on the current model.

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
  - `{{specs_dir}}/wireframes.html` (screen-by-screen wireframes of the app's experiences, Step 8c)
- **Design exploration (retained):**
  - `{{specs_dir}}/proposed-designs/design-comparison.html` (color/font comparison, kept as record of the identity choice)
  - `{{specs_dir}}/proposed-designs/atmosphere-comparison.html` (atmosphere comparison, kept as record of the atmosphere choice)
  - `{{specs_dir}}/proposed-designs/layout-comparison.html` (layout architecture comparison, kept as record of the layout choice)
  - `{{specs_dir}}/proposed-designs/pattern-showcase.html` (complete system preview, kept as the pre-documentation reference)

  Comparison and showcase artifacts are generated **directly into `{{specs_dir}}/proposed-designs/`** and never deleted — they are the visual evidence behind the decision log. Files in `proposed-designs/` reflect the options as they were when the decision was made; they are historical proposals, not the current system (that's `design_system.md` + `ux-preview.html`).

## Step 0: Resolve Project Context

1. **Monorepo check:** Does `.groundwork.yml` exist at the repo root?
   - If yes → Is `{{project_name}}` non-empty?
     - If empty → Invoke `Skill(skill="groundwork:select-project")` to select a project, then restart this skill.
     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.
   - If no → Continue (single-project repo).
2. **CWD mismatch check (monorepo only):** skip it when the project was just selected or the invocation carried an explicit `--project`.
   - Compare CWD against the project paths in `.groundwork.yml`: the repo root or the selected project's path → fine, proceed; no project's path → proceed without warning (shared directory).
   - A different project's path → with `--noninteractive`, keep the selected project and continue; otherwise warn via `AskUserQuestion`:
     > "You're working from `<cwd>` (inside **[cwd-project]**), but the selected Groundwork project is **[selected-project]** (`[selected-project-path]/`). What would you like to do?"
     > - "Switch to [cwd-project]"
     > - "Stay with [selected-project]"
     If the user switches, invoke `Skill(skill="groundwork:select-project")`.
3. **Check `{{specs_dir}}/`:** Does a specs directory exist?
   - If yes → Proceed normally.
   - If no → Ask the user: "Is this a single-project repo or a monorepo with multiple projects?"
     - **Single project** → Proceed normally (specs will be created at `{{specs_dir}}/`).
     - **Monorepo** → Invoke `Skill(skill="groundwork:setup-repo")` to create `.groundwork.yml`, then continue.

## Step 0b: Resolve Modality

Determine which surface this design system targets — this parameterizes Steps 3–8.

1. **Detect from architecture:** Read `{{specs_dir}}/architecture.md` (and the PRD if needed) for the UI stack:
   - **tui** — Textual, Bubble Tea/Lip Gloss, Ratatui, Ink, tview, curses/ncurses, or a terminal rendering package
   - **mobile** — SwiftUI, Jetpack Compose, React Native, Flutter, Expo, Kotlin Multiplatform
   - **web** — React/Vue/Svelte/Angular/HTML+CSS/Next (or no UI stack declared)
2. **Confirm:** If detection is ambiguous or the product targets multiple surfaces, ask via `AskUserQuestion` which surface is primary. For mobile, confirm target platforms and native vs cross-platform from the architecture doc; ask only if it doesn't say.
3. **Declare:** The modality is written into the `{{specs_dir}}/design_system.md` header (`Modality: web | tui | mobile`) — `design-consistency-checker` and `design-task-alignment-checker` read it to select their review dialect.
4. **Load the track guide:** `tui` → `${CLAUDE_PLUGIN_ROOT}/references/design-system/tui-design-guide.md`; `mobile` → `${CLAUDE_PLUGIN_ROOT}/references/design-system/mobile-design-guide.md`; `web` → none (this document is the web track). Where a guide gives modality-specific rules, the guide wins over the web defaults below.

## Prerequisites

Check for PRD first. Look for `{{specs_dir}}/product_specs.md` (single file) or `{{specs_dir}}/product_specs/` (directory). If neither exists, prompt user to run `/groundwork:design-product` first.

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
> 3. Surface scope — web: mobile-first, desktop-first, or balanced? tui: target terminals, minimum color support (16/256/truecolor), alt-screen vs inline? mobile: target platforms, phone/tablet/foldable?"

Move on quickly after gathering constraints.

### Step 2: Propose Design Principles

Based on context, propose principles and explain why. One principle should address **visual identity and aesthetic commitment** — not as decoration, but as a functional design value.

Also derive a **tonal direction** from the PRD's persona and vision, as defined under Design Philosophy above.

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

**Modality check:** the token categories below are the **web defaults**. For `tui`, the vocabulary is color slots / text styles / cell spacing / borders / glyphs — `tui-design-guide.md` → Tokens. For `mobile`, it is logical units (pt/dp) / touch targets / safe areas / system text styles — `mobile-design-guide.md` → Tokens. The primitive→semantic two-layer principle applies to every modality.

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

See `${CLAUDE_PLUGIN_ROOT}/references/design-system/spatial-design-guide.md` for full spatial system rationale (4pt grid, optical adjustments, container queries).

Present as a cohesive system. Only adjust if user has concerns.

---

## Phase 2: Brand Identity

### Step 4: Propose Identity Options

Before proposing options, confirm the **tonal direction** established in Step 2. Each option should be a genuine exploration of that direction (or a deliberate contrast if offering range), not a convergence on "clean professional minimal."

Propose 2-4 complete visual identity options, each pairing a color strategy with typography that suits its personality. Draw from the product context, personas, and design principles.

**Color System Guidance:**
- **Modality first:** for `tui`, every option must state its palette strategy (semantic ANSI slots / truecolor brand / hybrid with fallback map) and the comparison renders against light and dark reference themes — `tui-design-guide.md` → Palette Strategy. For `mobile`, every option states its brand-vs-platform posture and ships dark-mode variants in the comparison — `mobile-design-guide.md` → The Identity Decision. OKLCH applies to fixed-RGB palettes; pure ANSI-slot strategies don't need it.
- **Use OKLCH color space** for palette generation — perceptually uniform (unlike HSL where "50% lightness" varies wildly across hues). Define palettes in OKLCH, output hex/RGB for implementation.
- **Tinted neutrals:** Never use pure gray. Add a subtle brand hue to the neutral scale (chroma ~0.01 in OKLCH). Creates warmth and cohesion without visible color.
- **Never pure black or white:** `#000000` and `#ffffff` don't exist in nature. Use tinted near-black/near-white from the neutral scale.
- **60-30-10 visual weight:** Neutral surfaces 60%, secondary/structural color 30%, accent 10%. Accent works because it's rare.
- **Alpha is a design smell:** If using `rgba()` or `opacity` for color variations, the palette is incomplete. Define explicit tokens for every needed shade.

See `${CLAUDE_PLUGIN_ROOT}/references/design-system/color-and-contrast-guide.md` for dangerous color combinations, dark mode strategy, and the two-layer token approach.

**Anti-pattern warnings:**
- Do not propose options where all use the same font family
- Do not copy palettes from famous brands (see "Colors to Avoid as Primary" in color reference)
- Do not let all options converge on the same personality — if they all feel "clean and minimal," the exercise failed
- At least one option should use a characterful or unexpected font pairing
- For `tui`, each option's "Fonts:" line becomes "Text styles:" (the bold/dim/reverse ramp — tui guide → Typography); for `mobile`, it becomes the type-ramp decision (system Dynamic Type vs custom family — mobile guide → Typography)

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

Generate `{{specs_dir}}/proposed-designs/design-comparison.html` — a self-contained file that renders identical UI components under each candidate identity option, side-by-side, with a decision helper table.

Build it to the **Visual comparison** spec in `HTML-GENERATORS.md`.

**After generating:**

> "I've generated the visual comparison at `{{specs_dir}}/proposed-designs/design-comparison.html`. Open it in your browser to see the identity options side-by-side."

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

Type scale based on chosen body font (web default — `tui`: the text-style ramp; `mobile`: system text styles + optional brand family that scales with Dynamic Type; see the modality guides → Typography):

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
- **Fewer sizes, more contrast:** A 5-size system with clear visual steps beats 8 muddy-close sizes. Use a modular scale ratio (1.25 major third, 1.333 perfect fourth) — see `${CLAUDE_PLUGIN_ROOT}/references/design-system/typography-examples.md`.
- **Measure:** Set `max-width: 65ch` on body text containers for optimal readability.
- **Fluid type for display, fixed for UI:** Use `clamp()` for hero/display text. Use fixed `rem` for app UI and controls — they need predictable sizing.
- **Font loading:** Always use `font-display: swap` and metric-matched fallback stacks to prevent layout shift.
- **16px minimum body text** — anything smaller is an accessibility issue on mobile.

See `${CLAUDE_PLUGIN_ROOT}/references/design-system/typography-guide.md` for OpenType features, dark mode typography adjustments, and font selection anti-patterns.

Keep `{{specs_dir}}/proposed-designs/design-comparison.html` as the record of the identity decision — link it from the BRD decision entry (e.g., "See `proposed-designs/design-comparison.html` for rejected options").

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

See `${CLAUDE_PLUGIN_ROOT}/references/design-system/ux-writing-guide.md` for the full UX writing framework.

---

## Phase 3: UX Patterns

### Step 7: Define Patterns and Atmosphere

Derive from architecture + PRD (minimal questions needed). This step has four phases: propose patterns and atmosphere candidates (7a), visually compare atmosphere options (7b), decide the layout architecture (7c), and showcase the complete system (7d).

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

**Modality pattern sets:** The six pattern categories above apply to every modality, but their content differs — replace the web defaults (breakpoints, toast/banner layering, hover) with:

- **tui** — Navigation: panes + keybindings + command palette. Loading: pane-chrome spinners/progress. Errors: status line vs log pane. Empty: per-pane designed states. Forms: line-editing vs key-driven. Responsive: the degradation ladder (full → collapsed → single pane → line mode) with an 80×24 floor. Motion: spinner/progress discipline only. Per the tui guide (`tui-design-guide.md`): Layout & Screen Architecture, Interaction, Motion.
- **mobile** — Navigation: tab bar / stack / sheet architecture (the primary UXD). Loading: skeleton or system progress + designed offline states. Errors: inline and non-blocking. Forms: keyboard-aware layout. Responsive: adaptive layout for tablet/foldable. Motion: platform conventions, Reduce Motion honored. Per the mobile guide (`mobile-design-guide.md`): Navigation & Layout, Interaction & Motion, App-Specific Patterns.

**Motion Design Principles (inform atmosphere choice):**
- **100/300/500 rule:** Instant feedback 100-150ms, state transitions 200-300ms, layout shifts 300-500ms, entrances 500-800ms.
- **Exit faster than enter:** Exit animations at ~75% of entrance duration.
- **Exponential easing only:** Use ease-out-quart/quint/expo for natural motion. Never linear (mechanical), never bounce/elastic (dated) unless tonal direction demands it.
- **Only animate `transform` and `opacity`** — everything else triggers layout recalculation and jank.
- **Reduced motion is not optional:** 35% of adults 40+ affected. Use `prefers-reduced-motion` to preserve functional animations while removing decorative spatial movement.
- **Stagger cap:** Cap total stagger time regardless of item count (~400ms max).

See `${CLAUDE_PLUGIN_ROOT}/references/design-system/motion-design-guide.md` for perceived performance techniques, grid-template-rows height animation, and the 80ms perception threshold.

**Interaction Design Principles (apply across all patterns):**
- **Eight interactive states:** Every interactive element must define: default, hover, focus, active, disabled, loading, error, success. Undefined states get improvised during implementation.
- **Focus via `:focus-visible`** — show focus rings for keyboard, suppress for mouse. Rings need 3:1 contrast, 2-3px width, offset from element.
- **Validate on blur, not keystroke** (except password strength meters).
- **Undo over confirm dialogs** — users click through confirmations without reading. Provide undo for reversible actions instead.
- **Touch targets 44px minimum** — even if the visual element is smaller, the tap area must be 44px.

The eight-state model and `:focus-visible` guidance above are web-shaped: for `tui`, states recast to selected/focused/dim with no hover and keyboard-only as the floor (tui guide → Interaction); for `mobile`, use platform a11y-focus semantics and the 44pt/48dp target floor (mobile guide → Tokens, Interaction).

See `${CLAUDE_PLUGIN_ROOT}/references/design-system/interaction-design-guide.md` for roving tabindex, skip links, native dialog/popover usage, and gesture discoverability.

**Handle Feedback:**
- User agrees with functional patterns → Document as UXD-001 through UXD-00N, proceed to 7b
- User questions a pattern → Explain reasoning, adjust if needed
- User has strong atmosphere preference already → Skip 7b, go to 7c (the layout decision still needs making)

#### Step 7b: Generate Atmosphere Comparison (`{{specs_dir}}/proposed-designs/atmosphere-comparison.html`)

Generate a self-contained HTML file that renders the same identity (colors, fonts) under each atmosphere direction side-by-side, with mini page layouts showing how each atmosphere *feels* in practice. In every modality the mock must double as an implementation reference — token names and values visible in the file, not just visual impressions: for `tui`, terminal-frame mocks (monospace grid, token + hex + ANSI-fallback values, 80×24 plus one degraded size, light/dark variants); for `mobile`, phone-frame mocks at the smallest supported width, dp-annotated, with dark variants. See the modality guides → Comparison & Preview Artifacts.

Build it to the **Atmosphere comparison** spec in `HTML-GENERATORS.md`.

**After generating:**

> "Open `{{specs_dir}}/proposed-designs/atmosphere-comparison.html` to see the atmosphere directions side-by-side. Same identity in every column — different feel."

**Handle evaluation feedback:**
- User picks a winner → Document as UXD decisions (linking `proposed-designs/atmosphere-comparison.html` for the rejected directions), proceed to 7c
- User wants tweaks → Regenerate with adjustments
- User likes elements from multiple → Regenerate a mixed option

#### Step 7c: Propose Layout Architecture + Generate Comparison (`{{specs_dir}}/proposed-designs/layout-comparison.html`)

**Web-specific step — adapt for tui/mobile:** scroll choreography has no tui/mobile equivalent; run this step as a **screen architecture comparison** instead — `tui`: pane-layout + degradation-ladder candidates; `mobile`: navigation-architecture (tab/stack/sheet) candidates. Same file mechanics (data-driven, single render function, decision helper table).

Based on tonal direction, product type, and atmosphere choice, propose 2-3 layout architecture strategies. Each strategy is a coherent bundle of spatial decisions combining:

- **Section geometry** — how sections relate spatially (variable widths, diagonal breaks, rounded stacking, asymmetric splits)
- **Scroll architecture** — what happens as user scrolls (scroll-scrubbed, parallax, pin-and-reveal, sticky cascade, standard vertical)
- **Content hierarchy approach** — what dominates visually (image-first, type-dominant, data-dense, balanced)
- **Navigation architecture** — how nav behaves beyond its type (migratory, dual-layer, embedded hero, content-push, navigation by absence)

See `${CLAUDE_PLUGIN_ROOT}/references/design-system/layout-architecture-guide.md` for the full pattern library (36 patterns: selection table, compatibility matrix, when to use, accessibility and combination warnings — no code) and `${CLAUDE_PLUGIN_ROOT}/references/design-system/layout-examples.md` for curated strategy bundles showing how patterns combine (its Bundle Selection Guide is at the top). The CSS/JS implementation of each pattern is in `${CLAUDE_PLUGIN_ROOT}/references/design-system/layout-techniques.md` under the same section number.

**Each proposed strategy should:**
- Be derived from tonal direction + product type + atmosphere choice (not arbitrary)
- Reference a curated bundle from `layout-examples.md` as starting point, adapted to this product
- Name the specific patterns from `layout-architecture-guide.md` being combined
- Be described in ~5 sentences covering section geometry, scroll behavior, content hierarchy, nav behavior, and page rhythm
- Note the complexity tier (CSS-only / JS-light / JS-heavy)

**Generate a visual comparison file** before presenting the choice. This file renders each proposed layout strategy as a mini page preview so the user can see spatial feel, section geometry, scroll hints, and nav behavior — not just read descriptions.

Build it to the **Layout comparison** spec in `HTML-GENERATORS.md`. A JS-light or JS-heavy strategy's miniature scroll animation takes its CSS/JS from `${CLAUDE_PLUGIN_ROOT}/references/design-system/layout-techniques.md` (same section numbers as the guide).

**Tell the user** to open `{{specs_dir}}/proposed-designs/layout-comparison.html` in their browser, then present the choice:

**Present via AskUserQuestion:**
```json
{
  "questions": [{
    "question": "I've generated a visual comparison at {{specs_dir}}/proposed-designs/layout-comparison.html — open it in your browser to see each strategy rendered. Which layout architecture fits your product best?",
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

#### Step 7d: Generate Pattern Showcase (`{{specs_dir}}/proposed-designs/pattern-showcase.html`)

Generate a single-page preview of the complete finalized system — identity + chosen atmosphere + all functional patterns in one responsive page. This is NOT a comparison — one full-width layout showing how everything works together. For `tui`/`mobile`, the showcase demonstrates the chosen screen architecture (pane layout / navigation architecture) in the modality's mock form.

Build it to the **Pattern showcase** spec in `HTML-GENERATORS.md`. Take the CSS/JS for each chosen layout pattern from `${CLAUDE_PLUGIN_ROOT}/references/design-system/layout-techniques.md` — same section numbers as `layout-architecture-guide.md`, which holds decisions only.

**After generating:**

> "Open `{{specs_dir}}/proposed-designs/pattern-showcase.html` to see the complete system in action. Scroll through and hover over elements to feel the interaction character."

**Handle evaluation feedback:**
- User approves → Proceed to Step 8
- User wants adjustments → Regenerate with changes
- User spots conflict between patterns → Adjust pattern, regenerate

---

## Step 8: Document Design System

Present the complete system for a final confirmation before anything is written:

> "Here's the complete design system:
>
> **Foundations:** [N] design principles, WCAG [level], token system
> **Brand:** [Primary color], [Font], [Voice tone]
> **Tonal Direction:** [specific direction — e.g., warm editorial, brutally minimal]
> **Visual Atmosphere:** [surface/texture summary — e.g., subtle grain textures, glass cards, generous whitespace]
> **UX Patterns:** [Nav type], [Loading strategy], [Error approach], [Motion character]
>
> Ready to document this in `{{specs_dir}}/design_system.md`?"

**Handle the response:**
- User approves → Write the document below
- User wants a change → Return to the step that owns it (tokens: Step 3; identity: Step 4 or 5; patterns or atmosphere: Step 7), regenerate what that step shows, and present this summary again

On approval, create `{{specs_dir}}/design_system.md` using template in `${CLAUDE_PLUGIN_ROOT}/references/design-system/design-system-template.md`. Record the resolved modality in the document header — the template's modality notes and the per-modality guides override its web defaults.

Populate all six sections of the template:
1. **Design Foundations** (§1) - DP-NNN principles, accessibility level, token categories
2. **Brand Identity** (§2) - Color system, typography, logo usage, voice, visual atmosphere
3. **UX Patterns** (§3) - Navigation, loading, errors, empty states, forms, responsive, motion, spatial composition, layout architecture
4. **Component Guidelines** (§4) - The components this product needs, each mapped to the decisions that shape it
5. **Decision Log** (§5) - Every DP-, BRD-, and UXD- decision, in the Decision Record Format below
6. **Open Questions & Risks** (§6) - What this pass left unresolved

`{{specs_dir}}/proposed-designs/pattern-showcase.html` stays in place — it is the pre-documentation reference showing the system as approved in 7d.

### Step 8b: Generate UX Preview (`{{specs_dir}}/ux-preview.html`)

After writing `{{specs_dir}}/design_system.md`, generate a persistent visual reference from the finalized documented decisions. This is similar in structure to the pattern-showcase but serves as a developer reference — it includes token names, hex values, and font names alongside the visual demonstrations. For `tui`/`mobile`, follow the modality guide's preview-artifact spec so the file works as an implementation reference (token names, color values with ANSI/dp annotations, cell/device dimensions).

Build it to the **UX preview** spec in `HTML-GENERATORS.md`.

**After generating:**

> "I've also generated `{{specs_dir}}/ux-preview.html` — a visual reference for the design system. Open it anytime to see how the system looks and feels."

### Step 8c: Generate App Wireframes (`{{specs_dir}}/wireframes.html`)

The system-level artifacts show *how components look and behave*; this step shows *how the app composes them* — a wireframe of every screen the product's experience consists of, rendered with the finalized design system. This is where pattern gaps surface: compositing patterns onto real screens exposes states nobody defined (a settings screen needs a destructive-action pattern, a list screen needs bulk selection).

**Modality check:** web defaults below. For `tui`, each screen is a terminal-frame mock per the tui guide; for `mobile`, a phone-frame mock per the mobile guide — see `Comparison & Preview Artifacts` in the modality guides.

**1. Derive the screen inventory from the PRD and architecture:**
- Personas + features/EARS requirements → the screens that make up each experience (onboarding, home/dashboard, core feature screens, settings, …)
- Architecture doc → surface constraints that split or merge screens
- Every screen gets its **primary state** (happy path). Screens on primary flows also get their **key variant states** — empty, loading, error — applying the pattern decisions from Step 7
- Cap the first pass at ~8–12 screens; note anything deferred

**2. Confirm the inventory** via `AskUserQuestion` before generating — let the user add missing screens, drop low-priority ones, or trim variant states.

**3. Generate a single self-contained `{{specs_dir}}/wireframes.html`** — hi-fi, rendered with the documented tokens (not grayscale boxes). The value is flow and layout composition: it is the screen-by-screen reference to point task authors and implementers at when a task touches a screen. Build it to the **App wireframes** spec in `HTML-GENERATORS.md`.

**Maintenance:** `{{specs_dir}}/wireframes.html` is regenerated whenever the design system changes, same as `ux-preview.html` (`source-ux-design-from-code` does both).

**After generating:**

> "Open `{{specs_dir}}/wireframes.html` to walk through every screen of the app — use the switcher to move between flows and states."

**Handle evaluation feedback:**
- User spots a missing screen → add it to the screens array, regenerate
- User spots a pattern gap (a state or interaction no pattern covers) → record it as a UXD decision in `{{specs_dir}}/design_system.md`, regenerate
- User wants layout changes → adjust the affected screen entries, regenerate

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

- **Design architecture**: Invoke the `groundwork:design-architecture` skill to design the technical approach
- **Create tasks**: Recommend the user run `/groundwork:create-tasks` (a user-run skill) to create a list of executable tasks, and stop

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

- `${CLAUDE_PLUGIN_ROOT}/references/design-system/design-system-template.md` - Template for design system document
- `${CLAUDE_PLUGIN_ROOT}/references/design-system/color-examples.md` - Color strategy approaches and reference palettes
- `${CLAUDE_PLUGIN_ROOT}/references/design-system/color-and-contrast-guide.md` - OKLCH, tinted neutrals, dark mode strategy, dangerous color combinations
- `${CLAUDE_PLUGIN_ROOT}/references/design-system/typography-examples.md` - Example type systems and font pairings
- `${CLAUDE_PLUGIN_ROOT}/references/design-system/typography-guide.md` - Vertical rhythm, fluid type, font loading, OpenType features
- `${CLAUDE_PLUGIN_ROOT}/references/design-system/pattern-examples.md` - Example UX patterns
- `${CLAUDE_PLUGIN_ROOT}/references/design-system/interaction-design-guide.md` - Eight states, focus management, touch targets, native elements
- `${CLAUDE_PLUGIN_ROOT}/references/design-system/motion-design-guide.md` - Timing rules, easing, perceived performance, reduced motion
- `${CLAUDE_PLUGIN_ROOT}/references/design-system/spatial-design-guide.md` - 4pt grid, semantic tokens, container queries, optical adjustments
- `${CLAUDE_PLUGIN_ROOT}/references/design-system/ux-writing-guide.md` - Button labels, error formulas, empty states, terminology, text expansion
- `${CLAUDE_PLUGIN_ROOT}/references/design-system/layout-architecture-guide.md` - Layout pattern decision guide (no code): selection table, compatibility matrix, then section geometry, scroll architecture, navigation, content choreography, content hierarchy, spatial techniques, typography as architecture (36 patterns)
- `${CLAUDE_PLUGIN_ROOT}/references/design-system/layout-techniques.md` - CSS/JS implementation of the same 36 patterns, under the guide's section numbers; read when building the layout comparison or the showcase
- `${CLAUDE_PLUGIN_ROOT}/references/design-system/layout-examples.md` - Curated strategy bundles combining layout patterns into coherent layouts, with a selection guide
- `HTML-GENERATORS.md` (beside this skill) - Build specs for the six HTML artifacts: the comparisons, the showcase, the preview, the wireframes
- `${CLAUDE_PLUGIN_ROOT}/references/design-system/tui-design-guide.md` - TUI track: palette strategy, cell tokens, screen architecture, TUI accessibility, terminal-frame mocks
- `${CLAUDE_PLUGIN_ROOT}/references/design-system/mobile-design-guide.md` - Mobile track: brand-vs-platform, pt/dp tokens, navigation architecture, mobile accessibility, phone-frame mocks
