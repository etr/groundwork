# Layout Architecture Implementation Techniques

- What this is: the CSS and JS implementation for each of the 36 layout patterns in `layout-architecture-guide.md`, in the guide's order.
- Section numbers match `layout-architecture-guide.md` exactly — the implementation of its pattern 3.2 sits under `### 3.2` here.
- Decision guidance (what each pattern is, when to use it, accessibility caveats, combination warnings) lives in `layout-architecture-guide.md`, not here.

---

## 1. Section Geometry

### 1.1 Variable Container Widths

**Key CSS:**
```css
.section { --container: 72rem; margin-inline: auto; padding-inline: clamp(1rem, 5vw, 3rem); max-width: var(--container); }
.section--narrow { --container: 48rem; }
.section--wide { --container: 90rem; }
.section--full { max-width: none; padding-inline: 0; }

/* Transition between widths feels intentional with consistent vertical spacing */
.section + .section { margin-block-start: clamp(4rem, 8vw, 8rem); }
```

---

### 1.2 Negative-Margin Overlap

**Key CSS:**
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

---

### 1.3 Diagonal Section Breaks

**Key CSS:**
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

---

### 1.4 Asymmetric Splits

**Key CSS:**
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

---

### 1.5 Rounded Section Stacking

**Key CSS:**
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

---

## 2. Scroll Architecture

### 2.1 Scroll-Scrubbed Animation

**CSS-native approach (Scroll-driven Animations API):**
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

**JS fallback (GSAP ScrollTrigger):**
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

---

### 2.2 Fixed-Position Parallax

**Key CSS (pure-CSS perspective method):**
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

**JS hook (rAF scroll listener):**
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

---

### 2.3 Pin-and-Reveal

**JS hook (GSAP ScrollTrigger pin with progressive reveal):**
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

**Key CSS (panel layout and reduced-motion fallback):**
```css
.pin-section { display: flex; flex-wrap: nowrap; width: max-content; }
.reveal-panel { width: 100vw; height: 100vh; flex-shrink: 0; }

/* Reduced motion: stack vertically, no pinning */
@media (prefers-reduced-motion: reduce) {
  .pin-section { flex-wrap: wrap; width: auto; }
  .reveal-panel { height: auto; min-height: 60vh; }
}
```

---

### 2.4 Sticky Card Cascade

**Key CSS (sticky stacking):**
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

**Optional JS (scale down covered cards):**
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

---

### 2.5 Horizontal Scroll Conversion

**JS hook (GSAP horizontal scroll conversion):**
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

**Key CSS (panel layout and reduced-motion fallback):**
```css
.h-scroll { display: flex; flex-wrap: nowrap; }
.h-scroll__panel { min-width: 100vw; flex-shrink: 0; }

/* Reduced motion: native horizontal scroll */
@media (prefers-reduced-motion: reduce) {
  .h-scroll { overflow-x: auto; scroll-snap-type: x mandatory; }
  .h-scroll__panel { scroll-snap-align: start; }
}
```

---

## 3. Navigation Innovation

### 3.1 Migratory Navigation

**JS hook (IntersectionObserver sets the nav mode):**
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

**Key CSS (per-mode nav styles):**
```css
.nav { position: fixed; top: 0; transition: top 0.4s cubic-bezier(0.16, 1, 0.3, 1), width 0.4s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.4s cubic-bezier(0.16, 1, 0.3, 1), background 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.nav[data-mode="hero"] { top: auto; bottom: 2rem; width: auto; border-radius: 2rem; }
.nav[data-mode="content"] { top: 0; width: 100%; border-radius: 0; background: var(--glass); backdrop-filter: blur(12px); }
.nav[data-mode="minimal"] { width: 3rem; height: 3rem; border-radius: 50%; overflow: hidden; }
```

---

### 3.2 Dual-Layer Contextual Navigation

**Key CSS (global and contextual layers):**
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

**JS hook (show or hide the contextual nav):**
```js
// Show/hide contextual nav based on section
const contextNav = document.querySelector('.nav-contextual');
const section = document.querySelector('.product-section');

const obs = new IntersectionObserver(([entry]) => {
  contextNav.setAttribute('aria-hidden', !entry.isIntersecting);
}, { rootMargin: '-56px 0px 0px 0px' }); // Offset for global nav height

obs.observe(section);
```

---

### 3.3 Content-Push Menu

**Key CSS:**
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

---

### 3.4 Marquee Navigation

**Key CSS:**
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

---

### 3.5 Embedded Hero Navigation

**Key CSS (embedded layout and scrolled state):**
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

**JS hook (toggle the scrolled state):**
```js
const heroNav = document.querySelector('.hero-nav');
const hero = document.querySelector('.hero');

const obs = new IntersectionObserver(([entry]) => {
  heroNav.classList.toggle('hero-nav--scrolled', !entry.isIntersecting);
}, { threshold: 0.1 });

obs.observe(hero);
```

---

### 3.6 Navigation by Absence

**Key CSS:**
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

---

## 4. Content Choreography

### 4.1 Text-Split Reveals

**JS hook (split text into spans, reveal on intersection):**
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

**Key CSS (staggered character transition):**
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

---

### 4.2 Three-Tier Animation System

**Key CSS (three timing tiers):**
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

**JS hook (add in-view on intersection):**
```js
const animEls = document.querySelectorAll('[data-animate]');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in-view'); });
}, { threshold: 0.15 });
animEls.forEach(el => observer.observe(el));
```

---

### 4.3 Cover-Wipe Reveal

**Key CSS:**
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

---

### 4.4 Dark-to-Light Emotional Arc

**Key CSS (start and end color variables, transition):**
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
  transition: background 0.8s cubic-bezier(0.65, 0, 0.35, 1), color 0.6s cubic-bezier(0.65, 0, 0.35, 1);
}
```

**JS hook (interpolate each section's color):**
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

---

### 4.5 Kinetic Gallery

**JS hook (cursor-tracking transforms):**
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

**Key CSS (grid layout, touch and reduced-motion guards):**
```css
.kinetic-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
}
.gallery-item {
  transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
/* Promote the layer only while the cursor is over the gallery */
@media (hover: hover) {
  .kinetic-gallery:hover .gallery-item { will-change: transform; }
}

@media (prefers-reduced-motion: reduce) {
  .gallery-item { transition: none; }
}
/* On touch devices, skip cursor tracking — use subtle scroll parallax instead */
@media (hover: none) {
  .gallery-item { transform: none !important; }
}
```

---

## 5. Content Hierarchy

### 5.1 Image-First Layout

**Key CSS:**
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

---

### 5.2 Data-Table as Primary UI

**Key CSS:**
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

---

### 5.3 Same-Component Scale Variation

**Key CSS:**
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

---

### 5.4 Drawer-as-Section

**Key CSS:**
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

---

### 5.5 Density Contrast

**Key CSS:**
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

---

## 6. Spatial Techniques

### 6.1 Single-Formula Fluid System

**Key CSS:**
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

---

### 6.2 Fluid Spacing Without Breakpoints

**Key CSS:**
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

---

### 6.3 Gradient Dividers

**Key CSS:**
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

---

### 6.4 Mix-Blend-Mode Layering

**Key CSS:**
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

---

### 6.5 Scale-Transform Breathing

**JS hook (scale from intersection ratio):**
```js
const breatheEls = document.querySelectorAll('[data-breathe]');

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-breathe'); // opts in will-change only while animating
      const ratio = entry.intersectionRatio;
      const scale = 0.95 + (ratio * 0.05); // 0.95 → 1.0
      const opacity = 0.7 + (ratio * 0.3);  // 0.7 → 1.0
      entry.target.style.transform = `scale(${scale})`;
      entry.target.style.opacity = opacity;
    } else {
      entry.target.classList.remove('is-breathe');
    }
  });
}, { threshold: Array.from({ length: 20 }, (_, i) => i / 19) });

breatheEls.forEach(el => observer.observe(el));
```

**Key CSS (transition and reduced-motion fallback):**
```css
[data-breathe] {
  transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1),
              opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}
[data-breathe].is-breathe { will-change: transform, opacity; }

@media (prefers-reduced-motion: reduce) {
  [data-breathe] { transform: none !important; opacity: 1 !important; }
}
```

---

## 7. Typography as Architecture

### 7.1 Viewport-Dominant Display Type

**Key CSS (display size and fitted variant):**
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

**JS hook (fit text to container width):**
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

---

### 7.2 Inverse Responsive Scaling

**Key CSS:**
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

---

### 7.3 Decorated Inline Words

**Key CSS:**
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

---

### 7.4 Knockout / Mask Text

**Key CSS:**
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
  animation: gradient-shift 8s linear infinite;
}
@keyframes gradient-shift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .knockout-text--animated { animation: none; background-position: 0% 50%; }
}
```

---

### 7.5 Font-Switching as Semantic Signal

**Key CSS:**
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
