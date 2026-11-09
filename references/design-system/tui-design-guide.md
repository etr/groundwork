# TUI Design Guide

Applies when the design system declares **Modality: tui**. The web defaults elsewhere in this skill (px spacing, elevation, radius, font pairing, scroll choreography) do not apply. The TUI surface is a **grid of monospace cells** rendered into a terminal the *user* configured: their theme, their font size, their window dimensions. Identity is built from color slots, text styles, glyphs, borders, and density — not from fonts, shadows, or shapes.

Load this guide for Steps 3–8 whenever modality is `tui`. It follows the same step names as the web track; sections below map to them.

## The Environment (read before any token decision)

Five constraints have no web analogue and shape everything downstream:

1. **Color capability ladder.** Terminals render ANSI 16, 256-color, or truecolor (16M). Detection: `COLORTERM=truecolor|24bit` → truecolor; otherwise 256; dumb terminals none. Every color decision must state its behavior at each rung.
2. **The background is the user's choice.** You do not control it. Light and dark terminal themes are both common, and many users theme their ANSI palette itself. Any foreground color you fix must work against backgrounds you didn't pick.
3. **Color is revocable.** Honor `NO_COLOR`, non-TTY output, and `TERM=dumb` (see clig.dev and no-color.org): degrade to plain text, never to garbage. Machine-readable output (`--json`, `--plain`) is a sibling requirement, not an afterthought.
4. **The grid resizes at any moment.** From an 80×24 ssh session to a 300-column tmux-less monitor, mid-session. Layout is constraint-based (think Flexbox-in-cells, as Ratatui frames it), never fixed-position.
5. **Alt-screen is a takeover.** Full-screen mode (like vim/htop) hides scrollback, hijacks the cursor, and is hostile to screen readers (see Accessibility below). Choosing alt-screen vs inline (append to scrollback, like Claude Code's default renderer) is a **product-level decision**, not a rendering detail.

## Palette Strategy (the TUI identity decision)

Every modality has one "brand vs environment" decision. For TUIs it is: **does the product impose its palette or respect the user's terminal theme?** Choose explicitly and record it as a BRD decision — it is the TUI equivalent of the web tonal direction.

| Strategy | Identity | Portability | When |
|----------|----------|-------------|------|
| **Semantic ANSI slots** — style only through named roles (red/green/bold/dim) mapped to the user's 16-color palette | Weak — the app looks like the user's terminal, because it is | Excellent everywhere | Tools used inside other people's workflows (git-like CLIs, build tools, status lines) |
| **Truecolor brand** — fixed RGB palette imposed on the terminal | Strong — recognizable screenshots | Breaks on 256-color terminals; fights user themes | Consumer-facing apps where being recognizable is the point |
| **Hybrid (recommended default)** — truecolor primary palette **with** a declared ANSI-16 fallback map, plus light/dark adaptive variants | Strong where supported, coherent where not | Good, at the cost of a real fallback table | Most products; this is the Lip Gloss "adaptive colors" model |

Hybrid requirements: (a) every brand color has an explicit ANSI-16 fallback (nearest slot, chosen by eye against both themes, not computed blindly); (b) foreground colors get light-bg and dark-bg variants selected by background detection or the user's setting; (c) the fallback map is part of the design system, so implementations don't invent it per widget.

**Contrast under an unknown background:** every fixed foreground/background pairing you *do* control (e.g., selected-row reverse video, banner bars) must pass 4.5:1 (3:1 for large/UI). Foreground colors worn against the *user's* background must pass against a light and a dark reference theme — name them (e.g., default white, default black, one themed dark like Solarized Dark) and check both. Verify programmatically (the plugin's `lib/contrast-check.js` computes WCAG ratios); greys that look fine routinely fail.

**Never color alone.** Limited palettes make this worse, not better: error/success must differ in weight or glyph (✗/✓), not just hue — colorblind users on a 16-color terminal see none of your distinction.

## Tokens (Step 3)

The two-layer principle carries over — primitives (raw ANSI indices / RGB values) named separately from semantic slots. Only the semantic layer is referenced by components.

| Category | Tokens | Notes |
|----------|--------|-------|
| Color slots | `color-primary`, `color-accent`, `color-success`, `color-warning`, `color-error`, `color-info`, `color-text`, `color-text-muted`, `color-surface`, `color-border` | Semantic names; each carries truecolor + ANSI fallback + light/dark variants per the palette strategy |
| Text styles | `style-emphasis` (bold), `style-muted` (dim), `style-inverted` (reverse), `style-title`, `style-heading`, `style-label` | Bold/dim/reverse **are** the TUI type ramp — see Typography |
| Spacing | `space-0`–`space-3` in **cells** (0, 1, 2, 3) | Everything is an integer of cells; 1-cell padding is the default inset |
| Borders | `border-none`, `border-ascii`, `border-single`, `border-double`, `border-rounded` | A border costs 2 columns + 2 rows — a real budget decision, not decoration |
| Glyphs | `glyph-ok`, `glyph-err`, `glyph-bullet`, `glyph-ellipsis`, … | Each glyph token names its Unicode codepoint **and** its ASCII fallback (`✓`/`v`, `…`/`...`) |
| Key hints | `hint-quit`, `hint-help`, `hint-confirm`, … | The bottom status bar's vocabulary; see Status Line |

Semantic z-layers still exist (`layer-base`, `layer-overlay`, `layer-modal`) — express as draw order, not z-index numbers.

## Typography (Step 5)

There are no fonts. Hierarchy is built from four levers only:

| Lever | Usage |
|-------|-------|
| **Weight/emphasis** | Bold for the single most important thing in a pane — titles, the selected row, the number that matters. One bold thing per visual group |
| **Dim** | Secondary metadata (timestamps, ids, hints). Dim is your `--text-secondary` |
| **Reverse video** | Focus/selection state and banner bars. Not decoration |
| **Color + spacing** | Structural separation (borders, blank lines, alignment) instead of font-size jumps |

Anti-patterns: ALL-CAPS walls for "headers"; underline decoration (historic terminal meaning: user input); double emphasis (bold + reverse + color). Case is a lever — small-caps-style labels via uppercase are fine for one-word labels, not sentences.

**Glyph discipline:** box-drawing characters are fine as structure (your border tokens); decorative Unicode (arrows as bullets, emoji as icons) must come from glyph tokens with ASCII fallbacks. Nerd-font icon glyphs are **opt-in** only — detect, degrade to ASCII letters, never render tofu boxes by default. Assume East-Asian-wide characters and emoji occupy two cells when aligning columns.

## Layout & Screen Architecture (Steps 7a/7c)

- **Panes, not pages.** The screen is splits (vertical/horizontal) with constraint-based sizing: fixed rows/cols for chrome (status line, key hints), the rest flexible. Define the layout as constraints, never absolute positions.
- **The 80×24 floor.** Design for 80×24 as the minimum readable experience; define a **degradation ladder** and record it as a UXD decision: full multi-pane → collapsed (stacked panes / hidden sidebars) → single focus pane → line-oriented output. No rung may silently hide information.
- **Chrome grammar:** a top title bar (app + context + state), a bottom key-hint bar, an optional right/left pane. The status line shows *state* (mode, connection, counts), key hints show *affordances* — keep them separate concepts even if they share a row.
- **Command palette** (like fzf-style finders) is the TUI's search/navigation primitive — prefer it over burying actions in nested menus.
- **Modals/overlays** in the grid: center box with border, background dimmed or bordered-off; focus trapped in the overlay; Esc always closes.
- Alt-screen vs inline (see The Environment §5) — whichever you choose, the empty/loading/error states of each pane are designed, not improvised.

## Interaction (Step 7a)

**Keyboard-first is the floor, not the achievement.** Everything reachable by keys alone; the mouse is a progressive enhancement with a declared policy (none / scroll-only / full pointer support) recorded as a UXD decision.

- **Conventions before creativity:** `?` or `F1` help, `Esc` back/close, `q` quit (when not in a text field), `Ctrl-C` always interruptible, vi-style `j/k` or arrows for lists, `/` to search. Deviations must be more valuable than the convention.
- **Focus is always visible:** selected row (reverse video or `color-primary` bar), plus a pane-level focus indicator — the user must know which pane hears their keystrokes.
- **Eight states recast:** no hover. default / **selected-or-focused** / active (key held) / disabled → dim / loading (spinner in pane header) / error (border or status line, never a wall of red) / success (transient status line, not a modal).
- **Forms:** either line-editing fields (label, boxed input, inline validation below) or key-driven choosers (list + Enter). Pick one style per product. Validation on submit/leave-field, not per keystroke.

## Motion (Step 7a)

Motion exists in exactly three TUI forms — spinners, progress bars/gauges, and transient emphasis (flash of a changed row). Rules: update-on-change, don't redraw-storm (redraw cost is real over ssh); no animation at all when output is piped or `NO_COLOR` is set; no flashing faster than 3Hz; spinners in *pane chrome* (title), never over content. A reduced-motion setting (or flag) replaces animation with static text (`…`, `50%`).

## Accessibility (the hard part)

Full-screen TUIs are **hostile to screen readers** — alt-screen repositioning, cursor jumps, and character-drawn layout destroy the linear reading model that screen readers depend on (this is a documented, current problem, not a legacy one). Design for it:

- **Offer a line-oriented mode.** Either `--plain` output, or a screen-reader mode that appends state changes as lines instead of repainting. This is a first-class pattern, not a fallback flag — record it as a UXD decision.
- **Keyboard-only:** guaranteed by design; test that focus order matches reading order (top-left → bottom-right).
- **Focus visibility and color-independence** as above — screen readers and low-vision users get the same state changes through text.
- **Contrast:** dual-theme requirement from Palette Strategy; test both.
- **Resize robustness:** information may compress but must not disappear (degradation ladder).
- **Reduced motion / no flicker:** as in Motion.

See `checklists/accessibility.md` → "TUI Dialect" for the review checklist form of these rules.

## Writing (Step 6)

The Step 6 voice/writing rules transfer intact. TUI additions (from clig.dev): errors are human sentences with What + Why + Fix, written to the error surface (status line / log pane), never a cleared screen; state changes are reported ("Loaded 3 projects"), not just final states; keep status-line text short enough to survive 80 columns without wrapping surprises; exit codes and `--json`/`--plain` output stay correct even when the TUI is pretty.

## Slop tells specific to TUI

The general slop checklist applies; the authoritative TUI shape list lives in `checklists/design-slop.md` → Group B ("TUI shapes") — this section mirrors it for design-time guidance:

- ASCII-art logo/banner splashes on startup of a professional tool
- Emoji as the icon system in ops/dev tools
- Double-line borders on every pane ("fancy" as the default)
- Truecolor gradients on surfaces when the target terminals (and themes) vary
- "Hacker" costume: green-on-black, glitch effects, matrix vibes without a product reason
- Key-hint bars that grow to show every binding on every screen instead of `?`-help
- Spinners with 20 art frames; decorative frame-by-frame animations on ssh tools

## Comparison & Preview Artifacts (Steps 5, 7b, 7d, 8b)

All comparison/preview artifacts remain self-contained HTML, rendered as **terminal-frame mocks**: a monospace grid inside terminal chrome. They must double as implementation references for the building agent:

- Monospace font, exact **cell dimensions** stated (e.g., "mock renders 80×24"), `pre`-based grid layout
- Every color shown as **three values**: token name, truecolor hex, ANSI fallback index (`color-primary · #5E81AC · ANSI 4`)
- Render each candidate at 80×24 **and** one degraded size (e.g., 60×20 collapsed ladder rung)
- Show light-bg and dark-bg variants side by side when the palette strategy is hybrid
- WCAG contrast computed inline against the named reference themes (same as the web comparison files)

## Sources

- Textual guide (styles/CSS/themes/layout) — textual.textualize.io — the fullest existing TUI design system
- Charm Lip Gloss (adaptive colors, color profiles) — github.com/charmbracelet/lipgloss
- Ratatui (constraint layout) — ratatui.rs
- CLI Guidelines — clig.dev; NO_COLOR — no-color.org
- Exemplars: awesome-tuis (github.com/rothgar/awesome-tuis) — lazygit, k9s, btop, fzf
- TUI accessibility: "The text mode lie" (OSNews 2026) and its HN thread; anthropics/claude-code issue #63500 (VoiceOver vs fullscreen alt-screen)
