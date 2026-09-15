# Motion Design Guide

## Perception Threshold

The brain buffers sensory input for ~80ms to synchronize perception. Anything under 80ms feels instant and simultaneous — this is the target for micro-interactions (button press, toggle, color change).

## The 100/300/500 Timing Rule

| Duration | Use Case | Examples |
|----------|----------|----------|
| **100-150ms** | Instant feedback | Button press, toggle, color change |
| **200-300ms** | State changes | Menu open, tooltip, hover effects |
| **300-500ms** | Layout changes | Accordion, modal, drawer |
| **500-800ms** | Entrance animations | Page load, hero reveals |

**Exit animations are faster than entrances** — use ~75% of entrance duration. Users have already processed the content; they just need it gone.

## Easing: Exponential Curves

Don't use `ease` (the CSS default) — it's a compromise that's rarely optimal. Don't use `linear` — it feels mechanical and artificial.

| Context | Curve | CSS Value |
|---------|-------|-----------|
| Elements entering | ease-out-quart | `cubic-bezier(0.25, 1, 0.5, 1)` |
| Elements leaving | ease-in-quart | `cubic-bezier(0.5, 0, 0.75, 0)` |
| State toggles | ease-in-out | `cubic-bezier(0.65, 0, 0.35, 1)` |
| Snappy, confident | ease-out-expo | `cubic-bezier(0.16, 1, 0.3, 1)` |

Exponential curves mimic real physics — objects decelerate smoothly due to friction.

**Never use bounce or elastic easing.** They feel dated and draw attention to the animation itself rather than the content. Real objects decelerate; they don't bounce on arrival.

## Only Animate Transform and Opacity

These two properties are composited by the GPU and don't trigger layout recalculation. Everything else (`width`, `height`, `padding`, `margin`, `top`, `left`) causes reflow and jank.

**For height animations** (accordions, collapsibles), use `grid-template-rows` transition:

```css
.collapsible { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 300ms ease-out; }
.collapsible.open { grid-template-rows: 1fr; }
.collapsible > div { overflow: hidden; }
```

## Stagger Patterns

Use CSS custom properties for stagger: `animation-delay: calc(var(--i, 0) * 50ms)`.

**Cap total stagger time** regardless of item count. Formula: `per-item-delay = max(30ms, 400ms / itemCount)`. Ten items at 40ms each = 400ms total. Fifty items at 30ms = still ~400ms by capping visible stagger to ~13 items.

## Reduced Motion

This is not optional — vestibular disorders affect ~35% of adults over 40.

```css
/* Default: full animation */
.card { animation: slide-up 500ms ease-out; }

/* Reduced motion: crossfade instead of spatial movement */
@media (prefers-reduced-motion: reduce) {
  .card { animation: fade-in 200ms ease-out; }
}
```

**Preserve**: Progress bars, loading spinners (slowed), focus indicators — functional animations that convey state.
**Remove**: Decorative entrances, parallax, stagger effects, hover transforms — spatial movement that isn't load-bearing.

## Perceived Performance

Nobody cares how fast your site is — just how fast it *feels*.

- **Optimistic UI**: Update interface immediately, sync later. Use for low-stakes actions (likes, follows). Avoid for payments or destructive operations.
- **Progressive loading**: Show content as it arrives. Skeleton screens beat spinners because they preview content shape.
- **Ease-in at completion**: The peak-end effect weights final moments heavily. Ease-in toward a task's end compresses perceived duration.
- **Brief delay for complex operations**: Too-fast responses can decrease perceived value. Users may distrust instant results for search or analysis.

## Performance Rules

- Don't use `will-change` preemptively — only apply when animation is imminent (`:hover`, `.animating` class). Remove after animation completes.
- For scroll-triggered animations, use Intersection Observer. Unobserve after animating once.
- Create motion tokens (duration, easing, common transitions) for consistency across the system.

## Motion Signatures

Products converge on a small number of motion archetypes. Pick one deliberately — whichever demonstrates the product's claim — and let every other motion be subordinate.

| Signature | Timing | Feel | Fits | Canonical reference |
|-----------|--------|------|------|---------------------|
| **Crisp productivity** | <150ms micro-interactions, no scroll hijacking | "Feels fast" | Keyboard-first dev tools | Linear |
| **Demonstrative** | Live-updating counters, medium hover scales ~200ms, subtle hero parallax | "Look, the product is doing real work" | Fintech, APIs | Stripe |
| **Cinematic** | 600–800ms scroll-linked section reveals | Luxurious storytelling | Consumer hardware, automotive | Apple product pages |
| **Near-motionless** | Fades + focus rings only | Trust, gravitas | Scheduling, money, serious AI surfaces | Cal.com, AI-lab marketing pages |
| **Bento flip/reveal** | ~400ms soft ease-out on sticky modular cards | "We have many features; here they are" | Modular SaaS, content platforms | Notion |
| **Playful spring** | Spring easing on cards, looping hero demos | Canvas is the brand | Creative tools, no-code | Framer |
| **Gallery lift** | <300ms hover-lift on masonry, infinite-scroll fade-in | Discovery-driven | Pin boards, template galleries, asset libraries | Pinterest |
| **Infrastructure pulse** | Global node/particle pulse behind still foreground | "Live infrastructure" | Edge networks, realtime backends | Vercel |

**Budget heuristic:** one signature move per homepage. Any second motion choice must be subordinate (hover feedback, focus rings, reduced-motion-safe entrances) to the signature.

---

**Avoid**: Animating everything (animation fatigue). Durations >500ms for UI feedback. Ignoring `prefers-reduced-motion`. Using animation to hide slow loading. Bounce/elastic easing. Animating layout properties.
