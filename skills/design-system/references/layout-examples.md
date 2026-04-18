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

**Small-studio variant:** portfolios and agency sites often run *Choreographed Studio* at ~60% intensity — fewer kinetic surfaces, more restraint — because the page has to double as a pitch deck. Grid asymmetry + hover-reveal project cards are the most common simplification.

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

## 8. AI Lab Minimal

**Character:** Low-chroma dark canvas, one signal color, narrow centered content column, no scroll tricks. The absence of motion *is* the tone — it communicates "focused research surface, not a product demo".

**Patterns combined:**
- Variable Container Widths (§1.1) — narrow dominant, occasional wide for product tiles
- Three-Tier Animation System (§4.2) — minimum viable entrance only
- Navigation by Absence (§3.6) — thin top bar, often just logo + auth
- Density Contrast (§5.5) — extreme: very sparse marketing, very dense playground/console

**Anti-patterns (explicitly excluded):**
- No scroll-scrubbed animation
- No parallax
- No diagonal section breaks
- No sticky card cascades
- No decorative gradients beyond one signal-colored glow

**HTML structure outline:**
```html
<nav class="top-bar thin"><!-- logo · nav · auth. No CTA bloat --></nav>
<section class="hero narrow sparse">
  <h1 class="display-tight">One declarative sentence.</h1>
  <p class="lede">One supporting sentence — factual, not marketing-ese.</p>
  <a class="signal-cta">Primary action</a>
</section>
<section class="capabilities narrow">
  <ul class="feature-list"><!-- Terse rows, no icons, no cards --></ul>
</section>
<section class="playground wide dense"><!-- One interactive surface: model comparison / prompt box --></section>
<section class="docs-teaser narrow"><!-- 3 code examples, copy-pasteable --></section>
<footer class="thin"><!-- Legal + status + docs + discord. No newsletter hero. --></footer>
```

**Key CSS properties:**
```css
:root {
  --canvas: #0B0B0F;
  --content: #E4E4E7;
  --signal: #7C5CFF; /* exactly one hue */
}
body { background: var(--canvas); color: var(--content); font-feature-settings: "ss01", "cv11"; }
.narrow { max-width: 44rem; margin-inline: auto; }
.wide { max-width: 68rem; margin-inline: auto; }
.sparse { padding-block: clamp(6rem, 12vw, 10rem); }
.display-tight { font-size: clamp(2.5rem, 6vw, 4.25rem); letter-spacing: -0.02em; line-height: 1.02; }
.signal-cta { background: var(--signal); color: var(--canvas); padding: 0.75rem 1.25rem; border-radius: 6px; }
.signal-cta:hover { filter: brightness(1.08); }
/* No gradient backgrounds. No blur. No glow beyond signal color at low opacity. */
```

**JS hooks needed:**
- IntersectionObserver for single-stage opacity fade (no stagger, no transform)
- None for the playground — use native `<form>` and streaming `<pre>`
- No scroll library

**Scroll behavior:**
- Standard vertical scroll. Sections are short, content is the whole show.
- Page fully legible at 200ms after load. No skeletons — content or nothing.

**Reduced motion fallback:** Remove the one opacity fade. Nothing else to disable.

**Who this fits:** model providers and serious dev-focused AI tools where credibility > flash. Does *not* fit consumer AI products whose output is visual — those earn the right to more motion because demonstrating the product *is* the page.

---

## 9. Dev Tool Density

**Character:** Keyboard-first productivity tools. Dense interface screenshots dominate the page; marketing copy plays narrator. The hero is always a real screenshot at real resolution, not an abstract illustration. Cmd-K is the recurring gesture.

**Patterns combined:**
- Three-Tier Animation System (§4.2) — tight timings (<250ms)
- Dark-to-Light Emotional Arc (§4.4) — optional, often staying dark throughout
- Sticky Card Cascade (§2.4) — sparingly, one stack at most
- Data-Table as Primary UI (§5.2) — the real product always appears in marketing
- Mix-Blend-Mode Layering (§6.4) — for subtle depth behind product shots

**HTML structure outline:**
```html
<nav class="top-bar condensed"><!-- Logo | Changelog | Pricing | Docs | ⌘K --></nav>
<section class="hero narrow">
  <h1>One product claim — six words or fewer.</h1>
  <p class="lede">One sentence of positioning.</p>
  <div class="product-shot full-res"><!-- Real UI screenshot. No browser chrome unless intentional. --></div>
</section>
<section class="speed-proof wide"><!-- "Keyboard shortcut reel": animated keycaps + result --></section>
<section class="command-palette narrow"><!-- Screenshot of Cmd-K doing real work --></section>
<section class="integrations wide"><!-- Dense logo grid, 20+ services --></section>
<section class="changelog narrow"><!-- Recent shipped items, date-stamped --></section>
```

**Key CSS properties:**
```css
:root { --bg: #0E0E10; --surface: #17171A; --accent: #5E6AD2; } /* Linear-adjacent */
.product-shot { border: 1px solid #26262B; border-radius: 12px; box-shadow: 0 30px 80px -20px rgba(0,0,0,0.6); }
.keycap { font-family: ui-monospace, Menlo; padding: 2px 8px; border: 1px solid #2A2A30; border-radius: 4px; box-shadow: 0 1px 0 #2A2A30; }
.changelog-row { display: grid; grid-template-columns: 7rem 1fr; gap: 1.5rem; padding-block: 0.75rem; border-bottom: 1px solid #1C1C20; }
section { padding-block: clamp(3rem, 6vw, 6rem); } /* Tighter than AI Lab Minimal */
```

**JS hooks needed:**
- Lightweight keycap animation loop (setTimeout chain or CSS animation) — never scroll-driven
- IntersectionObserver for product-shot fade-in only
- No parallax, no pinning

**Scroll behavior:**
- Standard vertical scroll. Fast.
- The implicit promise is speed — the page must feel fast (no large hero videos, aggressive image optimization, minimal JS).

**Reduced motion fallback:** Keycap reel shows the final state (last result) statically. No fades.

**Who this fits:** keyboard-first productivity tools where the promise is speed. Linear is the most-imitated reference. Avoid for design tools where richness beats density.

---

## 10. Automotive Cinematic

**Character:** One hero image or full-bleed video carries the entire page's emotional weight. Type is architectural — viewport-dominant display in a single condensed or italic cut. The product is photographed, not illustrated.

**Patterns combined:**
- Scroll-Scrubbed Animation (§2.1) — camera orbit around vehicle
- Pin-and-Reveal (§2.3) — spec panels appear over pinned hero
- Variable Container Widths (§1.1) — full-bleed dominant, narrow only for body copy
- Viewport-Dominant Display Type (§7.1)
- Kinetic Gallery (§4.5) — for model line-up
- Dark-to-Light Emotional Arc (§4.4) — often reversed: light → dark for drama

**HTML structure outline:**
```html
<nav class="top-bar transparent"><!-- Transparent over hero, solid on scroll --></nav>
<section class="hero full-bleed dark">
  <video autoplay muted loop playsinline class="hero-video"><!-- Vehicle in motion --></video>
  <h1 class="display-architecture">MODEL NAME.</h1>
</section>
<section class="spec-reveal full-bleed pinned">
  <div class="vehicle-orbit"><!-- Scroll-scrubbed rotation --></div>
  <aside class="spec-panel"><!-- 0-100 · top speed · power --></aside>
</section>
<section class="configurator wide"><!-- Trim/colour/wheel picker, real-time preview --></section>
<section class="lineup full-bleed"><!-- Kinetic gallery of model variants --></section>
<section class="narrative narrow"><!-- One paragraph of heritage copy --></section>
```

**Key CSS properties:**
```css
.display-architecture { font-family: 'Migra Italic', serif; font-size: clamp(4rem, 16vw, 14rem); line-height: 0.88; letter-spacing: -0.03em; }
.hero { aspect-ratio: 21/9; position: relative; overflow: hidden; }
.hero-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.spec-reveal { height: 300vh; position: relative; }
.vehicle-orbit { position: sticky; top: 0; height: 100vh; }
.spec-panel { position: fixed; bottom: 4rem; right: 4rem; font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) {
  .hero-video { display: none; }
  .hero { background-image: url('hero-still.jpg'); background-size: cover; }
}
```

**JS hooks needed:**
- GSAP ScrollTrigger for vehicle orbit scrubbing (or Lenis + rAF)
- Preloading: the hero video or image is the critical asset — everything else defers
- Configurator state machine (pure JS, no animation)

**Scroll behavior:**
- Pinned hero for 300vh while vehicle rotates via scrubbed video frames or 3D model
- Spec panel pins to viewport corner during reveal
- Lineup uses kinetic gallery — cursor parallax on desktop, swipe on mobile

**Reduced motion fallback:** Hero video replaced with still. Vehicle orbit replaced with a single exterior shot + spec panel. No scrubbing, no parallax, no kinetic gallery motion.

**Who this fits:** performance automotive and aspirational consumer hardware where one hero image or video carries the emotional weight of the page. Avoid for anything data-dense — the archetype cannot carry a dashboard.

---

## 11. Fintech Clarity

**Character:** Numbers are the hero. Every page converges on a single comparison, calculator, or ledger. Motion is medium-speed and exists to *demonstrate the math*, not to entertain.

**Patterns combined:**
- Diagonal Section Breaks (§1.3) — Stripe's signature
- Fixed-Position Parallax (§2.2) — subtle, background only
- Three-Tier Animation System (§4.2)
- Data-Table as Primary UI (§5.2) — for ledgers, fee tables
- Gradient Dividers (§6.3)

**HTML structure outline:**
```html
<nav class="top-bar"><!-- Logo | Products | Docs | Pricing | Sign in | Sign up --></nav>
<section class="hero diagonal-bottom light">
  <h1>One outcome-focused claim.</h1>
  <p class="lede">One sentence quantifying the outcome.</p>
  <div class="hero-demo"><!-- Live number, updating: "$4.2B processed today" --></div>
</section>
<section class="calculator narrow"><!-- Interactive: "Send X from A to B" with fee comparison --></section>
<section class="api-preview wide"><!-- Side-by-side: natural-language left, curl/json right --></section>
<section class="trust-bar full-bleed"><!-- Logos of customers, single-row, muted --></section>
<section class="docs-teaser narrow"><!-- 3 code blocks, instantly copyable --></section>
```

**Key CSS properties:**
```css
.hero { background: linear-gradient(180deg, #F6F9FC 0%, #FFFFFF 100%); }
.diagonal-bottom { clip-path: polygon(0 0, 100% 0, 100% calc(100% - 3rem), 0 100%); }
.hero-demo { font-variant-numeric: tabular-nums; font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 500; }
.calculator input, .calculator output { font-variant-numeric: tabular-nums; }
.api-preview { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
.api-preview pre { background: #0A2540; color: #8DD1FF; padding: 1.5rem; border-radius: 8px; font-family: ui-monospace, monospace; }
```

**JS hooks needed:**
- Live-updating counter (rAF, throttled — pure visual, not real-time data)
- Calculator with real math (debounced on input, displays both values simultaneously)
- IntersectionObserver for code-block reveal

**Scroll behavior:**
- Standard vertical scroll with subtle parallax on background gradient
- Calculator and API preview stay in flow — never pinned (would break the "do the math right now" feeling)

**Reduced motion fallback:** Counter shows final value immediately. Gradient stays static. All other sections unaffected (no motion-critical patterns).

**Who this fits:** payments, crypto exchanges, banking APIs. Stripe is the canonical reference for the custom-family + live-counter variant. Does not suit traditional banks themselves — they need a Trust/Compliance archetype instead.

---

## 12. Creative Tool Playful

**Character:** The canvas is the brand. Every surface demonstrates what you can *make* with the tool. Animation is lively but brief; color saturation is higher than average; illustration mixes with UI screenshots freely.

**Patterns combined:**
- Asymmetric Splits (§1.4) — different layout per section
- Sticky Card Cascade (§2.4) — for feature walks
- Kinetic Gallery (§4.5) — for template/showcase sections
- Scale-Transform Breathing (§6.5)
- Mix-Blend-Mode Layering (§6.4)
- Three-Tier Animation System (§4.2) — with higher intensity

**HTML structure outline:**
```html
<nav class="top-bar colorful"><!-- Gradient on logo, otherwise neutral --></nav>
<section class="hero split-asymmetric">
  <div class="hero-copy">
    <h1 class="display-playful">Build it <span class="decorated-accent">without</span> code.</h1>
  </div>
  <div class="hero-demo animated"><!-- Live UI demo, looping --></div>
</section>
<section class="feature-cascade"><!-- Sticky cards, each a different color --></section>
<section class="template-gallery kinetic"><!-- Masonry of user-made examples --></section>
<section class="community narrow"><!-- Profiles/avatars, social proof --></section>
<section class="cta colorful"><!-- High-saturation call to action --></section>
```

**Key CSS properties:**
```css
:root {
  --surface-a: #FEF9F4; --surface-b: #EEF4FF; --surface-c: #F5EEFF; /* rotating section colors */
  --accent-hot: #FF4F00;
}
.hero { display: grid; grid-template-columns: 0.9fr 1.1fr; align-items: center; gap: 4rem; }
.display-playful { font-size: clamp(3rem, 8vw, 6rem); line-height: 1.0; }
.decorated-accent { color: var(--accent-hot); font-style: italic; }
.feature-cascade > .card:nth-child(3n+1) { background: var(--surface-a); }
.feature-cascade > .card:nth-child(3n+2) { background: var(--surface-b); }
.feature-cascade > .card:nth-child(3n+3) { background: var(--surface-c); }
.template-gallery { column-count: auto; column-width: 18rem; gap: 1.5rem; }
.template-gallery > * { break-inside: avoid; transition: transform 400ms cubic-bezier(0.16,1,0.3,1); }
.template-gallery > *:hover { transform: translateY(-4px); }
```

**JS hooks needed:**
- Looping hero demo (video or Lottie)
- IntersectionObserver for feature-cascade scale/color transitions
- Masonry gallery with lazy-loaded images

**Scroll behavior:**
- Standard vertical scroll with sticky cards that change color as you pass
- Template gallery breathes on hover (cursor-responsive lift)
- No pinning, no parallax — the motion is ambient, not structural

**Reduced motion fallback:** Hero demo pauses on first frame. Cards stop breathing on hover. Colors still rotate (static, not a transition).

**Who this fits:** no-code builders, design tools, visual boards, social-creative surfaces — anywhere the canvas is the brand and marketing pages can demonstrate what users will make. Does not fit enterprise infra, where the playfulness reads as unserious.

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
| AI model provider / research-forward | AI Lab Minimal | Creative Tool Playful |
| Keyboard-first productivity | Dev Tool Density | Cinematic Scroll Narrative |
| Performance automotive / luxury hardware | Automotive Cinematic | Content-First Directory |
| Payments / money movement / crypto | Fintech Clarity | Choreographed Studio |
| No-code builder / visual tool / social creative | Creative Tool Playful | AI Lab Minimal |

**Mixing bundles:** Avoid combining more than 2 bundles. If mixing, take section geometry + content hierarchy from one and scroll architecture from another. Never mix navigation patterns from different bundles.
