# Design Slop Review Checklist

Criteria for detecting generic "AI slop" in generated UI and copy: the default shapes, fabricated content, and copy tells that mark output as machine-generated. Read by the `ux-design` skill (design to avoid these) and the `design-consistency-checker` agent (review against them).

This checklist is **direction-independent**: it applies with and without a `design_system.md`. It is a filter, not a style guide — no colors, fonts, or layouts are prescribed, and no technique is banned outright. Project-specific decisions (palette, typography, layout patterns) come from the project's `design_system.md`; WCAG criteria live in `checklists/accessibility.md` and are not repeated here. Distilled from [anti-slop](https://github.com/miqdadbadjuber/anti-slop) (MIT).

## How to apply

- **Clusters, not isolated tells.** A single gradient or one generic label proves nothing. Slop is many defaults appearing together with no reason. Flag clusters; mention isolated instances only as supporting evidence.
- **Purpose test.** Every Group B technique is allowed when it serves a stated hierarchy, identity, or readability goal. The failure is the *default without a reason* — never flag a deliberate choice documented in the design system or the tonal direction.
- **Severity mapping.** Group A findings are **critical** (honesty and function defects). Group B/C findings are **minor** individually, escalating to **major** when clustered or when they define the composition of a whole page.

## Group A — Honesty & Function (critical)

Fabricated or broken content that misleads, whatever the aesthetics:

- [ ] Numbers without a real source: dashboard stat cards with invented values, "+12% this week" deltas with no comparison period, "10K+ users", "99.9% uptime"
- [ ] Invented people: fabricated testimonials (AI avatars, random names and job titles), filler activity feeds ("Sarah Chen updated a document"), John-Doe data in tables and forms presented as real
- [ ] Fabricated trust and compliance claims: "SOC 2 compliant", "ISO 27001", "enterprise-grade security", unverifiable performance claims ("300% faster")
- [ ] Assets invented without instruction and not clearly labeled as placeholders: logos, avatars, profile photos. Placeholders must read as placeholders: `[LOGO]`, `[REAL DATA]`, "Coming soon", "Your Name"
- [ ] Ghost navigation: navbar or footer links to pages and sections that do not exist
- [ ] Dead controls: buttons, dropdowns, tabs, and forms with no behavior and no visible "Coming soon" label
- [ ] Charts without a question: placed to fill space, generic titles ("Overview", "Performance"), no axis the reader can act on

An empty section, an honest placeholder, or a removed control is always better than a fabricated one.

## Group B — Default Shapes (minor; major when clustered)

The shapes generated UI reaches for by default. Each is allowed with a purpose; flag it when it appears as the unreasoned default:

**Visual & color:** blue-purple / blue-cyan gradient family as the primary treatment · glassmorphism on every surface · glow on cards + buttons + badges at once · everything pill-shaped · every component floating in soft shadow · background grids, dot patterns, blueprint lines · one accent color spread across everything · 5+ colors with no system

**Layout templates:** the hero + 2 CTAs + feature grid + testimonials + FAQ + CTA + footer order · identical copy-paste feature cards · bento-grid mosaic as the default section · styled fake terminal window as the hero visual · "How It Works" always exactly 3 numbered steps · "Trusted By" logo bar with generic logos · exactly 3 pricing tiers with the middle highlighted · 4-column template footer (Product / Company / Resources / Legal) · every section the same centered-title + card-grid composition

**Decorative elements:** generic AI icons (sparkle, star, lightning, robot, orb) · the uniform single-library icon look (thin-stroke rounded set) chosen for the library, not the content · arrows (→ / ↗) on every button · capsule badges ("AI Powered", "Beta") marking nothing · pulsing status dots beside headings that track no state · monospace headings and uppercase wide-tracked labels as a "technical" costume · stock illustrations unconnected to the product

**Dashboard shapes:** sidebar + top bar + four stat cards + a chart + a table, chosen before asking what the screen is for · table columns (Name / Status / Date / Actions) from the component rather than the decision the user makes · empty/loading/error states that say nothing ("No data available" with no cause and no next action)

## Group C — Copy Tells (minor; clusters)

Prose patterns that mark text as machine-written. Button labels, error formulas, and empty-state copy are owned by `design-system/ux-writing-guide.md`; these are the tells beyond them:

- **Empty vocabulary:** unlock, elevate, empower, delve, seamless, cutting-edge, revolutionary, game-changer (see the guide's "AI-trade-show voice" list)
- **Significance inflation:** "the future of X", "a pivotal moment", "ushering in a new era"
- **Weasel attribution:** "experts say", "industry observers" with no one named
- **Chatbot artifacts:** "I hope this helps", "Let me know if you have questions" pasted into deliverables
- **Signposting:** "Let's dive in", "Here's what you need to know" instead of the content
- **Actorless passive by default:** "the decision was made to..." where the actor was available to name
- **Rhythm formulas:** forced rule-of-three, "not just X, it's Y", staccato fragment runs, "from X to Y" false ranges, synonym cycling to avoid repeating the clearest word

## What NOT to flag

- A deliberate choice documented in `design_system.md` or the tonal direction — bold palettes and unusual typefaces are identity, not slop
- Popular fonts (Inter, Geist) or a gradient *used with a stated reason*
- Isolated tells without a cluster: polished grammar, formal vocabulary, a single "however"
- Quoted material, titles, and proper names being discussed rather than used
- Demo content inside artifacts that are themselves placeholders (design comparisons, pattern showcases, previews) — slop criteria target product surfaces
