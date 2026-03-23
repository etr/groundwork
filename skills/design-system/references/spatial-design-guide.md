# Spatial Design Guide

## 4pt Base Grid

8pt systems are too coarse — you'll frequently need 12px (between 8 and 16). Use 4pt for granularity:

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Tight (icons, inline elements) |
| `--space-2` | 8px | Compact (form field gaps) |
| `--space-3` | 12px | Default element spacing |
| `--space-4` | 16px | Section padding |
| `--space-6` | 24px | Group separation |
| `--space-8` | 32px | Major section gaps |
| `--space-12` | 48px | Page section spacing |
| `--space-16` | 64px | Hero/header spacing |
| `--space-24` | 96px | Major layout breaks |

## Semantic Token Names

Name by relationship (`--space-sm`, `--space-lg`), not by value (`--spacing-8`). Token names should describe purpose. When the scale changes, semantic names remain stable while values adjust.

## Gap Over Margins

Use CSS `gap` for sibling spacing — it eliminates margin collapse bugs and simplifies component composition. Margins are still appropriate for page-level layout and spacing between unrelated sections.

## Self-Adjusting Grids

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-6);
}
```

Columns are at least 280px, as many as fit per row, leftovers stretch. No breakpoints needed. For complex layouts, use named grid areas and redefine them at breakpoints.

## Visual Hierarchy

### The Squint Test

Blur your eyes (or screenshot and blur). Can you still identify:
- The most important element?
- The second most important?
- Clear groupings?

If everything looks the same weight blurred, you have a hierarchy problem.

### Multiple Dimensions

Don't rely on size alone. Combine 2-3 dimensions for clear hierarchy:

| Dimension | Strong | Weak |
|-----------|--------|------|
| **Size** | 3:1 ratio or more | <2:1 ratio |
| **Weight** | Bold vs Regular | Medium vs Regular |
| **Color** | High contrast | Similar tones |
| **Position** | Top/left (primary) | Bottom/right |
| **Space** | Surrounded by whitespace | Crowded |

A heading that's larger, bolder, AND has more space above it uses three dimensions — far more effective than size alone.

## Cards and Grouping

Cards are overused. Spacing and alignment create visual grouping naturally. Use cards only when:
- Content is truly distinct and actionable
- Items need visual comparison in a grid
- Content needs clear interaction boundaries (click/tap targets)

**Never nest cards inside cards.** Use spacing, typography, and subtle dividers for hierarchy within a card.

## Container Queries

Viewport queries are for page layouts. **Container queries are for components**:

```css
.card-container { container-type: inline-size; }

@container (min-width: 400px) {
  .card { grid-template-columns: 120px 1fr; }
}
```

A card in a narrow sidebar stays compact; the same card in main content expands — automatically, without viewport hacks.

## Optical Adjustments

- **Text alignment**: Text at `margin-left: 0` looks indented due to letterform whitespace. Use negative margin (`-0.05em`) to optically align with non-text elements.
- **Icon centering**: Geometrically centered icons often look off-center. Play icons shift right, arrows shift toward their direction.
- **Size and space**: Larger elements need proportionally more space around them — the relationship is non-linear.

## Touch Targets vs Visual Size

Interactive elements can look small but need large tap areas (44px minimum). Use padding or pseudo-elements to enlarge the hit area without changing visual size:

```css
.icon-button {
  width: 24px; height: 24px;
  position: relative;
}
.icon-button::before {
  content: '';
  position: absolute;
  inset: -10px;  /* Tap target: 44px */
}
```

## Z-Index Scale

Define a semantic z-index scale instead of arbitrary numbers:

| Layer | Value | Usage |
|-------|-------|-------|
| `--z-dropdown` | 100 | Dropdowns, select menus |
| `--z-sticky` | 200 | Sticky headers, floating actions |
| `--z-modal-backdrop` | 300 | Modal overlay |
| `--z-modal` | 400 | Modal content |
| `--z-toast` | 500 | Toast notifications |
| `--z-tooltip` | 600 | Tooltips, popovers |

Arbitrary z-index values (`z-index: 9999`) cause stacking bugs that compound over time.

## Depth and Elevation

Shadows should be subtle — if you can clearly see the shadow, it's probably too strong. Create a consistent elevation scale (sm → md → lg → xl) where each level has a clear purpose (cards, dropdowns, modals).

---

**Avoid**: Arbitrary spacing values outside your scale. Making all spacing equal (variety creates rhythm and hierarchy). Creating hierarchy through size alone. Nesting cards. Arbitrary z-index values.
