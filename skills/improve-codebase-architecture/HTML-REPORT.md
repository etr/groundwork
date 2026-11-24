# Architecture Review Report

The visual half of Step 3: one self-contained HTML file, written outside the repository and opened by the user in a browser. The chat list is the durable, copyable half; the report is the one that makes shallowness *visible* — a before/after diagram shows in a second what "interface nearly as complex as the implementation" takes a paragraph to say.

## Where it goes

A temp path **outside the repo and every worktree**, named for the survey scope plus a per-invocation uniqueness suffix (timestamp + PID), so two surveys — including two from different chats in the same second — never overwrite each other:

```bash
OUT="${TMPDIR:-/tmp}/groundwork-architecture-review-${SLUG}-$(date +%Y%m%d%H%M%S)-$$.html"
```

`SLUG` is the kebab-case name of the project or the area surveyed, 40 characters at most. Write the file with the `Write` tool, then tell the user the absolute path to open — the way `ux-design` hands over its comparison pages. Under WSL, also give the Windows path (`wslpath -w "$OUT"`). Nothing lands in the repository: the survey's durable record is the decision record and the Open decisions section, not this file.

## Self-contained and offline

Everything inline — CSS in one `<style>`, diagrams as inline SVG or styled `div`s. No CDN scripts, web fonts, or remote images: the report must render on a plane, behind a proxy, and as a saved artifact, and it must not execute third-party code. Follow the viewer's color scheme through `prefers-color-scheme`, and draw with `currentColor` so diagrams follow it too.

## Structure

Top to bottom:

1. **Header** — project or scope, date, how the survey was scoped (user-named area, or the hot spots with their commit counts), and the number of candidates. No introduction paragraph.
2. **Top recommendation** — one card: which candidate to tackle first, one sentence on why, an anchor link to it.
3. **Candidate cards** — one `<article>` per candidate, in recommendation order.

Each candidate card carries, in this order:

| Element | Content |
|---------|---------|
| Title | Names the deepening in domain language ("Collapse the order intake pipeline"), not the files |
| Badges | Recommendation strength (`Strong` / `Worth exploring` / `Speculative`) and the dependency category: `in-process`, `local-substitutable`, `ports & adapters`, or `external — mock` |
| Files | The modules involved, monospace, one line |
| Before / After | The centrepiece: two panes side by side, same height, labelled *Before — shallow* and *After — deep* |
| Problem | One sentence: what hurts |
| Solution | One sentence: what changes |
| Wins | Bullets of six words or fewer, in vocabulary terms |
| ADR callout | Only when the candidate contradicts a decision record: "Contradicts DR-0007 — worth reopening because …" |

## Diagram patterns

Pick the pattern that fits each candidate and vary them across the report — five identical diagrams show nothing. Keep each about 300px tall so Before and After sit side by side without scrolling.

| Pattern | Use when | Before | After |
|---------|----------|--------|-------|
| **Mass diagram** | The point is "interface as wide as implementation" | Two bars per module: interface nearly as tall as implementation | One module: a short interface bar over a tall implementation bar |
| **Boxes and arrows** | The point is a tangle of calls | Many small boxes, arrows crossing | One thick box, the former boxes faded inside it |
| **Cross-section** | Layered pass-throughs | Six thin bands a call passes through | One thick band carrying the consolidated responsibility |
| **Round trips** | A chatty boundary | A sequence strip: six arrows back and forth | One arrow each way |

For boxes and arrows, inline SVG with a marker for arrowheads:

```html
<svg viewBox="0 0 320 140" role="img" aria-label="Before: five shallow modules with crossing calls">
  <defs>
    <marker id="arrow-c1" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10z" fill="currentColor"/>
    </marker>
  </defs>
  <g fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="12" y="14" width="84" height="30" rx="5"/>
    <rect x="12" y="90" width="84" height="30" rx="5"/>
    <path d="M96 29H150" marker-end="url(#arrow-c1)"/>
    <path d="M96 105L150 40" marker-end="url(#arrow-c1)"/>
  </g>
  <g font-size="12" text-anchor="middle" fill="currentColor">
    <text x="54" y="33">pricing</text>
    <text x="54" y="109">cart</text>
  </g>
</svg>
```

Give each SVG its own marker id, a `role="img"`, and an `aria-label` that states what it shows. Labels inside diagrams read as schematic: small, uppercase, letter-spaced.

## Vocabulary and tone

The architectural nouns and verbs come straight from the skill's vocabulary: **module, interface, implementation, depth, deep, shallow, seam, adapter, leverage, locality**. Never substitute *component*, *service*, or *unit* for module; *API* or *signature* for interface; *boundary* for seam.

- Plain English, no hedging, no "it's worth noting that…". If a sentence could be a bullet, make it a bullet; if a bullet could be cut, cut it.
- Wins name the gain in vocabulary terms — "locality: bugs concentrate in one module", "leverage: one interface, N call sites" — never "easier to maintain" or "cleaner code".
- If a diagram needs a paragraph to be understood, redraw the diagram.

## Skeleton

Start from this and fill it in. Every color pair below meets WCAG AA for normal text in both color schemes.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Architecture review — {scope}</title>
<style>
  :root { color-scheme: light dark;
    --bg:#fafaf9; --panel:#ffffff; --ink:#1c1917; --muted:#57534e; --line:#e7e5e4;
    --accent:#1d4ed8; --ok:#166534; --warn:#92400e; --warn-bg:#fef3c7; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0c0a09; --panel:#1c1917; --ink:#f5f5f4; --muted:#a8a29e; --line:#292524;
      --accent:#93c5fd; --ok:#86efac; --warn:#fcd34d; --warn-bg:#422006; }
  }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 system-ui, sans-serif; }
  main { max-width:64rem; margin:0 auto; padding:2rem 1.25rem 4rem; }
  h1 { font-size:1.5rem; margin:0; }
  h2 { font-size:1.25rem; margin:0; }
  header p, #top p { color:var(--muted); margin:.35rem 0 0; }
  article, #top { background:var(--panel); border:1px solid var(--line); border-radius:.5rem; padding:1.25rem; margin-top:1.25rem; }
  .badges { display:flex; flex-wrap:wrap; gap:.5rem; margin:.6rem 0 1rem; }
  .badge { font-size:.75rem; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
    border:1px solid var(--line); border-radius:999px; padding:.15rem .6rem; }
  .badge.strong { color:var(--ok); }
  .badge.worth { color:var(--warn); }
  .files { font:13px/1.5 ui-monospace, monospace; color:var(--muted); margin:0 0 1rem; }
  .compare { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin:1rem 0; }
  .pane { border:1px solid var(--line); border-radius:.375rem; padding:.75rem; min-height:12rem; }
  .pane h3 { margin:0 0 .5rem; font-size:.7rem; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }
  .pane svg { width:100%; height:auto; }
  dl { display:grid; grid-template-columns:max-content 1fr; gap:.4rem 1rem; margin:0; }
  dt { font-weight:600; }
  dd { margin:0; }
  .wins { margin:.3rem 0 0; padding-left:1.1rem; }
  .adr { margin:1rem 0 0; padding:.6rem .8rem; border-radius:.375rem; background:var(--warn-bg); color:var(--warn); }
  a { color:var(--accent); }
</style>
</head>
<body>
<main>
  <header>
    <h1>Architecture review — {scope}</h1>
    <p>{date} · scoped by {user-named area | change hot spots: N commits, {top paths}} · {N} candidates</p>
  </header>

  <section id="top">
    <h2>Top recommendation</h2>
    <p><a href="#c1">{candidate title}</a> — {one sentence on why}.</p>
  </section>

  <article id="c1">
    <h2>{Title naming the deepening in domain language}</h2>
    <div class="badges">
      <span class="badge strong">Strong</span>
      <span class="badge">in-process</span>
    </div>
    <p class="files">{module a} · {module b} · {directory}</p>
    <div class="compare">
      <div class="pane"><h3>Before — shallow</h3>{inline SVG or styled divs}</div>
      <div class="pane"><h3>After — deep</h3>{inline SVG or styled divs}</div>
    </div>
    <dl>
      <dt>Problem</dt><dd>{One sentence: what hurts.}</dd>
      <dt>Solution</dt><dd>{One sentence: what changes.}</dd>
      <dt>Wins</dt>
      <dd><ul class="wins">
        <li>locality: bugs concentrate in one module</li>
        <li>leverage: one interface, N call sites</li>
      </ul></dd>
    </dl>
    <p class="adr">Contradicts {DR-NNN} — worth reopening because {reason}.</p>
  </article>
</main>
</body>
</html>
```
