# Design System Template

Use this template when creating `{{specs_dir}}/design_system.md`.

```markdown
# Design System Specification

**Version:** 0.1
**Last updated:** <date>
**Status:** Draft | Review | Approved

---

## 1) Design Foundations

### 1.1 Accessibility Requirements

**Compliance Level:** [WCAG 2.1 AA | AAA | Section 508]
**Date Decided:** YYYY-MM-DD

| Requirement | Standard | Notes |
|-------------|----------|-------|
| Color Contrast (text) | [4.5:1 | 7:1] | Normal text minimum |
| Color Contrast (large text) | [3:1 | 4.5:1] | 18pt+ or 14pt bold |
| Focus Indicators | Visible | 3:1 contrast against adjacent |
| Keyboard Navigation | Full | All interactive elements |
| Screen Reader | Compatible | ARIA labels, semantic HTML |

### 1.2 Design Principles

[List DP-NNN decisions here]

### 1.3 Token Categories

| Category | Purpose | Values Defined In |
|----------|---------|-------------------|
| Colors | Brand identity, semantic meaning | Section 2.1 |
| Typography | Font families, sizes, weights | Section 2.2 |
| Spacing | Layout rhythm and consistency | Below |
| Elevation | Shadow and layering hierarchy | Below |
| Border Radius | Shape language | Below |
| Animation | Motion timing and easing | Section 3.7 |
| Breakpoints | Responsive boundaries | Section 3.6 |

#### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--space-0` | 0 | No space |
| `--space-1` | 4px | Tight spacing (icons, inline) |
| `--space-2` | 8px | Compact spacing (form fields) |
| `--space-3` | 12px | Default spacing |
| `--space-4` | 16px | Section spacing |
| `--space-6` | 24px | Group spacing |
| `--space-8` | 32px | Major section spacing |
| `--space-12` | 48px | Page section spacing |
| `--space-16` | 64px | Hero/header spacing |

#### Elevation Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--elevation-0` | none | Flat surfaces |
| `--elevation-1` | `0 1px 3px rgba(0,0,0,0.12)` | Cards, raised surfaces |
| `--elevation-2` | `0 4px 6px rgba(0,0,0,0.15)` | Dropdowns, popovers |
| `--elevation-3` | `0 10px 20px rgba(0,0,0,0.19)` | Modals, dialogs |

#### Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-none` | 0 | Sharp corners |
| `--radius-sm` | 4px | Buttons, inputs |
| `--radius-md` | 8px | Cards |
| `--radius-lg` | 12px | Modals |
| `--radius-full` | 9999px | Pills, avatars |

### 1.4 Platform Requirements

| Platform | Minimum Support | Notes |
|----------|-----------------|-------|
| [Web/Mobile/Desktop] | [versions] | [constraints] |

---

## 2) Brand Identity

[Populated by branding skill]

### 2.1 Color System

[Color tokens and palette]

### 2.2 Typography

[Font families, type scale]

### 2.3 Logo Usage

[Logo guidelines if applicable]

### 2.4 Brand Voice

[Tone and writing principles]

### 2.5 Visual Atmosphere

**Tonal Direction:** [e.g., brutally minimal, warm editorial, retro-futuristic, organic warmth, quiet luxury, playful, editorial, brutalist, art deco, soft atmospheric, industrial, geometric bold]

**Surface Treatments:**
| Surface | Treatment | Notes |
|---------|-----------|-------|
| Backgrounds | [e.g., subtle noise texture, gradient wash, solid flat] | [usage context] |
| Cards | [e.g., glass morphism, sharp shadow, flat border, soft elevation] | [hover behavior] |
| Section dividers | [e.g., hairline, gradient fade, whitespace only, decorative rule] | [rhythm role] |
| Image treatments | [e.g., rounded corners, duotone filter, masked shapes, full-bleed] | [brand expression] |

**Spatial Character:**
| Property | Approach | Notes |
|----------|----------|-------|
| Alignment | [e.g., strict grid, organic offset, centered, asymmetric] | [overall rhythm] |
| Density | [e.g., generous whitespace, compact utilitarian, varied rhythm] | [content type influence] |
| Hero treatment | [e.g., full-bleed, contained card, split layout, typographic-only] | [landing/key pages] |
| Content rhythm | [e.g., regular cadence, varied section sizes, alternating layouts] | [scroll experience] |

**Signature Details:**
[Distinctive micro-decisions that make this design recognizable — e.g., specific border radius for all elements, a recurring accent line, a particular way images are cropped, a color treatment on hover states]

---

## 3) UX Patterns

[Populated by ux-patterns skill]

### 3.1 Navigation

[Navigation structure and patterns]

### 3.2 Loading States

[Loading feedback patterns]

### 3.3 Error Handling

[Error display and recovery]

### 3.4 Empty States

[Empty state patterns]

### 3.5 Form Patterns

[Form validation and interaction]

### 3.6 Responsive Behavior

[Breakpoints and adaptation]

### 3.7 Motion & Interaction Character

**Timing Tokens:**
[Animation timing and usage]

**Entrance Patterns:**
| Element | Entrance | Duration | Notes |
|---------|----------|----------|-------|
| Page content | [e.g., fade-up, slide-in, cut] | [ms] | [stagger behavior] |
| Cards/lists | [e.g., staggered fade, cascade, instant] | [ms] | [delay pattern] |
| Modals/dialogs | [e.g., scale-fade, slide-up, instant] | [ms] | [backdrop behavior] |

**Hover Signatures:**
| Element | Hover Effect | Notes |
|---------|-------------|-------|
| Buttons | [e.g., subtle lift + shadow, color shift, underline reveal] | [brand personality] |
| Cards | [e.g., border glow, subtle scale, shadow deepen, accent reveal] | [interaction invitation] |
| Links | [e.g., underline slide, color transition, background highlight] | [discoverability] |

**Scroll Behavior:**
| Pattern | Usage | Notes |
|---------|-------|-------|
| [e.g., parallax, sticky headers, reveal-on-scroll, none] | [where applied] | [reduced-motion fallback] |

### 3.8 Visual Atmosphere

**Background treatments, card surfaces, section dividers, and image styles that create the product's visual feel.**

[Reference §2.5 for defined treatments. This section documents how those treatments are applied across UX patterns.]

### 3.9 Spatial Composition

**Alignment style, density, hero treatments, and content rhythm that define the product's layout personality.**

[Reference §2.5 for defined spatial character. This section documents how spatial decisions apply across page types and breakpoints.]

---

## 4) Component Guidelines

[Summary mapping components to design decisions]

| Component | Key Decisions | Notes |
|-----------|---------------|-------|
| Button | BRD-NNN (color), DP-NNN (clarity) | Primary, secondary, ghost variants |
| Input | BRD-NNN (typography), UXD-NNN (validation) | Focus states, error states |
| Card | DP-NNN (elevation), BRD-NNN (radius) | Consistent shadow, padding |

---

## 5) Decision Log

### Design Principles (DP-NNN)

[List all DP decisions]

### Brand Decisions (BRD-NNN)

[List all BRD decisions]

### UX Decisions (UXD-NNN)

[List all UXD decisions]

---

## 6) Open Questions & Risks

| ID | Question/Risk | Impact | Owner |
|----|---------------|--------|-------|
| DS-001 | [description] | [H/M/L] | [who] |
```
