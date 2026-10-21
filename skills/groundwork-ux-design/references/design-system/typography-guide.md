# Typography Guide

Complements `typography-examples.md` (font pairing and scale selection) with implementation-level typography knowledge.

## Vertical Rhythm

Line-height should be the base unit for ALL vertical spacing. If body text has `line-height: 1.5` on `16px` type (= 24px), spacing values should be multiples of 24px. This creates subconscious harmony — text and space share a mathematical foundation.

## Modular Scale

The common mistake: too many font sizes that are too close together (14px, 15px, 16px, 18px...). This creates muddy hierarchy.

**Use fewer sizes with more contrast.** A 5-size system covers most needs:

| Role | Typical Ratio | Use Case |
|------|---------------|----------|
| xs | 0.75rem | Captions, legal |
| sm | 0.875rem | Secondary UI, metadata |
| base | 1rem | Body text |
| lg | 1.25-1.5rem | Subheadings, lead text |
| xl+ | 2-4rem | Headlines, hero text |

Popular ratios: 1.25 (major third), 1.333 (perfect fourth), 1.5 (perfect fifth). Pick one and commit.

## Readability and Measure

Use `ch` units for character-based measure: `max-width: 65ch` (45-75 characters per line is optimal). Line-height scales inversely with line length — narrow columns need tighter leading, wide columns need more.

## Fluid Type

Use `clamp(min, preferred, max)` for smooth viewport-responsive sizing:

```css
.hero-title { font-size: clamp(2rem, 5vw + 1rem, 4rem); }
```

The middle value controls scaling rate — higher `vw` = faster scaling. Add a `rem` offset so it doesn't collapse on small screens.

**Use fluid type for**: Headings and display text on marketing/content pages.

**Use fixed `rem` scales for**: App UIs, dashboards, data-dense interfaces. No major design system (Material, Polaris, Primer, Carbon) uses fluid type in product UI — fixed scales with breakpoint adjustments give the spatial predictability that container-based layouts need. Body text should also be fixed.

## Font Selection

**Avoid the invisible defaults**: Inter, Roboto, Open Sans, Lato, Montserrat. These are everywhere, making your design feel generic.

**Better alternatives** (see `typography-examples.md` for pairings):
- Instead of Inter → Instrument Sans, Plus Jakarta Sans, Outfit
- Instead of Roboto → Onest, Figtree, Urbanist
- Instead of Open Sans → Source Sans 3, Nunito Sans, DM Sans
- For editorial/premium → Fraunces, Newsreader, Lora

**One font is often enough.** One family in multiple weights creates cleaner hierarchy than two competing typefaces. Only add a second font when you need genuine contrast (display headlines + body serif).

When pairing, contrast on multiple axes: serif + sans (structure), geometric + humanist (personality), condensed + wide (proportion). **Never pair fonts that are similar but not identical** — they create tension without hierarchy.

## Font Loading

Prevent layout shift with `font-display: swap` and metric-matched fallbacks:

```css
@font-face {
  font-family: 'CustomFont';
  src: url('font.woff2') format('woff2');
  font-display: swap;
}

@font-face {
  font-family: 'CustomFont-Fallback';
  src: local('Arial');
  size-adjust: 105%;
  ascent-override: 90%;
  descent-override: 20%;
  line-gap-override: 10%;
}

body {
  font-family: 'CustomFont', 'CustomFont-Fallback', sans-serif;
}
```

## OpenType Features

Use these for typographic polish:

```css
.data-table { font-variant-numeric: tabular-nums; }  /* Aligned numbers */
.recipe-amount { font-variant-numeric: diagonal-fractions; }
abbr { font-variant-caps: all-small-caps; }
code { font-variant-ligatures: none; }
body { font-kerning: normal; }
```

Check font support at [Wakamai Fondue](https://wakamaifondue.com/).

## Dark Mode Typography

Light text on dark backgrounds has lower perceived weight. Compensate:
- Increase line-height by 0.05-0.1
- Reduce font weight slightly (350 instead of 400)
- Desaturate colored text

## Accessibility

- **Never `user-scalable=no`** — breaks zoom accessibility. If layout breaks at 200% zoom, fix the layout.
- **Use `rem`/`em` for font sizes** — respects user browser settings. Never `px` for body text.
- **16px minimum body text** — smaller strains eyes and fails WCAG on mobile.
- **Adequate touch targets** — text links need padding or line-height that creates 44px+ tap targets.

## Token Architecture

Name tokens semantically (`--text-body`, `--text-heading`), not by value (`--font-size-16`). Include font stacks, size scale, weights, line-heights, and letter-spacing in the token system.

---

**Avoid**: More than 2-3 font families per project. Skipping fallback definitions. Ignoring font loading (FOUT/FOIT). Using decorative fonts for body text. Monospace as lazy shorthand for "technical." `user-scalable=no`.
