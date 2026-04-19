# Typography Examples

Reference type systems organized by personality and pairing strategy — not by industry defaults.

## Font Pairing Strategies

### 1. Single Family (Characterful)

Use one versatile font family with multiple weights. Choose one with personality — not the most common option on the internet.

**Pros:** Consistent feel, simpler loading, fewer decisions
**Cons:** Less visual variety

**Warning:** Avoid defaulting to Inter, Roboto, or Open Sans. These are fine fonts but they are everywhere — choosing them signals "we didn't think about typography." If the product genuinely needs maximum neutrality, choose it deliberately and document why.

**Characterful alternatives by personality:**

| Font | Personality | Best For |
|------|-------------|----------|
| **Space Grotesk** | Technical, geometric, slightly quirky | Dev tools, data products |
| **Plus Jakarta Sans** | Warm geometric, friendly precision | SaaS, productivity |
| **DM Sans** | Clean optical sizing, subtly distinctive | Dashboards, content apps |
| **Outfit** | Modern humanist, open and confident | Consumer, brand-forward |
| **Nunito Sans** | Rounded, approachable, soft | Health, community, education |
| **Albert Sans** | Geometric with personality, slightly wide | Marketing, creative tools |
| **General Sans** | Contemporary, balanced, editorial | Magazines, portfolios |
| **Satoshi** | Modern geometric, slight retro feel | Design tools, creative apps |
| **Sora** | Futuristic, geometric, clean | Tech, innovation-forward |
| **Figtree** | Friendly geometric, open counters | Apps, consumer products |

**The move in practice:** Linear's use of Inter Display + Inter Variable is the most-copied version — one family, multiple optical sizes, ultra-tight tracking, heavy weight contrast, zero ornament. The "trying to be Linear" warning isn't about Inter itself; it's about that *execution*. Personality comes from proportions and tracking, never from a second typeface.

### 2. Sans + Serif Pair

Sans for UI, serif for content/headings — or vice versa for editorial products.

**Pros:** Visual hierarchy, editorial feel, strong contrast
**Cons:** More complex, potential clashes if personalities conflict

**Distinctive pairings:**

| Heading | Body | Character |
|---------|------|-----------|
| **Fraunces** | Outfit | Warm, old-style meets modern — editorial warmth |
| **Syne** | Inter Tight | Experimental, geometric tension — creative/art |
| **Bitter** | Karla | Sturdy slab + open sans — trustworthy yet friendly |
| **Crimson Pro** | Plus Jakarta Sans | Classical elegance + modern clarity — premium |
| **Newsreader** | DM Sans | Editorial authority + clean UI — content-first |
| **Libre Caslon Text** | Space Grotesk | Traditional + technical — finance, legal with edge |
| **Cormorant Garamond** | Nunito Sans | High contrast elegance + softness — luxury/wellness |

**The move in practice:** serif earns its seat only in reading contexts — long-form essays, case studies, editorial headlines — while sans handles every interface surface. Apple's SF Pro + New York pairing is the purest version; dev-tool products (Stripe, Notion) use the same rule to avoid serifs on product UI where they'd slow scanning.

### 3. Display + Body

Distinctive display font for headings, neutral-but-interesting body font.

**Pros:** Strong brand identity, visual impact, memorable
**Cons:** Display fonts can fatigue, limit flexibility

**Bold pairings:**

| Display | Body | Character |
|---------|------|-----------|
| **Bebas Neue** | DM Sans | Tall condensed + clean — bold, editorial |
| **Unbounded** | Work Sans | Rounded display + neutral — playful tech |
| **Syne** | General Sans | Experimental + contemporary — creative studios |
| **Archivo Black** | Figtree | Heavy industrial + friendly — strong voice |
| **Dela Gothic One** | Nunito Sans | Thick, characterful + soft — playful contrast |
| **Space Mono** | Space Grotesk | Monospace display + geometric — dev/retro |
| **Instrument Serif** | Instrument Sans | Matched pair, elegant — editorial, luxury |

**The move in practice:** three families with strict roles (one heavy display for headlines, one monospace for code, one neutral sans for body). Sanity is the clearest example — no family ever appears outside its assigned role, which is what keeps three families from feeling like a ransom note.

### 4. Financial Clarity Pattern

Fintech typography is its own archetype: a clean geometric sans carries trust, large numerals dominate display, tabular figures enable column alignment, and one or two weights cover most of the system. Decorative display is avoided — the product's gravity comes from numbers rendered with confidence.

**The shared rules:**
- Custom or near-custom geometric sans across UI + marketing — a generic Inter reads as "integrated someone else's fintech API".
- `font-variant-numeric: tabular-nums` is mandatory anywhere a number might appear in a column.
- Tight tracking at large display sizes, engineered per optical size — balances rendered at 80px with default tracking look floaty.
- The number *is* the UI; labels are deliberately smaller and quieter so the eye lands on figures first.

Stripe is the canonical reference for the custom-family approach; Wise for the single-hue, figure-forward variant.

**Starter pairing:** Inter Tight (tabular) for UI + Fraunces or Source Serif 4 only in long-form editorial content. Weights 500/600 for balances, 400 for labels.

### 5. Cinematic Display Type (Automotive/Industrial)

Performance automotive and aerospace brands push display type to viewport-dominant sizes, often in condensed or italic cuts, often in all-caps, tracked tightly, sitting over full-bleed imagery. The type is architecture — the page is built around one or two huge words.

**The shared grammar:** one short declarative + one big image. Display runs at 96px+ with line-height 0.9–1.0 and tight tracking; body copy stays small so the display doesn't compete with itself. Apple's SF Pro product-page headers are the cleanest modern reference; condensed/italic cuts (Migra, Druk Condensed) carry the aggressive end of the archetype.

**Starter pairing:** a display cut with 1.8+ width contrast (e.g., Migra, Humane, or a condensed geometric like Tusker or Druk Condensed) + a neutral body sans (Inter, Söhne-like). Display sits at `clamp(3rem, 12vw, 10rem)`, body stays at 16-18px.

## Tonal Direction Recommendations

Map aesthetic direction to font strategy instead of industry to safe defaults.

| Tonal Direction | Strategy | Recommended Starting Points |
|-----------------|----------|----------------------------|
| **Brutally minimal** | Single family, tight tracking, heavy weight contrasts | Space Grotesk, Archivo, Instrument Sans |
| **Warm editorial** | Serif headings + humanist body | Fraunces + Outfit, Newsreader + DM Sans |
| **Retro-futuristic** | Mono or geometric display + geometric body | Space Mono + Space Grotesk, Syne + Inter Tight |
| **Organic warmth** | Rounded sans or soft serif | Nunito Sans, Figtree, Cormorant Garamond + Nunito Sans |
| **Quiet luxury** | High-contrast serif + refined sans | Cormorant Garamond + Plus Jakarta Sans, Instrument Serif + Instrument Sans |
| **Playful** | Rounded display + open body | Unbounded + Work Sans, Dela Gothic One + Nunito Sans |
| **Editorial** | Distinctive serif + clean sans | Crimson Pro + Plus Jakarta Sans, Libre Caslon Text + General Sans |
| **Brutalist** | Mono or condensed, raw weights | Bebas Neue + DM Sans, Space Mono + Sora |
| **Art deco** | Geometric display, elegant body | Poiret One + Raleway, Josefin Sans + Outfit |
| **Industrial** | Heavy, wide, utilitarian | Archivo Black + Figtree, Bebas Neue + Space Grotesk |
| **Geometric bold** | Strong geometric with character | Sora + DM Sans, Albert Sans + Space Grotesk |
| **Soft atmospheric** | Light weights, generous spacing | Outfit (300-400), Plus Jakarta Sans (300-400) |

## Type Scales

### Modular Scale (1.25 ratio - Major Third)

Good for traditional, readable interfaces.

| Token | Size | Relative |
|-------|------|----------|
| xs | 12px | 0.75rem |
| sm | 14px | 0.875rem |
| base | 16px | 1rem |
| lg | 20px | 1.25rem |
| xl | 25px | 1.563rem |
| 2xl | 31px | 1.953rem |
| 3xl | 39px | 2.441rem |
| 4xl | 49px | 3.052rem |

### Linear Scale (2px steps)

Good for dense, data-heavy interfaces.

| Token | Size | Use Case |
|-------|------|----------|
| xs | 10px | Tiny labels |
| sm | 12px | Secondary text |
| base | 14px | Body text |
| md | 16px | Emphasis |
| lg | 18px | Subheadings |
| xl | 20px | Section headers |
| 2xl | 24px | Page titles |
| 3xl | 32px | Hero text |

### Tailwind Default Scale

Widely adopted, good baseline.

| Token | Size | Line Height |
|-------|------|-------------|
| xs | 12px | 16px (1.33) |
| sm | 14px | 20px (1.43) |
| base | 16px | 24px (1.5) |
| lg | 18px | 28px (1.56) |
| xl | 20px | 28px (1.4) |
| 2xl | 24px | 32px (1.33) |
| 3xl | 30px | 36px (1.2) |
| 4xl | 36px | 40px (1.11) |
| 5xl | 48px | 48px (1.0) |

## Font Weight Usage

### Minimal Weight Strategy (Recommended)

Only load weights you actually use:

| Weight | Name | Typical Usage |
|--------|------|---------------|
| 400 | Regular | Body text, paragraphs |
| 500 | Medium | UI labels, buttons, navigation |
| 600 | Semibold | Headings, emphasis |

Avoid: 300 (Light), 700 (Bold), 800+ (Black) unless specifically needed.

### Full Weight Strategy

For editorial or marketing-heavy products:

| Weight | Usage |
|--------|-------|
| 300 | Large display text only |
| 400 | Body text |
| 500 | UI elements |
| 600 | Subheadings |
| 700 | Headlines |
| 800 | Hero text |

## Line Height Guidelines

| Content Type | Line Height | Reasoning |
|--------------|-------------|-----------|
| Body text (16px) | 1.5-1.6 | Comfortable reading |
| UI text (14px) | 1.4-1.5 | Compact but readable |
| Headlines (24px+) | 1.1-1.3 | Tight for visual weight |
| Code/mono | 1.5-1.7 | Readable with indentation |

## Letter Spacing

| Context | Tracking | Value |
|---------|----------|-------|
| All caps | Wider | +0.05em to +0.1em |
| Headlines | Tighter | -0.01em to -0.02em |
| Body text | Normal | 0 |
| Small text | Wider | +0.01em |

## Performance Considerations

### Web Font Loading

| Font Source | Size (per weight) | Notes |
|-------------|-------------------|-------|
| Google Fonts | ~20KB | Free, CDN cached |
| Adobe Fonts | ~25KB | Subscription required |
| Self-hosted | Varies | Full control, WOFF2 format |

### Loading Strategy

```css
/* Optimal: font-display swap */
@font-face {
  font-family: 'Space Grotesk';
  font-display: swap; /* Show fallback immediately, swap when loaded */
  src: url('/fonts/space-grotesk.woff2') format('woff2');
}
```

### Fallback Stacks

```css
/* System font stack (zero loading) */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, sans-serif;

/* With custom font */
font-family: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI",
             Roboto, sans-serif;

/* Monospace */
font-family: "JetBrains Mono", "Fira Code", ui-monospace,
             SFMono-Regular, Menlo, Monaco, monospace;
```
