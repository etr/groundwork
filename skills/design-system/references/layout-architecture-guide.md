# Layout Architecture Pattern Library

Reference guide for spatial layout decisions in design systems. Each pattern includes implementation technique, accessibility considerations, and complexity classification.

**Complexity tiers:**
- **CSS-only** — no JavaScript required, works with pure CSS
- **JS-light** — minimal JS (IntersectionObserver, scroll listener with rAF)
- **JS-heavy** — requires scroll library (GSAP ScrollTrigger, Lenis) or custom controller

---

## 1. Section Geometry

Patterns controlling how page sections relate to each other spatially.

### 1.1 Variable Container Widths

**One-line:** Sections alternate between constrained and full-bleed widths to create visual rhythm.

**When to use:** Editorial sites, marketing pages, portfolios — anywhere content density varies between sections. Especially effective when mixing text-heavy and media-heavy sections.

**Technique:**
```css
.section { --container: 72rem; margin-inline: auto; padding-inline: clamp(1rem, 5vw, 3rem); max-width: var(--container); }
.section--narrow { --container: 48rem; }
.section--wide { --container: 90rem; }
.section--full { max-width: none; padding-inline: 0; }

/* Transition between widths feels intentional with consistent vertical spacing */
.section + .section { margin-block-start: clamp(4rem, 8vw, 8rem); }
```

**Accessibility:** No concerns — purely visual rhythm. Ensure text sections maintain comfortable line length (45-75ch) even in wider containers.

**Combinations:** Reinforces **Density Contrast** and **Dark-to-Light Emotional Arc**. Pairs well with **Diagonal Section Breaks** for dramatic transitions. Avoid combining with **Single-Formula Fluid System** if that system enforces uniform width.

**Complexity:** CSS-only

---

### 1.2 Negative-Margin Overlap

**One-line:** Elements from adjacent sections visually overlap, breaking the stacked-boxes default.

**When to use:** Portfolio sites, creative agencies, editorial layouts — when you want to suggest depth and intentional composition. Effective for image/text overlap at section boundaries.

**Technique:**
```css
.overlap-section { position: relative; z-index: 1; }
.overlap-section__media {
  margin-block-end: -6rem; /* Pull into next section */
  position: relative;
  z-index: 2;
}
.overlap-section + .section { padding-block-start: 8rem; /* Accommodate overlap */ }

/* Card overlapping its parent section boundary */
.overlap-card {
  transform: translateY(50%);
  position: relative;
  z-index: 2;
}
```

**Accessibility:** Ensure overlapping elements don't obscure interactive content. Tab order must remain logical despite visual overlap. Test with 200% zoom — overlaps may collide at large text sizes.

**Combinations:** Works well with **Asymmetric Splits** and **Mix-Blend-Mode Layering**. Conflicts with **Rounded Section Stacking** (competing depth metaphors). Avoid with **Sticky Card Cascade** in the same viewport.

**Complexity:** CSS-only

---

### 1.3 Diagonal Section Breaks

**One-line:** Sections meet at angled boundaries instead of horizontal lines, creating forward momentum.

**When to use:** SaaS marketing pages, fintech landing pages — when the product narrative has clear progression. Stripe-style energy. Avoid on content-heavy or documentation sites.

**Technique:**
```css
.diagonal-section {
  position: relative;
  padding-block: 6rem 8rem;
  clip-path: polygon(0 0, 100% 4rem, 100% calc(100% - 4rem), 0 100%);
  /* Or with transform for simpler approach: */
}
/* Alternative using pseudo-element skew: */
.diagonal-section::before {
  content: '';
  position: absolute;
  inset: -3rem 0 auto;
  height: 6rem;
  background: inherit;
  transform: skewY(-2deg);
  transform-origin: top left;
}
.diagonal-section::after {
  content: '';
  position: absolute;
  inset: auto 0 -3rem;
  height: 6rem;
  background: inherit;
  transform: skewY(-2deg);
  transform-origin: bottom right;
}
```

**Accessibility:** No direct impact. Ensure text within clipped regions isn't cut off at extreme viewport widths. Test with browser zoom.

**Combinations:** Core to **Layered Depth** bundle. Pairs naturally with **Fixed-Position Parallax** and **Gradient Dividers**. Conflicts with **Rounded Section Stacking** (mixing curves and angles feels inconsistent).

**Complexity:** CSS-only

---

### 1.4 Asymmetric Splits

**One-line:** Content areas use unequal column ratios (60/40, 70/30) rather than symmetric halves.

**When to use:** Product pages pairing hero imagery with supporting text, SaaS feature sections, case studies. Creates natural visual hierarchy within a section.

**Technique:**
```css
.split { display: grid; gap: clamp(2rem, 4vw, 4rem); }
.split--60-40 { grid-template-columns: 3fr 2fr; }
.split--70-30 { grid-template-columns: 7fr 3fr; }
.split--golden { grid-template-columns: 1.618fr 1fr; } /* Golden ratio */

/* Flip on alternate sections for visual rhythm */
.split--flip { direction: rtl; }
.split--flip > * { direction: ltr; }

/* Stack on mobile */
@media (max-width: 48rem) {
  .split { grid-template-columns: 1fr; }
}
```

**Accessibility:** Ensure reading order matches DOM order, not visual order. When flipping layout with `direction: rtl`, verify screen reader order is still logical. Content in narrower column must remain readable.

**Combinations:** Strengthens **Variable Container Widths** and **Image-First Layout**. Works with **Negative-Margin Overlap** for overlapping split elements. Neutral with most scroll patterns.

**Complexity:** CSS-only

---

### 1.5 Rounded Section Stacking

**One-line:** Sections have large border-radii and stack with visible overlap like layered cards.

**When to use:** Friendly, approachable products — wellness apps, community platforms, consumer SaaS. Huddle/Notion style. Avoid for corporate fintech or utility-first products.

**Technique:**
```css
.stacked-section {
  border-radius: 2rem 2rem 0 0;
  position: relative;
  z-index: var(--stack-index, 1);
  margin-block-start: -2rem; /* Overlap previous section */
  padding-block: 4rem 6rem;
  background: var(--section-bg);
}
.stacked-section:nth-child(1) { --stack-index: 1; }
.stacked-section:nth-child(2) { --stack-index: 2; }
.stacked-section:nth-child(3) { --stack-index: 3; }

/* Sticky version — sections peel up to reveal next */
.stacked-section--sticky {
  position: sticky;
  top: 0;
}
```

**Accessibility:** Ensure content isn't hidden behind overlapping sections. Sticky stacking requires careful z-index management so focused elements remain visible. Test keyboard navigation through stacked sections.

**Combinations:** Core to **Sticky Card Stack** bundle. Pairs with **Scale-Transform Breathing** for depth effect. Conflicts with **Diagonal Section Breaks** (competing section boundary metaphors).

**Complexity:** CSS-only (static) / JS-light (sticky variant with IntersectionObserver)

---

## 2. Scroll Architecture

Patterns defining what happens as the user scrolls through the page.

### 2.1 Scroll-Scrubbed Animation

**One-line:** Animation progress is directly tied to scroll position — user controls the timeline by scrolling.

**When to use:** Product narratives, storytelling landing pages, device showcases (Apple-style). When the content has a sequential reveal that benefits from user-paced exploration.

**Technique:**
```css
/* CSS-native approach (Scroll-driven Animations API) */
@keyframes fade-scale {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}
.scrubbed {
  animation: fade-scale linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 100%;
}

/* Fallback / wider support with JS: */
```
```js
// GSAP ScrollTrigger approach
gsap.to('.hero-device', {
  rotateY: 0,
  scale: 1,
  scrollTrigger: {
    trigger: '.hero-section',
    start: 'top top',
    end: 'bottom top',
    scrub: 0.5, // 0.5s smoothing
    pin: true,
  }
});
```

**Accessibility:** **Critical** — wrap all scroll-scrubbed animation in `@media (prefers-reduced-motion: no-preference)`. Fallback: show final state immediately with simple fade-in. Content must be readable without scrolling through the animation.

**Combinations:** Core to **Cinematic Scroll Narrative** bundle. Pairs with **Pin-and-Reveal** and **Dark-to-Light Emotional Arc**. Conflicts with **Anti-Animation** philosophy. Heavy when combined with **Horizontal Scroll Conversion**.

**Complexity:** JS-heavy (GSAP ScrollTrigger or equivalent; CSS scroll-driven animations have limited browser support)

---

### 2.2 Fixed-Position Parallax

**One-line:** Background layers scroll at different rates than foreground content, creating depth.

**When to use:** Hero sections, marketing pages with strong imagery, portfolio headers. Effective for a single hero section; avoid applying to every section (causes fatigue).

**Technique:**
```css
/* Pure CSS parallax using perspective */
.parallax-container {
  height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
  perspective: 1px;
  perspective-origin: center center;
}
.parallax-bg {
  position: absolute;
  inset: -20% 0; /* Extra height to prevent gaps */
  transform: translateZ(-2px) scale(3); /* Deeper = slower */
}
.parallax-fg {
  position: relative;
  transform: translateZ(0); /* Normal scroll speed */
}

/* JS approach for more control: */
```
```js
// Smooth parallax with rAF
const bg = document.querySelector('.parallax-bg');
let ticking = false;
window.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      bg.style.transform = `translateY(${window.scrollY * 0.4}px)`;
      ticking = false;
    });
    ticking = true;
  }
});
```

**Accessibility:** Disable for `prefers-reduced-motion: reduce` — show static positioned background instead. Pure CSS parallax can cause nausea in motion-sensitive users; always provide fallback.

**Combinations:** Core to **Layered Depth** bundle. Pairs with **Diagonal Section Breaks** and **Gradient Dividers**. Avoid combining with **Scroll-Scrubbed Animation** on the same section (competing scroll behaviors). One parallax section per page is usually enough.

**Complexity:** CSS-only (perspective method) / JS-light (rAF method)

---

### 2.3 Pin-and-Reveal

**One-line:** A section pins in the viewport while content reveals or transforms within it, then releases.

**When to use:** Feature walkthroughs, step-by-step product explanations, comparison sections. When you have 3-5 items that benefit from sequential attention in the same visual context.

**Technique:**
```js
// GSAP ScrollTrigger pin with progressive reveal
const panels = gsap.utils.toArray('.reveal-panel');
const pinSection = document.querySelector('.pin-section');

gsap.to(panels, {
  xPercent: -100 * (panels.length - 1),
  ease: 'none',
  scrollTrigger: {
    trigger: pinSection,
    pin: true,
    scrub: 0.3,
    snap: 1 / (panels.length - 1),
    start: 'top top',
    end: () => '+=' + pinSection.offsetWidth,
  }
});
```
```css
.pin-section { display: flex; flex-wrap: nowrap; width: max-content; }
.reveal-panel { width: 100vw; height: 100vh; flex-shrink: 0; }

/* Reduced motion: stack vertically, no pinning */
@media (prefers-reduced-motion: reduce) {
  .pin-section { flex-wrap: wrap; width: auto; }
  .reveal-panel { height: auto; min-height: 60vh; }
}
```

**Accessibility:** **Critical** — pinned sections trap scroll in a way that can disorient. Provide clear progress indicators (dots, step counter). Reduced motion fallback must show all content in normal document flow. Ensure keyboard users can navigate between pinned panels.

**Combinations:** Core to **Cinematic Scroll Narrative** bundle. Pairs naturally with **Scroll-Scrubbed Animation** and **Dark-to-Light Emotional Arc**. Conflicts with **Sticky Card Cascade** (competing pin behaviors).

**Complexity:** JS-heavy

---

### 2.4 Sticky Card Cascade

**One-line:** Cards stack on top of each other as user scrolls, each catching on a sticky position before the next overlaps.

**When to use:** Pricing tiers, feature comparisons, portfolio pieces, testimonials. When items are peers but benefit from focused sequential reading. Huddle-style.

**Technique:**
```css
.cascade-container { padding-block-end: 50vh; /* Scroll room */ }
.cascade-card {
  position: sticky;
  top: var(--card-offset);
  height: 80vh;
  border-radius: 1.5rem;
  background: var(--card-bg);
  transition: transform 0.3s ease-out;
  transform-origin: top center;
}
.cascade-card:nth-child(1) { --card-offset: 2rem; --card-bg: var(--surface-1); }
.cascade-card:nth-child(2) { --card-offset: 4rem; --card-bg: var(--surface-2); }
.cascade-card:nth-child(3) { --card-offset: 6rem; --card-bg: var(--surface-3); }
```
```js
// Optional: scale down previous cards as they get covered
const cards = document.querySelectorAll('.cascade-card');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const prev = entry.target.previousElementSibling;
    if (prev && entry.isIntersecting) {
      prev.style.transform = 'scale(0.95)';
    }
  });
}, { threshold: 0.5 });
cards.forEach(card => observer.observe(card));
```

**Accessibility:** Cards must remain keyboard-navigable. Content on cards below the stack must be reachable via tab. Reduced motion: disable sticky behavior, show as vertical card list.

**Combinations:** Core to **Sticky Card Stack** bundle. Pairs with **Rounded Section Stacking**. Conflicts with **Pin-and-Reveal** (competing sticky behaviors — never use both on the same page).

**Complexity:** CSS-only (basic) / JS-light (with scale animation)

---

### 2.5 Horizontal Scroll Conversion

**One-line:** Vertical scrolling is converted to horizontal movement within a section.

**When to use:** Galleries, portfolios, timelines, case study showcases. When items have a natural left-to-right sequence. Use sparingly — one section per page maximum.

**Technique:**
```js
// GSAP horizontal scroll conversion
const container = document.querySelector('.h-scroll');
const panels = gsap.utils.toArray('.h-scroll__panel');

gsap.to(panels, {
  xPercent: -100 * (panels.length - 1),
  ease: 'none',
  scrollTrigger: {
    trigger: container,
    pin: true,
    scrub: 0.5,
    end: () => '+=' + container.scrollWidth,
    snap: 1 / (panels.length - 1),
  }
});
```
```css
.h-scroll { display: flex; flex-wrap: nowrap; }
.h-scroll__panel { min-width: 100vw; flex-shrink: 0; }

/* Reduced motion: native horizontal scroll */
@media (prefers-reduced-motion: reduce) {
  .h-scroll { overflow-x: auto; scroll-snap-type: x mandatory; }
  .h-scroll__panel { scroll-snap-align: start; }
}
```

**Accessibility:** **Critical** — horizontal scroll conversion breaks expected scroll behavior. Must show clear visual affordance (progress bar, arrows). Reduced motion fallback: native horizontal scroll with `scroll-snap-type`. Keyboard: arrow keys must navigate panels.

**Combinations:** Works in **Cinematic Scroll Narrative** and **Choreographed Studio** bundles. Conflicts with other pinned sections — only one scroll-hijacking section per page. Avoid with **Sticky Card Cascade**.

**Complexity:** JS-heavy

---

## 3. Navigation Innovation

Patterns for navigation behavior beyond standard sticky headers.

### 3.1 Migratory Navigation

**One-line:** Nav transforms its position, shape, or content as the user scrolls past different page sections.

**When to use:** Long single-page sites, product showcases, editorial features. When different sections have different navigation needs (hero CTA vs. section TOC vs. sticky mini-nav).

**Technique:**
```js
const nav = document.querySelector('.nav');
const sections = document.querySelectorAll('[data-nav-mode]');

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      nav.dataset.mode = entry.target.dataset.navMode;
    }
  });
}, { threshold: 0.5, rootMargin: '-40% 0px' });

sections.forEach(s => observer.observe(s));
```
```css
.nav { position: fixed; top: 0; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.nav[data-mode="hero"] { top: auto; bottom: 2rem; width: auto; border-radius: 2rem; }
.nav[data-mode="content"] { top: 0; width: 100%; border-radius: 0; background: var(--glass); backdrop-filter: blur(12px); }
.nav[data-mode="minimal"] { width: 3rem; height: 3rem; border-radius: 50%; overflow: hidden; }
```

**Accessibility:** Nav must remain keyboard-accessible in every mode. `aria-label` should update to describe current nav state. Ensure focus indicators are visible in all nav positions. Reduced motion: instant mode switches, no positional animation.

**Combinations:** Works in **Cinematic Scroll Narrative** and **Choreographed Studio** bundles. Conflicts with **Dual-Layer Contextual Nav** (too many nav behaviors at once). Avoid with **Navigation by Absence**.

**Complexity:** JS-light

---

### 3.2 Dual-Layer Contextual Navigation

**One-line:** Two independent navigation layers — global persistent nav plus section-specific contextual nav.

**When to use:** Large marketing sites, documentation, multi-product pages. When global nav (logo, main links) must persist while section-specific tools change (Stripe-style product nav).

**Technique:**
```css
.nav-global {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  height: 3.5rem;
  background: var(--glass);
  backdrop-filter: blur(16px) saturate(180%);
  border-bottom: 1px solid var(--glass-border);
}
.nav-contextual {
  position: sticky; top: 3.5rem; z-index: 99;
  height: 2.5rem;
  background: var(--surface-1);
  border-bottom: 1px solid var(--border);
  transition: opacity 0.3s, transform 0.3s;
}
.nav-contextual[aria-hidden="true"] {
  opacity: 0; transform: translateY(-100%); pointer-events: none;
}
```
```js
// Show/hide contextual nav based on section
const contextNav = document.querySelector('.nav-contextual');
const section = document.querySelector('.product-section');

const obs = new IntersectionObserver(([entry]) => {
  contextNav.setAttribute('aria-hidden', !entry.isIntersecting);
}, { rootMargin: '-56px 0px 0px 0px' }); // Offset for global nav height

obs.observe(section);
```

**Accessibility:** Both layers must be navigable via keyboard. Use `aria-hidden` to remove contextual nav from tab order when not visible. Ensure screen readers announce layer transitions.

**Combinations:** Core to **Layered Depth** bundle. Pairs with **Variable Container Widths**. Conflicts with **Migratory Navigation** and **Embedded Hero Navigation** (too many nav paradigms).

**Complexity:** JS-light

---

### 3.3 Content-Push Menu

**One-line:** Opening the menu pushes page content aside rather than overlaying it.

**When to use:** Sites where maintaining context during navigation is important — e-commerce, portfolios with preview, complex dashboards. Shows menu and content simultaneously.

**Technique:**
```css
.page-wrapper {
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.menu-open .page-wrapper {
  transform: translateX(min(24rem, 80vw));
}
.push-menu {
  position: fixed; top: 0; left: 0; bottom: 0;
  width: min(24rem, 80vw);
  transform: translateX(-100%);
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.menu-open .push-menu { transform: translateX(0); }

/* Scale effect on pushed content for depth */
.menu-open .page-wrapper {
  transform: translateX(min(24rem, 80vw)) scale(0.95);
  border-radius: 1rem;
  overflow: hidden;
}
```

**Accessibility:** Menu must trap focus when open. Escape key closes menu. `aria-expanded` on trigger. Page content behind push should have `aria-hidden="true"` and `inert` when menu is open. Reduced motion: instant show/hide without transform.

**Combinations:** Works in **Choreographed Studio** bundle. Conflicts with **Dual-Layer Contextual Nav** (menu push would shift both layers awkwardly). Pairs with **Mix-Blend-Mode Layering** for visual effect on push.

**Complexity:** CSS-only (with checkbox hack) / JS-light (for focus trapping)

---

### 3.4 Marquee Navigation

**One-line:** Navigation items scroll horizontally in a continuous marquee/ticker, clicked to navigate.

**When to use:** Creative portfolios, studio sites, experimental design. When navigation itself is a design statement. Lorenzo Dal Dosso style. Not for utility-focused or content-heavy sites.

**Technique:**
```css
.marquee-nav {
  overflow: hidden; white-space: nowrap; width: 100%;
}
.marquee-nav__track {
  display: inline-flex; gap: 4rem;
  animation: marquee 20s linear infinite;
}
.marquee-nav__track:hover { animation-play-state: paused; }

@keyframes marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
.marquee-nav__item {
  font-size: clamp(2rem, 5vw, 5rem);
  text-transform: uppercase;
  color: var(--text-muted);
  transition: color 0.2s;
  cursor: pointer;
}
.marquee-nav__item:hover { color: var(--accent); }
```

**Accessibility:** **Critical** — continuous motion must respect `prefers-reduced-motion` (show static list). Must be keyboard-navigable — pressing Tab should pause marquee and move through items sequentially. Each item needs visible focus indicator. Provide `aria-label="Navigation"` on container.

**Combinations:** Core to **Choreographed Studio** bundle. Conflicts with all other nav patterns — marquee nav is an all-or-nothing statement. Only combine with a minimal secondary nav (hamburger for mobile).

**Complexity:** CSS-only

---

### 3.5 Embedded Hero Navigation

**One-line:** Navigation is integrated into the hero section rather than floating above it, becoming part of the composition.

**When to use:** Portfolio homepages, splash pages, immersive product launches. When the hero IS the first interaction and the nav should feel like part of the content, not separate chrome.

**Technique:**
```css
.hero { position: relative; min-height: 100vh; display: grid; place-items: center; }
.hero-nav {
  position: absolute; inset: 0; z-index: 10;
  display: grid;
  grid-template: 1fr / 1fr auto 1fr;
  align-items: start; padding: 2rem;
}
.hero-nav__logo { justify-self: start; }
.hero-nav__links { display: flex; gap: 2rem; justify-self: end; }

/* Transition to sticky on scroll */
.hero-nav--scrolled {
  position: fixed; top: 0;
  background: var(--glass);
  backdrop-filter: blur(12px);
  padding: 1rem 2rem;
}
```
```js
const heroNav = document.querySelector('.hero-nav');
const hero = document.querySelector('.hero');

const obs = new IntersectionObserver(([entry]) => {
  heroNav.classList.toggle('hero-nav--scrolled', !entry.isIntersecting);
}, { threshold: 0.1 });

obs.observe(hero);
```

**Accessibility:** Ensure nav links have sufficient contrast against the hero background in both embedded and scrolled states. Use glass/blur effect with solid color fallback for browsers without backdrop-filter.

**Combinations:** Core to **Sticky Card Stack** bundle. Pairs with **Fixed-Position Parallax** hero. Conflicts with **Marquee Navigation** and **Migratory Navigation** (competing hero-area nav strategies).

**Complexity:** JS-light

---

### 3.6 Navigation by Absence

**One-line:** No persistent navigation — the page itself is the navigation, with minimal entry/exit points.

**When to use:** Single-purpose landing pages, immersive art/portfolio pieces, experimental sites with few destinations. Teenage Engineering product pages. Absolutely not for apps, e-commerce, or content-heavy sites.

**Technique:**
```css
/* Minimal corner elements */
.absent-nav {
  position: fixed; z-index: 100;
}
.absent-nav__logo {
  position: fixed; top: 1.5rem; left: 1.5rem;
  font-size: 0.875rem; letter-spacing: 0.1em;
  mix-blend-mode: difference; color: white;
}
.absent-nav__menu-trigger {
  position: fixed; top: 1.5rem; right: 1.5rem;
  width: 2rem; height: 2rem;
  mix-blend-mode: difference;
}

/* Navigation only appears on explicit request */
.fullscreen-nav {
  position: fixed; inset: 0; z-index: 200;
  opacity: 0; pointer-events: none;
  transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.fullscreen-nav--open {
  opacity: 1; pointer-events: auto;
}
```

**Accessibility:** Must provide a discoverable way to reach all pages (the menu trigger). The trigger must have an `aria-label` ("Open navigation"). Consider a skip-to-content link that also reveals navigation for keyboard users.

**Combinations:** Core to **Industrial Precision** bundle. Pairs with **Anti-Animation**. Conflicts with every other nav pattern by definition. Only works with minimal site structure (< 8 destinations).

**Complexity:** CSS-only

---

## 4. Content Choreography

Patterns for how content appears, transitions, and sequences.

### 4.1 Text-Split Reveals

**One-line:** Headlines split into individual characters or words that animate independently on entry.

**When to use:** Hero sections, section transitions, portfolio headers. When typography is a primary design element. Balky Studio, Lorenzo Dal Dosso style.

**Technique:**
```js
// Split text into spans
function splitText(el) {
  const text = el.textContent;
  el.innerHTML = text.split('').map((char, i) =>
    `<span class="char" style="--i:${i}">${char === ' ' ? '&nbsp;' : char}</span>`
  ).join('');
  el.setAttribute('aria-label', text); // Preserve readable text
}

// Animate on intersection
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('revealed');
  });
}, { threshold: 0.2 });
```
```css
.split-reveal .char {
  display: inline-block;
  opacity: 0; transform: translateY(100%);
  transition: opacity 0.5s, transform 0.5s;
  transition-delay: calc(var(--i) * 30ms);
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}
.split-reveal.revealed .char {
  opacity: 1; transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .split-reveal .char { opacity: 1; transform: none; transition: none; }
}
```

**Accessibility:** **Critical** — split text must preserve `aria-label` with the full original text. Individual `<span>` elements should have `aria-hidden="true"` so screen readers read the label, not individual characters. Reduced motion: show all text immediately.

**Combinations:** Core to **Choreographed Studio** bundle. Pairs with **Three-Tier Animation System** (text splits as tier 1). Conflicts with heavy scroll animation — don't split text AND scrub it.

**Complexity:** JS-light

---

### 4.2 Three-Tier Animation System

**One-line:** Page elements are classified into three timing groups that cascade on entry — headlines first, then body, then supporting elements.

**When to use:** Any section with mixed content (heading + text + images + UI elements). Creates ordered reveal that guides the eye. Linear, Wispr Flow style.

**Technique:**
```css
[data-animate] {
  opacity: 0;
  transform: translateY(1.5rem);
  transition-property: opacity, transform;
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}
[data-animate="tier-1"] { transition-duration: 0.6s; transition-delay: 0s; }     /* Headlines */
[data-animate="tier-2"] { transition-duration: 0.5s; transition-delay: 0.15s; }  /* Body text, primary images */
[data-animate="tier-3"] { transition-duration: 0.4s; transition-delay: 0.3s; }   /* Badges, secondary elements */

[data-animate].in-view { opacity: 1; transform: translateY(0); }

@media (prefers-reduced-motion: reduce) {
  [data-animate] { opacity: 1; transform: none; transition: none; }
}
```
```js
const animEls = document.querySelectorAll('[data-animate]');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in-view'); });
}, { threshold: 0.15 });
animEls.forEach(el => observer.observe(el));
```

**Accessibility:** Reduced motion fallback shows all content immediately. Animation distances are subtle (1.5rem) — avoid large translate values that cause content reflow.

**Combinations:** Universal — works with nearly every bundle. Core to **Cinematic Scroll Narrative** and **Layered Depth**. Pairs with **Text-Split Reveals** (split replaces tier-1 default). Conflicts with **Anti-Animation**.

**Complexity:** JS-light (IntersectionObserver only)

---

### 4.3 Cover-Wipe Reveal

**One-line:** A colored overlay slides away to reveal content underneath, like pulling back a curtain.

**When to use:** Image reveals in portfolios, section transitions in editorial layouts, loading state exits. When you want a moment of anticipation before the reveal.

**Technique:**
```css
.wipe-reveal {
  position: relative; overflow: hidden;
}
.wipe-reveal::after {
  content: '';
  position: absolute; inset: 0;
  background: var(--accent);
  transform-origin: left;
  transform: scaleX(1);
  transition: transform 0.8s cubic-bezier(0.77, 0, 0.175, 1); /* easeInOutQuart */
}
.wipe-reveal.revealed::after {
  transform: scaleX(0);
  transform-origin: right;
}
.wipe-reveal__content {
  opacity: 0;
  transition: opacity 0.3s 0.4s; /* Fade in after wipe starts */
}
.wipe-reveal.revealed .wipe-reveal__content { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .wipe-reveal::after { display: none; }
  .wipe-reveal__content { opacity: 1; transition: none; }
}
```

**Accessibility:** Reduced motion: skip the wipe, show content immediately. Wipe color must meet contrast requirements against surrounding content in case it freezes mid-animation.

**Combinations:** Core to **Choreographed Studio** bundle. Pairs with **Text-Split Reveals** (wipe reveals image, then text splits). Conflicts with **Three-Tier Animation System** on the same element (choose one entrance method).

**Complexity:** CSS-only

---

### 4.4 Dark-to-Light Emotional Arc

**One-line:** Page transitions from dark color scheme to light (or vice versa) as user scrolls, creating emotional progression.

**When to use:** Product narratives (problem→solution), storytelling, brand pages that move from dramatic to inviting. Apple Vision Pro, Wispr Flow style.

**Technique:**
```css
:root {
  --bg-start: #0a0a0a;
  --bg-end: #fafafa;
  --text-start: #f5f5f5;
  --text-end: #1a1a1a;
}
.arc-section {
  background: var(--section-bg, var(--bg-start));
  color: var(--section-text, var(--text-start));
  transition: background 0.8s ease, color 0.6s ease;
}
```
```js
const sections = document.querySelectorAll('.arc-section');
const totalSections = sections.length;

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const index = [...sections].indexOf(entry.target);
      const progress = index / (totalSections - 1);
      entry.target.style.setProperty('--section-bg',
        `color-mix(in oklch, var(--bg-start) ${(1 - progress) * 100}%, var(--bg-end))`
      );
      entry.target.style.setProperty('--section-text',
        `color-mix(in oklch, var(--text-start) ${(1 - progress) * 100}%, var(--text-end))`
      );
    }
  });
}, { threshold: 0.5 });

sections.forEach(s => observer.observe(s));
```

**Accessibility:** Ensure contrast ratios meet WCAG AA at every interpolation point, not just endpoints. Mid-range gray-on-gray is the danger zone — test at 50% progress. Reduced motion: still apply color changes, just remove transition timing.

**Combinations:** Core to **Cinematic Scroll Narrative** bundle. Pairs with **Scroll-Scrubbed Animation** and **Pin-and-Reveal**. Conflicts with single-theme products where brand consistency requires uniform color. Avoid with **Density Contrast** (too many simultaneous shifts).

**Complexity:** JS-light

---

### 4.5 Kinetic Gallery

**One-line:** Images in a grid respond to cursor movement or scroll with subtle parallax, rotation, or scale shifts.

**When to use:** Portfolios, creative agency sites, e-commerce product showcases. When images are the primary content and should feel alive. Jacky Winter Gallery, Pixel Poetry style.

**Technique:**
```js
const gallery = document.querySelector('.kinetic-gallery');
const items = gallery.querySelectorAll('.gallery-item');

gallery.addEventListener('mousemove', (e) => {
  const rect = gallery.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width - 0.5;  // -0.5 to 0.5
  const y = (e.clientY - rect.top) / rect.height - 0.5;

  items.forEach((item, i) => {
    const depth = parseFloat(item.dataset.depth || 1);
    const moveX = x * 20 * depth;
    const moveY = y * 20 * depth;
    const rotate = x * 3 * depth;
    item.style.transform =
      `translate(${moveX}px, ${moveY}px) rotate(${rotate}deg)`;
  });
});
```
```css
.kinetic-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
}
.gallery-item {
  transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}

@media (prefers-reduced-motion: reduce) {
  .gallery-item { transition: none; }
}
/* On touch devices, skip cursor tracking — use subtle scroll parallax instead */
@media (hover: none) {
  .gallery-item { transform: none !important; }
}
```

**Accessibility:** Disable cursor-tracking on touch devices (`@media (hover: none)`). Respect `prefers-reduced-motion`. Movement must be subtle (< 20px, < 3deg) to avoid disorientation. Images must have alt text regardless of animation.

**Combinations:** Works in **Choreographed Studio** bundle. Pairs with **Mix-Blend-Mode Layering** for visual depth. Conflicts with **Scroll-Scrubbed Animation** on the same elements (competing transforms). Avoid with **Anti-Animation**.

**Complexity:** JS-light

---

## 5. Content Hierarchy

Patterns for what dominates visually and how content is organized.

### 5.1 Image-First Layout

**One-line:** Images occupy the primary visual space (60-80% of viewport), with text as supporting element.

**When to use:** Portfolios, product showcases, photography sites, travel/lifestyle. When visual content IS the value proposition. Jacky Winter Gallery, Apple style.

**Technique:**
```css
.image-first {
  display: grid;
  grid-template-columns: 1fr;
}
.image-first__media {
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  border-radius: var(--radius-md);
}
.image-first__caption {
  padding: 1rem 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  max-width: 48ch;
}

/* Hero variant: full-bleed image with overlaid text */
.image-first--hero {
  position: relative;
  height: 90vh;
}
.image-first--hero .image-first__media {
  position: absolute; inset: 0;
  height: 100%; border-radius: 0;
}
.image-first--hero .image-first__content {
  position: relative; z-index: 1;
  align-self: end; padding: 4rem;
  color: white;
  text-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
```

**Accessibility:** All images must have descriptive alt text — in image-first layouts, the image is the content, not decoration. Ensure text overlaid on images has sufficient contrast (use gradient overlay or text-shadow). Provide text alternative paths for users who can't see images.

**Combinations:** Pairs naturally with **Asymmetric Splits** and **Variable Container Widths**. Works in **Cinematic Scroll Narrative** and **Choreographed Studio** bundles. Conflicts with **Data-Table as Primary UI** (opposite hierarchy philosophies).

**Complexity:** CSS-only

---

### 5.2 Data-Table as Primary UI

**One-line:** The main page content is organized as a scannable table/list rather than cards or hero sections.

**When to use:** Directories, job boards, search results, dashboards, tool indexes. When users need to scan and compare many items efficiently. The Index style.

**Technique:**
```css
.data-primary {
  width: 100%;
  border-collapse: collapse;
}
.data-primary__header {
  position: sticky; top: 3.5rem; /* Below nav */
  background: var(--surface-1);
  z-index: 10;
  font-size: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}
.data-primary__row {
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
  cursor: pointer;
}
.data-primary__row:hover { background: var(--surface-2); }
.data-primary__cell {
  padding: 1rem 1.5rem;
  vertical-align: middle;
}
.data-primary__cell--primary {
  font-weight: 500;
  min-width: 20ch;
}
.data-primary__cell--secondary {
  color: var(--text-secondary);
  font-size: var(--text-sm);
}
```

**Accessibility:** Use semantic `<table>`, `<thead>`, `<th scope="col">`. Sortable columns need `aria-sort`. Clickable rows need keyboard activation (`role="link"` or nested `<a>`). Ensure sufficient row height for touch targets (44px minimum).

**Combinations:** Core to **Content-First Directory** bundle. Pairs with **Density Contrast** and **Navigation by Absence** (content IS the interface). Conflicts with **Image-First Layout**, **Kinetic Gallery**, and most scroll animation patterns.

**Complexity:** CSS-only

---

### 5.3 Same-Component Scale Variation

**One-line:** The same component type (card, image, tile) appears at dramatically different scales to signal importance.

**When to use:** Portfolios (featured vs. standard work), e-commerce (hero product vs. grid), blogs (featured vs. list). When items are the same type but not equal in importance.

**Technique:**
```css
.scale-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 1.5rem;
}
.scale-grid__item--hero {
  grid-column: span 8;
  grid-row: span 2;
  aspect-ratio: 16 / 9;
}
.scale-grid__item--featured {
  grid-column: span 6;
  aspect-ratio: 4 / 3;
}
.scale-grid__item--standard {
  grid-column: span 4;
  aspect-ratio: 1;
}
.scale-grid__item--compact {
  grid-column: span 3;
  aspect-ratio: 3 / 2;
}

@media (max-width: 48rem) {
  .scale-grid__item--hero { grid-column: span 12; }
  .scale-grid__item--featured { grid-column: span 12; }
  .scale-grid__item--standard { grid-column: span 6; }
  .scale-grid__item--compact { grid-column: span 6; }
}
```

**Accessibility:** Ensure smaller items remain readable and touchable. Minimum touch target 44x44px. Content hierarchy should be conveyed semantically (heading levels, `aria-label`) not just visually.

**Combinations:** Works in most bundles. Pairs with **Image-First Layout** and **Variable Container Widths**. Conflicts with **Data-Table as Primary UI** (tables assume uniform row height).

**Complexity:** CSS-only

---

### 5.4 Drawer-as-Section

**One-line:** Major content sections behave as expandable drawers/accordions, hiding detail until requested.

**When to use:** FAQ pages, product specs, dense information architecture, long-form content with optional depth. When users need overview first, details on demand.

**Technique:**
```css
.drawer-section {
  border-bottom: 1px solid var(--border);
}
.drawer-section__trigger {
  width: 100%;
  display: flex; justify-content: space-between; align-items: center;
  padding: 2rem 0;
  font-size: var(--text-xl);
  font-weight: 600;
  background: none; border: none; cursor: pointer;
  text-align: left;
}
.drawer-section__icon {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-section[open] .drawer-section__icon {
  transform: rotate(45deg);
}
.drawer-section__content {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-section[open] .drawer-section__content {
  grid-template-rows: 1fr;
}
.drawer-section__inner { overflow: hidden; }
```

**Accessibility:** Use `<details>/<summary>` as base (progressive enhancement), or `role="button"` with `aria-expanded`. Ensure keyboard activation (Enter/Space). Announce expanded state to screen readers. Reduced motion: remove transition, instant open/close.

**Combinations:** Pairs with **Density Contrast** and **Data-Table as Primary UI** (drawers for row expansion). Works in **Content-First Directory** and **Industrial Precision** bundles. Conflicts with **Scroll-Scrubbed Animation** (drawers change page height, breaking scroll calculations).

**Complexity:** CSS-only (using `<details>` or `grid-template-rows`)

---

### 5.5 Density Contrast

**One-line:** Alternating between dense, information-packed sections and sparse, breathing sections.

**When to use:** Long marketing pages, documentation landing pages, product pages mixing features and narrative. Creates natural reading rhythm that prevents fatigue.

**Technique:**
```css
.section--sparse {
  padding-block: clamp(6rem, 12vw, 12rem);
  max-width: 48rem;
  margin-inline: auto;
  text-align: center;
}
.section--dense {
  padding-block: clamp(3rem, 6vw, 6rem);
  max-width: 72rem;
  margin-inline: auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}
.section--ultra-dense {
  padding-block: 2rem;
  max-width: 90rem;
  margin-inline: auto;
  font-size: var(--text-sm);
  line-height: 1.4;
}

/* Rhythm: sparse → dense → sparse creates natural reading pulse */
```

**Accessibility:** Dense sections must maintain readable font size (≥ 14px). Ensure sufficient line-height in dense sections (≥ 1.4). Sparse sections benefit screen magnifier users by reducing scroll distance to key content.

**Combinations:** Universal — works with every bundle. Core to **Content-First Directory** and **Industrial Precision**. Pairs naturally with **Variable Container Widths**. Conflicts with nothing; enhances everything.

**Complexity:** CSS-only

---

## 6. Spatial Techniques

Patterns for managing space, dividers, and visual depth.

### 6.1 Single-Formula Fluid System

**One-line:** All spacing, sizing, and type scale derive from one mathematical formula, creating self-consistent proportions.

**When to use:** Systems-oriented products, minimalist design, engineering tools. Teenage Engineering, Linear style. When mathematical rigor matters more than per-element fine-tuning.

**Technique:**
```css
:root {
  --base: 1rem;
  --ratio: 1.333; /* Perfect fourth */
  --s-2: calc(var(--base) / var(--ratio) / var(--ratio));
  --s-1: calc(var(--base) / var(--ratio));
  --s0: var(--base);
  --s1: calc(var(--base) * var(--ratio));
  --s2: calc(var(--base) * var(--ratio) * var(--ratio));
  --s3: calc(var(--base) * var(--ratio) * var(--ratio) * var(--ratio));
  --s4: calc(var(--base) * var(--ratio) * var(--ratio) * var(--ratio) * var(--ratio));
}

/* Applied consistently */
.card { padding: var(--s1); gap: var(--s0); }
.card__title { font-size: var(--s2); }
.card__body { font-size: var(--s0); }
.section { padding-block: var(--s4); }
.section__heading { font-size: var(--s3); }
```

**Accessibility:** Ensure computed values don't drop below minimum readable sizes. Test with browser zoom — formula-based sizes should scale proportionally. Base must be at least 1rem (16px).

**Combinations:** Core to **Industrial Precision** bundle. Pairs with **Anti-Animation** philosophy. May conflict with **Variable Container Widths** if the formula doesn't account for container variation. Conflicts with manually-tuned spacing systems.

**Complexity:** CSS-only

---

### 6.2 Fluid Spacing Without Breakpoints

**One-line:** All spacing uses `clamp()` to continuously adapt between viewport sizes, eliminating media query breakpoints for spacing.

**When to use:** Any modern site aiming for seamless responsiveness. Especially effective for content-focused sites where spacing rhythm is more important than layout restructuring.

**Technique:**
```css
:root {
  /* clamp(min, preferred, max) — preferred uses viewport units */
  --space-s: clamp(0.75rem, 0.5rem + 1vw, 1.25rem);
  --space-m: clamp(1.5rem, 1rem + 2vw, 2.5rem);
  --space-l: clamp(3rem, 2rem + 4vw, 5rem);
  --space-xl: clamp(4rem, 2.5rem + 6vw, 8rem);
  --space-2xl: clamp(6rem, 4rem + 8vw, 12rem);

  /* Fluid font sizes */
  --fluid-sm: clamp(0.875rem, 0.8rem + 0.25vw, 1rem);
  --fluid-base: clamp(1rem, 0.9rem + 0.4vw, 1.25rem);
  --fluid-lg: clamp(1.25rem, 1rem + 1vw, 2rem);
  --fluid-xl: clamp(2rem, 1.5rem + 2vw, 3.5rem);
  --fluid-display: clamp(3rem, 2rem + 4vw, 6rem);
}

.section { padding-block: var(--space-xl); }
.section__heading { font-size: var(--fluid-xl); }
.card-grid { gap: var(--space-m); }
```

**Accessibility:** Ensure `clamp()` minimum values meet readability requirements (16px body, 44px touch targets). Test at 320px and 1920px viewports to verify both extremes are usable.

**Combinations:** Universal — enhances every bundle. Pairs naturally with **Single-Formula Fluid System** (formula generates the clamp values). Works with all layout and scroll patterns.

**Complexity:** CSS-only

---

### 6.3 Gradient Dividers

**One-line:** Section dividers use gradient transitions rather than hard lines, softening boundaries between content areas.

**When to use:** Sites with color-shifting sections, dark-to-light transitions, or where hard borders feel too rigid. Stripe, Apple style.

**Technique:**
```css
.gradient-divider {
  height: clamp(4rem, 8vw, 8rem);
  background: linear-gradient(
    to bottom,
    var(--section-bg-above),
    var(--section-bg-below)
  );
}

/* Radial variant for spotlight effect */
.gradient-divider--radial {
  background: radial-gradient(
    ellipse 80% 100% at 50% 0%,
    var(--accent) 0%,
    transparent 70%
  );
  opacity: 0.15;
}

/* Noise texture overlay for organic feel */
.gradient-divider--textured::after {
  content: '';
  position: absolute; inset: 0;
  background: url("data:image/svg+xml,...") repeat;
  opacity: 0.03;
  mix-blend-mode: overlay;
}
```

**Accessibility:** No concerns — purely decorative. Ensure the gradient doesn't create a zone where text would be unreadable (no text should be placed over the divider).

**Combinations:** Core to **Layered Depth** and **Cinematic Scroll Narrative** bundles. Pairs with **Dark-to-Light Emotional Arc** and **Diagonal Section Breaks**. Conflicts with nothing; layer freely.

**Complexity:** CSS-only

---

### 6.4 Mix-Blend-Mode Layering

**One-line:** Overlapping elements use CSS blend modes to create depth and visual interaction between layers.

**When to use:** Creative portfolios, art direction sites, experimental design. When layers should feel compositionally aware of each other. Balky Studio, Lorenzo Dal Dosso style.

**Technique:**
```css
.blend-layer {
  position: relative;
}
.blend-layer__bg-text {
  position: absolute;
  font-size: clamp(6rem, 12vw, 16rem);
  font-weight: 900;
  color: var(--accent);
  mix-blend-mode: multiply; /* On light bg */
  opacity: 0.12;
  pointer-events: none;
  user-select: none;
}

/* Dark background variant */
.blend-layer--dark .blend-layer__bg-text {
  mix-blend-mode: screen; /* On dark bg */
  color: var(--accent);
  opacity: 0.2;
}

/* Image + text interaction */
.blend-layer__image {
  mix-blend-mode: luminosity;
}
.blend-layer__image:hover {
  mix-blend-mode: normal;
  transition: filter 0.5s;
}

/* Cursor-following blend element */
.blend-cursor {
  position: fixed;
  width: 20rem; height: 20rem;
  border-radius: 50%;
  background: var(--accent);
  mix-blend-mode: difference;
  pointer-events: none;
  transform: translate(-50%, -50%);
}
```

**Accessibility:** Blend modes can reduce text contrast — always verify contrast with the blended result, not source colors alone. `mix-blend-mode: difference` inverts colors unpredictably — never apply to body text. Cursor-following elements should be disabled for `prefers-reduced-motion`.

**Combinations:** Core to **Choreographed Studio** bundle. Pairs with **Text-Split Reveals** and **Marquee Navigation**. Works with **Kinetic Gallery**. Conflicts with **Data-Table as Primary UI** (blend modes on data tables impair readability).

**Complexity:** CSS-only (static) / JS-light (cursor-following)

---

### 6.5 Scale-Transform Breathing

**One-line:** Elements subtly scale in response to scroll position, creating a sense of the page "breathing."

**When to use:** Ambient, meditative sites — wellness, meditation apps, luxury brands. Wispr Flow style. When you want a calm, alive-feeling without aggressive animation.

**Technique:**
```js
const breatheEls = document.querySelectorAll('[data-breathe]');

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const ratio = entry.intersectionRatio;
      const scale = 0.95 + (ratio * 0.05); // 0.95 → 1.0
      const opacity = 0.7 + (ratio * 0.3);  // 0.7 → 1.0
      entry.target.style.transform = `scale(${scale})`;
      entry.target.style.opacity = opacity;
    }
  });
}, { threshold: Array.from({ length: 20 }, (_, i) => i / 19) });

breatheEls.forEach(el => observer.observe(el));
```
```css
[data-breathe] {
  transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1),
              opacity 0.8s ease;
  will-change: transform, opacity;
}

@media (prefers-reduced-motion: reduce) {
  [data-breathe] { transform: none !important; opacity: 1 !important; }
}
```

**Accessibility:** Movement is very subtle (5% scale, 30% opacity range) — within acceptable motion limits for most users. Still respect `prefers-reduced-motion`. Avoid on interactive elements where scale change might suggest interactivity.

**Combinations:** Pairs with **Rounded Section Stacking** (sections breathe as they enter). Works in **Sticky Card Stack** bundle. Conflicts with **Scroll-Scrubbed Animation** (competing scroll responses). Conflicts with **Anti-Animation**.

**Complexity:** JS-light

---

## 7. Typography as Architecture

Patterns where type itself defines spatial structure.

### 7.1 Viewport-Dominant Display Type

**One-line:** Display text scales to fill a large percentage of viewport width, becoming the dominant structural element.

**When to use:** Hero sections, portfolio headers, brand statements. When the message IS the design. Making Software, sebastianomerlino.com style.

**Technique:**
```css
.display-type {
  font-size: clamp(3rem, 12vw, 12rem);
  line-height: 0.9;
  font-weight: 800;
  letter-spacing: -0.03em;
  text-transform: uppercase;
  overflow-wrap: break-word;
}

/* Ensure it fills width regardless of text length */
.display-type--fitted {
  font-size: 1em;
  white-space: nowrap;
  /* JS sets --fitted-scale */
  transform: scaleX(var(--fitted-scale, 1));
  transform-origin: left;
}
```
```js
// Fit text to container width
function fitText(el) {
  const container = el.parentElement;
  const scale = container.offsetWidth / el.scrollWidth;
  el.style.setProperty('--fitted-scale', Math.min(scale, 1.2));
}
window.addEventListener('resize', () => {
  document.querySelectorAll('.display-type--fitted').forEach(fitText);
});
```

**Accessibility:** Large text is inherently more readable. Ensure text remains meaningful — don't sacrifice readability for visual impact. `overflow-wrap: break-word` prevents horizontal overflow. Test with browser text scaling.

**Combinations:** Core to **Typography-Dominant** bundle. Pairs with **Inverse Responsive Scaling** and **Decorated Inline Words**. Conflicts with **Image-First Layout** (competing for viewport dominance).

**Complexity:** CSS-only (basic) / JS-light (fitted variant)

---

### 7.2 Inverse Responsive Scaling

**One-line:** Display text gets proportionally LARGER on small screens rather than smaller, filling mobile viewports with bold type.

**When to use:** Bold mobile-first experiences, portfolio splash screens, statement pages. When the mobile experience should feel even more impactful than desktop. sebastianomerlino.com style.

**Technique:**
```css
.inverse-scale {
  /* Larger on mobile, relatively smaller on desktop */
  font-size: clamp(3.5rem, 15vw, 8rem);
  line-height: 0.85;
  font-weight: 900;
  letter-spacing: -0.04em;
}

/* At 375px (mobile): 15vw = 56px = 3.5rem (hits clamp minimum)
   At 768px (tablet): 15vw = 115px = 7.2rem
   At 1200px (desktop): hits 8rem clamp maximum
   Ratio: mobile text is ~50% of viewport width vs desktop ~30% */

/* Supporting text scales normally (contrast the approaches) */
.inverse-scale + .body-text {
  font-size: clamp(0.875rem, 0.8rem + 0.3vw, 1.125rem);
  max-width: 55ch;
}
```

**Accessibility:** Text remains large and readable at all sizes — this is an accessibility-positive pattern. Ensure the oversized text doesn't push critical content below the fold on mobile. Test with system font size adjustments.

**Combinations:** Core to **Typography-Dominant** bundle. Pairs with **Viewport-Dominant Display Type** (different sections). Conflicts with **Single-Formula Fluid System** (formula assumes proportional scaling, not inverse).

**Complexity:** CSS-only

---

### 7.3 Decorated Inline Words

**One-line:** Individual words within body text receive special treatment — highlight, underline, color, or animation — as semantic emphasis.

**When to use:** Marketing copy, brand pages, feature descriptions. When specific words deserve visual emphasis beyond bold/italic. sebastianomerlino.com style.

**Technique:**
```css
.decorated-word {
  position: relative;
  display: inline;
}

/* Highlight style */
.decorated-word--highlight {
  background: linear-gradient(120deg, var(--accent-muted) 0%, var(--accent-muted) 100%);
  background-repeat: no-repeat;
  background-size: 100% 40%;
  background-position: 0 85%;
}

/* Underline draw-on */
.decorated-word--underline::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -2px;
  height: 3px;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.in-view .decorated-word--underline::after { transform: scaleX(1); }

/* Color pop */
.decorated-word--accent { color: var(--accent); font-weight: 600; }

/* Serif swap (body is sans, decorated word is serif) */
.decorated-word--serif {
  font-family: var(--font-heading);
  font-style: italic;
  font-weight: 400;
}
```

**Accessibility:** Decorations must not be the only indicator of meaning — use semantic HTML (`<em>`, `<strong>`) alongside visual treatment. Color-only emphasis fails for color-blind users; pair color with weight or style change. Animated underlines should respect `prefers-reduced-motion`.

**Combinations:** Core to **Typography-Dominant** bundle. Pairs with **Font-Switching as Semantic Signal**. Works in most bundles as accent. Conflicts with heavy use of **Text-Split Reveals** (too much text treatment at once).

**Complexity:** CSS-only

---

### 7.4 Knockout / Mask Text

**One-line:** Text is used as a mask to reveal images, gradients, or video behind it.

**When to use:** Hero sections, artistic splash pages, section dividers. When text and imagery should merge into one visual element. High-impact, use sparingly.

**Technique:**
```css
/* Image fill */
.knockout-text {
  font-size: clamp(4rem, 10vw, 10rem);
  font-weight: 900;
  line-height: 0.9;
  background-image: url('/hero-image.jpg');
  background-size: cover;
  background-position: center;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent; /* Fallback */
}

/* Gradient fill */
.knockout-text--gradient {
  background-image: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* Animated gradient */
.knockout-text--animated {
  background-size: 200% 200%;
  animation: gradient-shift 8s ease infinite;
}
@keyframes gradient-shift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .knockout-text--animated { animation: none; background-position: 0% 50%; }
}
```

**Accessibility:** **Critical** — knockout text is invisible to screen readers if the text content isn't preserved properly. Use standard text in the HTML with the visual effect applied via CSS. Provide a `color` fallback for browsers that don't support `background-clip: text`. Ensure knockout text meets contrast requirements against the page background (test the effective contrast of the image/gradient visible through the text).

**Combinations:** Pairs with **Viewport-Dominant Display Type** (knockout at display scale). Works in **Typography-Dominant** bundle. Conflicts with **Text-Split Reveals** (splitting knockout text breaks the mask).

**Complexity:** CSS-only

---

### 7.5 Font-Switching as Semantic Signal

**One-line:** Different typefaces distinguish content types — serif for editorial, mono for technical, sans for UI — within the same page.

**When to use:** Multi-content-type sites, platforms with editorial + technical content, portfolios with varied project types. When typographic variety adds meaning, not just decoration.

**Technique:**
```css
:root {
  --font-ui: 'Inter', system-ui, sans-serif;
  --font-editorial: 'Newsreader', 'Georgia', serif;
  --font-technical: 'JetBrains Mono', 'Cascadia Code', monospace;
  --font-display: 'Cabinet Grotesk', 'Inter', sans-serif;
}

/* Each font signals content type */
.content--editorial {
  font-family: var(--font-editorial);
  font-size: 1.125rem;
  line-height: 1.75;
  letter-spacing: 0.01em;
}
.content--technical {
  font-family: var(--font-technical);
  font-size: 0.875rem;
  line-height: 1.6;
  letter-spacing: -0.01em;
}
.content--ui {
  font-family: var(--font-ui);
  font-size: 0.9375rem;
  line-height: 1.5;
}
.content--display {
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: -0.02em;
}
```

**Accessibility:** Limit to 3 font families maximum — more creates cognitive load. Ensure all fonts have adequate x-height for readability. Each font must have a well-matched fallback to prevent layout shift during loading. Use `font-display: swap` for all custom fonts.

**Combinations:** Core to **Typography-Dominant** bundle. Pairs with **Decorated Inline Words** (font swap as decoration). Works in any bundle as a refinement. Conflicts with nothing but imposes a page-weight cost (multiple font downloads).

**Complexity:** CSS-only

---

## Quick Reference: Pattern Compatibility Matrix

| Pattern | Best With | Avoid With |
|---------|-----------|------------|
| Variable Container Widths | Density Contrast, Dark-to-Light Arc | Single-Formula (if uniform) |
| Negative-Margin Overlap | Asymmetric Splits, Blend Modes | Rounded Stacking, Sticky Cards |
| Diagonal Breaks | Parallax, Gradient Dividers | Rounded Stacking |
| Rounded Stacking | Sticky Cards, Scale Breathing | Diagonal Breaks |
| Scroll-Scrubbed | Pin-and-Reveal, Dark-to-Light | Anti-Animation, Horizontal Scroll |
| Fixed Parallax | Diagonal Breaks, Gradient Dividers | Scroll-Scrubbed (same section) |
| Pin-and-Reveal | Scroll-Scrubbed, Dark-to-Light | Sticky Cards |
| Sticky Cards | Rounded Stacking, Scale Breathing | Pin-and-Reveal |
| Migratory Nav | Scroll Narrative, Choreography | Dual-Layer Nav, Absence |
| Marquee Nav | Blend Modes, Text Splits | All other nav patterns |
| Text-Split Reveals | Three-Tier Animation, Wipe Reveal | Heavy scroll animation |
| Dark-to-Light Arc | Scroll-Scrubbed, Pin-and-Reveal | Single-theme products |
| Image-First | Asymmetric Splits, Variable Widths | Data-Table UI |
| Data-Table UI | Density Contrast, Absence Nav | Image-First, Blend Modes |
| Viewport Display Type | Inverse Scaling, Decorated Words | Image-First (same section) |
