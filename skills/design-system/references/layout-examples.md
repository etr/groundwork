# Layout Architecture Strategy Bundles

Curated combinations of patterns from `layout-architecture-guide.md` showing how patterns combine into coherent layout strategies. Each bundle includes HTML structure, key CSS properties, JS hooks, and scroll behavior specification.

Use these as starting points — adapt pattern details to match the product's tonal direction, brand identity, and atmosphere choices.

---

## 1. Cinematic Scroll Narrative (Apple-style)

**Character:** Immersive, paced storytelling — the user scrolls through a crafted experience where each section builds on the last. Product reveals, brand narratives, device showcases.

**Patterns combined:**
- Scroll-Scrubbed Animation (§2.1)
- Pin-and-Reveal (§2.3)
- Dark-to-Light Emotional Arc (§4.4)
- Three-Tier Animation System (§4.2)
- Variable Container Widths (§1.1)
- Gradient Dividers (§6.3)
- Migratory Navigation (§3.1)

**HTML structure outline:**
```html
<nav class="nav" data-mode="hero"><!-- Migratory: transforms per section --></nav>
<section class="hero dark full-bleed pinned"><!-- Pin + scroll-scrub device rotation --></section>
<section class="feature-1 dark narrow"><!-- Three-tier reveal, narrow container --></section>
<div class="gradient-divider dark-to-mid"></div>
<section class="feature-2 mid wide pin-reveal"><!-- Pin: 3 panels slide through --></section>
<div class="gradient-divider mid-to-light"></div>
<section class="feature-3 light narrow"><!-- Standard three-tier entrance --></section>
<section class="specs light full-bleed"><!-- Dense spec grid, full width --></section>
<section class="cta light narrow"><!-- Final CTA, narrow focus --></section>
```

**Key CSS properties:**
```css
:root { --bg-dark: #0a0a0a; --bg-light: #fafafa; }
.hero { height: 300vh; /* Scroll room for scrubbed animation */ }
.pinned { position: sticky; top: 0; }
.full-bleed { max-width: none; padding-inline: 0; }
.narrow { max-width: 48rem; margin-inline: auto; }
.wide { max-width: 72rem; margin-inline: auto; }
.gradient-divider { height: 8rem; background: linear-gradient(var(--from), var(--to)); }
```

**JS hooks needed:**
- GSAP ScrollTrigger for pin-and-reveal sections and scroll-scrubbed hero
- IntersectionObserver for three-tier entrance animations
- IntersectionObserver for migratory nav mode switching
- IntersectionObserver for dark-to-light section color transitions

**Scroll behavior:**
- Hero: pinned for 200vh of scroll distance while device rotates via scrub
- Feature pin-reveal: pinned for 3× viewport height, panels slide horizontally
- All other sections: standard vertical scroll with three-tier entrance
- Nav migrates: bottom-pill in hero → sticky top bar in content → minimal dot in specs

**Reduced motion fallback:** All sections stack vertically, no pinning, three-tier animations replaced with simple fade, dark-to-light applied as static colors per section.

---

## 2. Layered Depth (Stripe-style)

**Character:** Energetic professionalism with visual depth — diagonal cuts, floating layers, glass effects. SaaS products, fintech, developer platforms.

**Patterns combined:**
- Diagonal Section Breaks (§1.3)
- Fixed-Position Parallax (§2.2)
- Dual-Layer Contextual Navigation (§3.2)
- Three-Tier Animation System (§4.2)
- Gradient Dividers (§6.3)
- Fluid Spacing Without Breakpoints (§6.2)
- Variable Container Widths (§1.1)

**HTML structure outline:**
```html
<nav class="nav-global glass"><!-- Persistent global nav --></nav>
<nav class="nav-contextual"><!-- Section-specific: Products | Pricing | Docs --></nav>
<section class="hero parallax-container full-bleed">
  <div class="parallax-bg"><!-- Gradient + grid pattern --></div>
  <div class="hero-content narrow"><!-- Three-tier reveal --></div>
</section>
<section class="features diagonal-top wide"><!-- Diagonal entry, 3-col grid --></section>
<section class="social-proof narrow diagonal-bottom"><!-- Logos, testimonials --></section>
<section class="deep-dive wide"><!-- Alternating asymmetric splits --></section>
<section class="pricing full-bleed"><!-- Pricing cards, full bleed bg --></section>
<section class="cta narrow"><!-- Final CTA --></section>
```

**Key CSS properties:**
```css
.nav-global { backdrop-filter: blur(16px) saturate(180%); }
.nav-contextual { position: sticky; top: 3.5rem; }
.parallax-bg { transform: translateZ(-2px) scale(3); }
.diagonal-top { clip-path: polygon(0 4rem, 100% 0, 100% 100%, 0 100%); padding-top: 6rem; }
.diagonal-bottom { clip-path: polygon(0 0, 100% 0, 100% calc(100% - 4rem), 0 100%); }
section { padding-block: clamp(4rem, 8vw, 8rem); } /* Fluid spacing throughout */
```

**JS hooks needed:**
- CSS perspective-based parallax (or rAF for more control)
- IntersectionObserver for three-tier entrances
- IntersectionObserver for contextual nav show/hide

**Scroll behavior:**
- Hero: parallax background scrolls at 0.4× speed, foreground at normal speed
- All other sections: standard vertical scroll with three-tier entrance stagger
- Contextual nav appears when scrolling past hero, hides in pricing section
- No scroll hijacking or pinning — depth from layers, not from scroll manipulation

**Reduced motion fallback:** Parallax disabled (static background), diagonal clips preserved (CSS-only, no motion), three-tier entrances reduced to simple opacity fade.

---

## 3. Industrial Precision (Teenage Engineering-style)

**Character:** Mathematical rigor, deliberate minimalism, anti-decoration. The system itself is the aesthetic. Hardware companies, engineering tools, utilitarian products.

**Patterns combined:**
- Single-Formula Fluid System (§6.1)
- Navigation by Absence (§3.6)
- Density Contrast (§5.5)
- Data-Table as Primary UI (§5.2)
- Drawer-as-Section (§5.4)
- Fluid Spacing Without Breakpoints (§6.2)

**Anti-patterns (explicitly excluded):**
- No scroll-scrubbed animation
- No parallax
- No entrance animations beyond basic opacity
- No blend modes or visual effects

**HTML structure outline:**
```html
<header class="absent-nav">
  <span class="logo">BRAND</span>
  <button class="menu-trigger" aria-label="Open navigation">+</button>
</header>
<section class="hero sparse">
  <h1 class="display-type">Product name.</h1>
  <p class="mono">One sentence description.</p>
</section>
<section class="specs dense">
  <table class="data-primary"><!-- Spec table: feature | value | note --></table>
</section>
<section class="details">
  <details class="drawer-section"><!-- Expandable: Materials --></details>
  <details class="drawer-section"><!-- Expandable: Dimensions --></details>
  <details class="drawer-section"><!-- Expandable: Compatibility --></details>
</section>
<section class="gallery sparse"><!-- Product images, uniform grid --></section>
<section class="purchase dense"><!-- Price, single buy button --></section>
```

**Key CSS properties:**
```css
:root {
  --base: 1rem; --ratio: 1.333;
  --s-1: calc(var(--base) / var(--ratio));
  --s0: var(--base);
  --s1: calc(var(--base) * var(--ratio));
  --s2: calc(var(--base) * var(--ratio) * var(--ratio));
}
body { font-family: 'Space Grotesk', monospace; }
.sparse { padding-block: var(--s4); max-width: 48rem; margin-inline: auto; }
.dense { padding-block: var(--s1); max-width: 72rem; margin-inline: auto; }
.drawer-section { border-bottom: 1px solid var(--border); }
.data-primary__row { font-variant-numeric: tabular-nums; }
```

**JS hooks needed:**
- None for core layout
- Optional: fullscreen nav overlay toggle (minimal JS)

**Scroll behavior:**
- Standard vertical scroll only. No parallax, no pinning, no scrubbing.
- Page loads fully rendered — no entrance animations beyond a single 300ms opacity fade on initial load.
- Drawers open/close with CSS `grid-template-rows` transition.

**Reduced motion fallback:** Already minimal — disable the single load-in fade and drawer transitions.

---

## 4. Choreographed Studio (Balky / Lorenzo-style)

**Character:** Theatrical, artful composition — every element has an entrance, layers interact with blend modes, navigation is a design statement. Creative agencies, studios, artistic portfolios.

**Patterns combined:**
- Text-Split Reveals (§4.1)
- Cover-Wipe Reveal (§4.3)
- Marquee Navigation (§3.4)
- Mix-Blend-Mode Layering (§6.4)
- Kinetic Gallery (§4.5)
- Content-Push Menu (§3.3)
- Asymmetric Splits (§1.4)

**HTML structure outline:**
```html
<div class="page-wrapper">
  <header class="marquee-nav">
    <div class="marquee-track"><!-- WORK · ABOUT · CONTACT · WORK · ABOUT... --></div>
  </header>
  <section class="hero">
    <h1 class="split-reveal">Studio Name</h1>
    <div class="blend-layer__bg-text" aria-hidden="true">CREATIVE</div>
  </section>
  <section class="work asymmetric-70-30">
    <div class="kinetic-gallery"><!-- Project images with depth data --></div>
    <div class="work-list"><!-- Project titles --></div>
  </section>
  <section class="about">
    <div class="wipe-reveal"><!-- Team photo --></div>
    <p class="split-reveal">About text</p>
  </section>
  <section class="contact"><!-- Minimal contact form --></section>
</div>
<nav class="push-menu"><!-- Full project list, behind page --></nav>
```

**Key CSS properties:**
```css
.marquee-track { animation: marquee 20s linear infinite; font-size: clamp(2rem, 5vw, 5rem); }
.blend-layer__bg-text { mix-blend-mode: multiply; opacity: 0.12; font-size: 16vw; }
.kinetic-gallery .gallery-item { transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
.wipe-reveal::after { background: var(--accent); transition: transform 0.8s cubic-bezier(0.77, 0, 0.175, 1); }
.page-wrapper { transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
.menu-open .page-wrapper { transform: translateX(24rem) scale(0.95); border-radius: 1rem; }
```

**JS hooks needed:**
- Text split function for character-level animation
- IntersectionObserver for wipe and split triggers
- Mousemove listener for kinetic gallery parallax
- Content-push menu toggle with focus trapping

**Scroll behavior:**
- Standard vertical scroll — the choreography is in entry animations, not scroll manipulation
- Each section's content animates on entry via IntersectionObserver
- Gallery items respond to cursor position in real-time
- Marquee nav scrolls continuously, pauses on hover

**Reduced motion fallback:** Text-split shows complete text immediately, wipe reveals replaced with simple fade, kinetic gallery static, marquee paused showing all items.

---

## 5. Content-First Directory (The Index-style)

**Character:** Radical utility — content is the interface, design serves information retrieval. Job boards, link directories, resource databases, tool indexes.

**Patterns combined:**
- Data-Table as Primary UI (§5.2)
- Density Contrast (§5.5)
- Navigation by Absence (§3.6)
- Drawer-as-Section (§5.4)
- Fluid Spacing Without Breakpoints (§6.2)

**Anti-patterns (explicitly excluded):**
- No animation of any kind
- No hover effects beyond background highlight
- No images unless content requires them
- No decorative elements

**HTML structure outline:**
```html
<header class="minimal-header">
  <h1 class="site-name">The Directory</h1>
  <input type="search" class="filter-input" placeholder="Filter...">
</header>
<section class="intro sparse">
  <p>One paragraph explaining what this directory contains.</p>
</section>
<section class="listing dense">
  <table class="data-primary" role="grid">
    <thead><!-- Name | Category | Date | Link --></thead>
    <tbody><!-- Sortable, filterable rows --></tbody>
  </table>
</section>
<section class="about sparse">
  <details class="drawer-section"><!-- About this directory --></details>
  <details class="drawer-section"><!-- Submission guidelines --></details>
</section>
<footer class="dense"><!-- Minimal: last updated, contact --></footer>
```

**Key CSS properties:**
```css
body { font-family: 'IBM Plex Mono', monospace; font-size: 0.875rem; }
.sparse { padding-block: clamp(3rem, 6vw, 6rem); max-width: 48rem; margin-inline: auto; }
.dense { padding-block: 1rem; max-width: 72rem; margin-inline: auto; }
.data-primary__header { position: sticky; top: 0; background: var(--surface-1); }
.data-primary__row:hover { background: var(--surface-2); }
.filter-input { width: 100%; padding: 0.75rem; border: 1px solid var(--border); font-family: inherit; }
```

**JS hooks needed:**
- Table sort (click column headers)
- Live filter (keyup on search input)
- No animation JS

**Scroll behavior:**
- Standard vertical scroll. Sticky table headers.
- No animation, no transitions beyond hover state.
- Page is functional immediately on load.

**Reduced motion fallback:** Already motion-free. No changes needed.

---

## 6. Sticky Card Stack (Huddle-style)

**Character:** Friendly, layered depth — sections feel like physical cards stacking as you scroll. Consumer SaaS, community platforms, product tours.

**Patterns combined:**
- Sticky Card Cascade (§2.4)
- Rounded Section Stacking (§1.5)
- Embedded Hero Navigation (§3.5)
- Fixed-Position Parallax (§2.2)
- Three-Tier Animation System (§4.2)
- Scale-Transform Breathing (§6.5)

**HTML structure outline:**
```html
<section class="hero parallax-container">
  <nav class="hero-nav"><!-- Logo | Links | CTA --></nav>
  <div class="parallax-bg"><!-- Gradient or image --></div>
  <div class="hero-content"><!-- Headline, subtitle, CTA --></div>
</section>
<div class="cascade-container">
  <div class="cascade-card" data-breathe style="--card-offset: 2rem">
    <!-- Feature 1: content with three-tier animation -->
  </div>
  <div class="cascade-card" data-breathe style="--card-offset: 4rem">
    <!-- Feature 2 -->
  </div>
  <div class="cascade-card" data-breathe style="--card-offset: 6rem">
    <!-- Feature 3 -->
  </div>
  <div class="cascade-card" data-breathe style="--card-offset: 8rem">
    <!-- Pricing / CTA -->
  </div>
</div>
```

**Key CSS properties:**
```css
.hero { min-height: 100vh; position: relative; }
.hero-nav { position: absolute; inset: 0; z-index: 10; padding: 2rem; }
.hero-nav--scrolled { position: fixed; top: 0; backdrop-filter: blur(12px); }
.cascade-card {
  position: sticky; top: var(--card-offset);
  min-height: 80vh;
  border-radius: 2rem 2rem 0 0;
  background: var(--card-bg);
  padding: clamp(2rem, 5vw, 4rem);
}
.cascade-container { padding-block-end: 50vh; }
```

**JS hooks needed:**
- IntersectionObserver for hero nav → sticky nav transition
- IntersectionObserver for scale-down previous cards
- IntersectionObserver for three-tier entrance within each card
- IntersectionObserver for breathing scale effect

**Scroll behavior:**
- Hero: parallax background, nav transitions to fixed on scroll-past
- Cards: each sticks at increasing offset, previous cards scale down slightly (0.95)
- Breathing: cards scale 0.95→1.0 as they enter center viewport
- Three-tier animation triggers once per card

**Reduced motion fallback:** Cards stack without sticky behavior (normal flow), no scale transforms, parallax disabled, three-tier shows content immediately.

---

## 7. Typography-Dominant (sebastianomerlino.com-style)

**Character:** Type IS the design — massive display text dominates, images support rather than lead. Personal portfolios, writer sites, thought-leader pages, design studios.

**Patterns combined:**
- Viewport-Dominant Display Type (§7.1)
- Inverse Responsive Scaling (§7.2)
- Decorated Inline Words (§7.3)
- Font-Switching as Semantic Signal (§7.5)
- Knockout / Mask Text (§7.4)
- Variable Container Widths (§1.1)
- Density Contrast (§5.5)

**HTML structure outline:**
```html
<nav class="minimal-nav"><!-- Logo (text only) | Menu trigger --></nav>
<section class="hero full-bleed">
  <h1 class="display-type inverse-scale">
    <span class="decorated-word--serif">Creative</span> Developer
  </h1>
</section>
<section class="intro narrow sparse">
  <p class="editorial">
    I build <span class="decorated-word--underline">digital experiences</span> that
    <span class="decorated-word--accent">challenge</span> convention.
  </p>
</section>
<section class="work wide dense">
  <h2 class="knockout-text--gradient">Selected Work</h2>
  <div class="project-grid scale-variation">
    <!-- Projects at varying scales -->
  </div>
</section>
<section class="about narrow sparse">
  <p class="editorial">Bio text with <span class="decorated-word--highlight">decorated</span> words.</p>
</section>
<section class="contact narrow">
  <h2 class="display-type">Let's talk.</h2>
</section>
```

**Key CSS properties:**
```css
:root {
  --font-display: 'Cabinet Grotesk', sans-serif;
  --font-editorial: 'Newsreader', Georgia, serif;
  --font-ui: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
.display-type { font-size: clamp(3rem, 12vw, 12rem); line-height: 0.9; font-weight: 800; }
.inverse-scale { font-size: clamp(3.5rem, 15vw, 8rem); }
.editorial { font-family: var(--font-editorial); font-size: 1.125rem; line-height: 1.75; }
.knockout-text--gradient {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.full-bleed { max-width: none; }
.narrow { max-width: 48rem; margin-inline: auto; }
.wide { max-width: 72rem; margin-inline: auto; }
```

**JS hooks needed:**
- IntersectionObserver for decorated word underline draw-on
- Optional: text-fit function for display type (if using fitted variant)
- No scroll animation JS

**Scroll behavior:**
- Standard vertical scroll — the typography itself provides visual interest
- Decorated words animate underlines/highlights on entry (IntersectionObserver)
- No scroll hijacking, no parallax, no pinning
- Rhythm comes from alternating sparse/dense sections and narrow/wide containers

**Reduced motion fallback:** Decorated word animations show final state immediately. All other elements are static by nature. Minimal changes needed — this bundle is inherently low-motion.

---

## Bundle Selection Guide

| If the product is... | Consider | Avoid |
|---------------------|----------|-------|
| Narrative/storytelling | Cinematic Scroll Narrative | Content-First Directory |
| SaaS/developer platform | Layered Depth | Choreographed Studio |
| Hardware/engineering tool | Industrial Precision | Cinematic Scroll Narrative |
| Creative agency/studio | Choreographed Studio | Industrial Precision |
| Directory/database | Content-First Directory | Any animation-heavy bundle |
| Consumer SaaS/community | Sticky Card Stack | Industrial Precision |
| Personal portfolio/writer | Typography-Dominant | Content-First Directory |

**Mixing bundles:** Avoid combining more than 2 bundles. If mixing, take section geometry + content hierarchy from one and scroll architecture from another. Never mix navigation patterns from different bundles.
