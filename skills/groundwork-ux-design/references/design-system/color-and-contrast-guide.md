# Color & Contrast Guide

Complements `color-examples.md` (palette strategy selection) with implementation-level color knowledge.

## Use OKLCH, Not HSL

OKLCH is perceptually uniform — equal steps in lightness *look* equal, unlike HSL where 50% lightness in yellow looks bright while 50% in blue looks dark.

```css
/* OKLCH: lightness (0-100%), chroma (0-0.4+), hue (0-360) */
--color-primary: oklch(60% 0.15 250);      /* Blue */
--color-primary-light: oklch(85% 0.08 250); /* Same hue, lighter */
--color-primary-dark: oklch(35% 0.12 250);  /* Same hue, darker */
```

**Key insight**: As lightness moves toward white or black, reduce chroma. High chroma at extreme lightness looks garish. A light tint at 85% lightness needs ~0.08 chroma, not the 0.15 of your base color.

Define palettes in OKLCH for perceptual accuracy, output hex/RGB for implementation compatibility.

## Tinted Neutrals

Never use pure gray. Add a subtle hint of the brand hue to all neutrals:

```css
/* Dead grays — no personality */
--gray-100: oklch(95% 0 0);
--gray-900: oklch(15% 0 0);

/* Warm-tinted (add brand warmth) */
--gray-100: oklch(95% 0.01 60);
--gray-900: oklch(15% 0.01 60);

/* Cool-tinted (tech, professional) */
--gray-100: oklch(95% 0.01 250);
--gray-900: oklch(15% 0.01 250);
```

Chroma of 0.01 is tiny but perceptible — it creates subconscious cohesion between brand color and UI.

## Never Pure Black or White

`#000000` and `#ffffff` don't exist in nature — real shadows and surfaces always have a color cast. Even chroma of 0.005-0.01 is enough to feel natural without looking obviously tinted. Use near-black and near-white from your tinted neutral scale.

## The 60-30-10 Rule

This is about **visual weight**, not pixel count:

- **60%**: Neutral backgrounds, white space, base surfaces
- **30%**: Secondary colors — text, borders, inactive states
- **10%**: Accent — CTAs, highlights, focus states

The common mistake: using the accent color everywhere because it's "the brand color." Accent colors work *because* they're rare. Overuse kills their power.

## Alpha Is a Design Smell

Heavy use of transparency (`rgba`, `hsla`, `color-mix()` for shade generation) usually means an incomplete palette. Alpha creates unpredictable contrast, performance overhead, and inconsistency across backgrounds.

Define explicit tokens for every needed shade. Exception: focus rings and interactive states where see-through is functionally needed.

## Dangerous Color Combinations

These commonly fail contrast or readability:

| Combination | Problem |
|-------------|---------|
| Light gray text on white | #1 accessibility failure |
| Gray text on colored background | Looks washed out — use a shade of the background color instead |
| Red on green (or vice versa) | 8% of men cannot distinguish |
| Blue on red | Vibrates visually |
| Yellow on white | Almost always fails contrast |
| Thin light text on images | Unpredictable contrast |
| Placeholder text in light gray | Must meet 4.5:1 — commonly missed |

## Dark Mode Strategy

Dark mode is not inverted light mode. It requires different design decisions:

| Concern | Light Mode | Dark Mode |
|---------|------------|-----------|
| Depth cue | Shadows | Lighter surfaces (no shadows) |
| Text | Dark on light | Light on dark — reduce font weight |
| Accents | Vibrant | Desaturate slightly |
| Backgrounds | White (tinted) | Never pure black — dark gray (oklch 12-18%) |
| Line-height | Normal | Increase by 0.05-0.1 (light text needs more breathing room) |

```css
:root[data-theme="dark"] {
  --surface-1: oklch(15% 0.01 250);
  --surface-2: oklch(20% 0.01 250);  /* "Higher" = lighter */
  --surface-3: oklch(25% 0.01 250);
  --body-weight: 350;  /* Instead of 400 */
}
```

## Two-Layer Token Hierarchy

Use two layers: **primitive** tokens (raw values) and **semantic** tokens (contextual names).

```
Primitive:   --blue-500, --blue-700, --gray-100, --gray-900
Semantic:    --color-primary: var(--blue-500)
             --color-text: var(--gray-900)
             --color-bg: var(--gray-100)
```

For dark mode, only redefine the semantic layer — primitives stay the same:

```css
:root[data-theme="dark"] {
  --color-primary: var(--blue-300);   /* Lighter blue in dark mode */
  --color-text: var(--gray-100);      /* Swap text/bg */
  --color-bg: var(--gray-900);
}
```

This keeps the palette maintainable and prevents dark-mode drift from the brand.

---

**Avoid**: Relying on color alone to convey information. Creating palettes without clear roles for each color. Using pure black (`#000`) for large areas. Skipping color blindness testing (8% of men affected). Using `rgba()` to generate shade variants instead of explicit tokens.
