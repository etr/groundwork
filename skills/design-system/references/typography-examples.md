# Typography Examples

Reference type systems for different product types and use cases.

## Font Pairing Strategies

### 1. Single Family (Recommended for UI)

Use one versatile font family with multiple weights.

**Pros:** Consistent feel, simpler loading, fewer decisions
**Cons:** Less visual variety

**Examples:**
- **Inter** - Modern geometric sans, excellent screen readability
- **IBM Plex Sans** - Humanist sans with technical clarity
- **Source Sans Pro** - Adobe's first open source, highly readable

### 2. Sans + Serif Pair

Sans for UI, serif for content/headings.

**Pros:** Visual hierarchy, editorial feel
**Cons:** More complex, potential clashes

**Examples:**
- **Poppins + Merriweather** - Modern + traditional
- **Work Sans + Lora** - Clean + elegant
- **Rubik + Roboto Slab** - Rounded + sturdy

### 3. Display + Body

Distinctive display font for headings, neutral body font.

**Pros:** Strong brand identity, visual interest
**Cons:** Display fonts can fatigue, limit flexibility

**Examples:**
- **Playfair Display + Open Sans** - Elegant + readable
- **Montserrat + Roboto** - Geometric + neutral

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
  font-family: 'Inter';
  font-display: swap; /* Show fallback immediately, swap when loaded */
  src: url('/fonts/inter.woff2') format('woff2');
}
```

### Fallback Stacks

```css
/* System font stack (zero loading) */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, sans-serif;

/* With custom font */
font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI",
             Roboto, sans-serif;

/* Monospace */
font-family: "JetBrains Mono", "Fira Code", ui-monospace,
             SFMono-Regular, Menlo, Monaco, monospace;
```

## Industry-Specific Recommendations

### B2B SaaS
- **Inter** or **IBM Plex Sans** - Professional, highly readable
- Medium weight for UI, semibold for headers

### Developer Tools
- **JetBrains Mono** or **Fira Code** for code
- **Inter** or **Source Sans** for UI
- Consider ligatures for code

### Consumer Apps
- **Poppins** or **Nunito** - Friendly, approachable
- **Rubik** - Modern, rounded corners

### Finance/Legal
- **IBM Plex Sans** or **Source Sans** - Trustworthy, clear
- Avoid quirky fonts; prioritize readability

### Creative/Marketing
- More freedom for distinctive display fonts
- Ensure body text remains highly readable
