# UX Pattern Examples

Reference implementations for common interaction patterns.

## Navigation Patterns

### Sidebar Navigation

```
┌─────────────────────────────────────────────────┐
│ Logo         Search...               [Avatar]   │
├────────┬────────────────────────────────────────┤
│        │                                        │
│ 🏠 Home │                                        │
│        │                                        │
│ 📊 Dash │          Main Content Area            │
│        │                                        │
│ 📁 Proj │                                        │
│  └ Proj1│                                        │
│  └ Proj2│                                        │
│        │                                        │
│ ⚙ Sett │                                        │
│        │                                        │
└────────┴────────────────────────────────────────┘
```

**Behavior:**
- Collapsible on desktop (icon-only mode)
- Slide-in drawer on mobile
- Persistent expanded on large screens

### Bottom Tab Navigation (Mobile)

```
┌──────────────────────────┐
│                          │
│                          │
│      Main Content        │
│                          │
│                          │
├────────┬────────┬────────┤
│  🏠   │  🔍   │  👤   │
│ Home  │ Search │ Profile │
└────────┴────────┴────────┘
```

**Rules:**
- Maximum 5 items
- Active item highlighted
- Labels always visible
- No nested navigation

## Loading State Patterns

### Skeleton Screen

```
┌─────────────────────────────────────┐
│ ████████████████                    │  ← Title placeholder
├─────────────────────────────────────┤
│ ┌─────┐  ████████████████████████  │  ← Avatar + name
│ │     │  ██████████                 │
│ └─────┘                             │
├─────────────────────────────────────┤
│ ████████████████████████████████   │  ← Content lines
│ ████████████████████████████       │
│ █████████████████                   │
└─────────────────────────────────────┘
```

**Implementation:**
```css
.skeleton {
  background: linear-gradient(
    90deg,
    #e0e0e0 25%,
    #f0f0f0 50%,
    #e0e0e0 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### Loading Button State

```
Before:  [  Save Changes  ]
During:  [  ⟳ Saving...   ]
After:   [  ✓ Saved       ] → returns to [Save Changes]
```

**Timing:**
- Show spinner after 100ms delay (avoid flash)
- Show success state for 1500ms
- Return to default state

## Error Handling Patterns

### Inline Field Error

```
┌─────────────────────────────────────┐
│ Email Address                       │
│ ┌─────────────────────────────────┐ │
│ │ invalid-email                   │ │  ← Red border
│ └─────────────────────────────────┘ │
│ ⚠ Please enter a valid email       │  ← Red text, icon
└─────────────────────────────────────┘
```

### Toast Notification

```
                    ┌────────────────────────────┐
                    │ ⚠ Connection lost. Retry?  │
                    │               [Retry] [×]  │
                    └────────────────────────────┘
```

**Behavior:**
- Appears from top or bottom edge
- Auto-dismisses after 5 seconds (unless actionable)
- Stackable (max 3 visible)
- Swipe to dismiss on mobile

### Error Banner

```
┌─────────────────────────────────────────────────┐
│ ⚠ Your session expired. [Log in again]    [×]  │
└─────────────────────────────────────────────────┘
│                                                 │
│              Normal page content                │
│                                                 │
```

**Behavior:**
- Pushes content down (not overlay)
- Persists until dismissed or resolved
- Supports multiple banners (stack)

## Empty State Patterns

### First-Run Empty State

```
┌─────────────────────────────────────┐
│                                     │
│           [Illustration]            │
│                                     │
│        Welcome to Projects!         │
│                                     │
│   Create your first project to      │
│   start organizing your work.       │
│                                     │
│      [+ Create Project]             │
│                                     │
│   or import from template →         │
│                                     │
└─────────────────────────────────────┘
```

### No Search Results

```
┌─────────────────────────────────────┐
│                                     │
│            🔍                        │
│   No results for "xyz123"           │
│                                     │
│   Suggestions:                      │
│   • Check your spelling             │
│   • Try different keywords          │
│   • [Clear filters]                 │
│                                     │
│   Popular searches:                 │
│   react • typescript • api          │
│                                     │
└─────────────────────────────────────┘
```

## Form Patterns

### Inline Validation

```
Password strength:
┌─────────────────────────────────────┐
│ ••••••••••                          │
└─────────────────────────────────────┘
[████████░░░░░░░░] Strong

✓ At least 8 characters
✓ Contains a number
✗ Contains a special character
```

### Multi-Step Form

```
Step 1 of 3: Account Details
[●]────────[○]────────[○]

┌─────────────────────────────────────┐
│ Email                               │
│ ┌─────────────────────────────────┐ │
│ │ user@example.com                │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Password                            │
│ ┌─────────────────────────────────┐ │
│ │ ••••••••••                      │ │
│ └─────────────────────────────────┘ │
│                                     │
│           [← Back]  [Continue →]    │
└─────────────────────────────────────┘
```

**Behavior:**
- Progress indicator shows current step
- Back button available (except step 1)
- Validate current step before proceeding
- Allow skipping optional steps

## Responsive Patterns

### Data Table Adaptation

**Desktop (>1024px):**
```
┌──────┬────────────┬──────────┬────────┬─────────┐
│ Name │ Email      │ Role     │ Status │ Actions │
├──────┼────────────┼──────────┼────────┼─────────┤
│ John │ john@...   │ Admin    │ Active │ [Edit]  │
└──────┴────────────┴──────────┴────────┴─────────┘
```

**Mobile (<640px):**
```
┌─────────────────────────────────────┐
│ John Doe                      [···] │
│ john@example.com                    │
│ Admin · Active                      │
├─────────────────────────────────────┤
│ Jane Smith                    [···] │
│ jane@example.com                    │
│ Member · Active                     │
└─────────────────────────────────────┘
```

### Modal Adaptation

**Desktop:**
```
┌──────────────────────────────────────┐
│                                      │
│    ┌─────────────────────────┐       │
│    │ Confirm Delete?         │       │
│    │                         │       │
│    │ This action cannot be   │       │
│    │ undone.                 │       │
│    │                         │       │
│    │    [Cancel] [Delete]    │       │
│    └─────────────────────────┘       │
│                                      │
└──────────────────────────────────────┘
```

**Mobile:**
```
┌─────────────────────────────────────┐
│ Confirm Delete?                 [×] │
├─────────────────────────────────────┤
│                                     │
│ This action cannot be undone.       │
│                                     │
├─────────────────────────────────────┤
│    [Cancel]        [Delete]         │
└─────────────────────────────────────┘
```

## Animation Examples

### Button Press

```css
.button {
  transition: transform 100ms ease-out;
}

.button:active {
  transform: scale(0.97);
}
```

### Page Transition

```css
.page-enter {
  opacity: 0;
  transform: translateX(20px);
}

.page-enter-active {
  opacity: 1;
  transform: translateX(0);
  transition: opacity 200ms, transform 200ms;
}
```

### Reduced Motion Alternative

```css
@media (prefers-reduced-motion: reduce) {
  .page-enter-active {
    transform: none;
    transition: opacity 200ms;
  }
}
```

### Micro-interaction: Toggle Switch

```css
.toggle-thumb {
  transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle[aria-checked="true"] .toggle-thumb {
  transform: translateX(20px);
}
```

## Product-Shape Patterns

Patterns below are *product archetypes* rather than primitives — recurring UI shapes that have become habitual across specific categories. Each includes its canonical exemplars so a new product can choose to commit to, differentiate from, or avoid the shape with eyes open.

### Command Palette (⌘K)

The single most commoditised pattern in productivity tooling. A search-driven action launcher bound to ⌘K / Ctrl-K, surfacing navigation, actions, and search results in one box ranked by recency + frecency. It has become a dev-tool *table stake* — leaving it out is now a design statement.

**Canonical reference:** Linear's ⌘K — inline fuzzy action search, grouped by recent / actions / navigate, shows each action's own keybinding so the palette teaches its shortcuts. The single most-copied implementation.

**Structure:**

```
┌─────────────────────────────────────┐
│ ⌘  Search or run a command…         │
├─────────────────────────────────────┤
│ RECENT                              │
│  ▸  Create issue                    │
│  ▸  Switch to Design team           │
├─────────────────────────────────────┤
│ ACTIONS                             │
│  ⧉  Open inbox           ⌘ ⇧ I     │
│  +  New project          ⌘ ⇧ P     │
├─────────────────────────────────────┤
│ NAVIGATE                            │
│  →  My issues                      │
└─────────────────────────────────────┘
         Esc to close  ↵ to select
```

**Behavioral contract:**
- Opens on `⌘K` / `Ctrl+K` from anywhere, including other modals — one global keybind, never contextual.
- First keystroke narrows; arrow keys move; Enter runs; Esc closes.
- Results are grouped (recent, actions, navigate, search). Headers are labels, not interactive.
- Recency/frecency ranking inside each group — never pure alphabetical.
- Inline results (not a menu that navigates you away) for anything fast to execute.
- Shows its own keybinding next to each action so the palette teaches its own shortcuts.

**Implementation notes:**
- Use native `<dialog>` for focus trapping. Do not rebuild focus management.
- Debounce input (60ms is plenty — users feel under 80ms as instant).
- Virtualise results over ~50 items.
- Preload commands at mount, not on open — the open animation should not wait on JS.

**When to avoid:** consumer products whose audience doesn't live in keyboard shortcuts — mass-market social, rideshare, mobile-first surfaces. Adding ⌘K there is performative.

### Multi-Tenant Workspace Switcher

A top-left (or sidebar-top) switcher that scopes the entire session to one of N workspaces / orgs / projects. Ships with a team avatar, a popover list, keyboard access, and "create new" at the bottom.

**Canonical reference:** Vercel's team + project switcher at top-left — avatar + name + chevron trigger, popover list with current workspace marked, "create workspace" pinned to the bottom of the list. Most developer-facing multi-tenant products use a near-identical version.

**Structure:**

```
┌──────────────────────┐
│ [◆] Acme Inc   ▾     │  ← trigger: avatar + name + chevron
└──────────────────────┘
   ↓
┌────────────────────────────────┐
│ Switch workspace               │
├────────────────────────────────┤
│ ● Acme Inc         acme.app    │
│ ○ Side Project     sbx.app     │
│ ○ Personal         —           │
├────────────────────────────────┤
│ + Create workspace             │
│ ⚙ Workspace settings           │
└────────────────────────────────┘
```

**Behavioral contract:**
- Always in the same screen position — users reach for it reflexively.
- Shows workspace avatar (colour + initial) as identity shorthand across the app.
- Current workspace is visually marked (check, filled dot) — never relies on order.
- Switching is instant route + state swap (not a reload) to feel like changing channels, not re-logging-in.
- "Create workspace" lives at the bottom of the list, never as a separate page.
- Keyboard: trigger should be tabbable; list should support arrow-key navigation.

**Common failure mode:** Hiding the switcher on narrow viewports without a replacement. The correct fallback is a sheet, not a hidden menu.

### API Reference Layout

The three-column (sometimes two-column) documentation shape that dev-tool companies have converged on: sidebar nav on the left, prose + parameters in the middle, runnable code examples pinned right. Every language tab for the same request is available instantly.

**Canonical reference:** Stripe's API docs — the three-column archetype (left nav, centre prose, right code with language switcher). Mintlify productised the same layout as a docs platform, which is why so many dev-tool products now share this shape.

**Structure:**

```
┌────────────┬────────────────────────┬────────────────────┐
│ API        │ Create a customer      │  REQUEST           │
│   Core     │                        │  ┌──────────────┐  │
│   ▸ Balance│ POST /v1/customers     │  │ curl / node  │  │
│   ▸ Charges│                        │  │ python / go  │  │
│   ▪ Custo… │ Creates a new customer │  └──────────────┘  │
│   ▸ Events │ in your account.       │  ```curl           │
│ Connect    │                        │  curl https://…    │
│ Webhooks   │ Parameters             │    -u sk_…         │
│ Errors     │  email       string    │    -d name=…       │
│            │  name        string    │  ```               │
│            │  metadata    hash      │                    │
│            │                        │  RESPONSE          │
│            │                        │  ```json           │
│            │                        │  { "id": "cus_…",  │
│            │                        │    "email": …     } │
│            │                        │  ```               │
└────────────┴────────────────────────┴────────────────────┘
```

**Behavioral contract:**
- Right column is *sticky within its section* — prose scrolls, code examples stay visible for the endpoint currently in view.
- Language tabs are a single global setting — picking Python in one place flips every code block on the page.
- Parameter tables share a uniform shape: name · type · required? · description. No bespoke field layouts.
- Every request example has a matching response example immediately below.
- Search is ⌘K (see above) and returns endpoint hits as the first result group.
- Left nav collapses to a drawer under ~1024px; the right code column collapses into inline tabs.

**Common failure mode:** Rolling a bespoke docs system instead of adopting Mintlify / Docusaurus / Nextra + this shape. The shape is now so expected that deviating reads as amateurism unless there is a specific editorial reason.

### Embed / Preview Card

The rich-preview card shape — a URL or resource reference that unfolds into a small card with title, meta, image, and subtle frame. Originated in link previews (Slack, Discord, iMessage) and now forms the core of block-based editors.

**Canonical reference:** Notion's `/embed` blocks — every external reference (bookmark, file, video, linked database) renders as the same card shape with favicon + domain + one-line description. Block-based editors converged on this via the Slack/Discord link-preview lineage.

**Structure:**

```
┌──────────────────────────────────────────────────┐
│ ┌──────┐  TITLE OF THE LINKED THING              │
│ │      │  One-line description extracted from    │
│ │ 🖼️   │  the target.                            │
│ └──────┘  example.com  ·  Updated 2h ago         │
└──────────────────────────────────────────────────┘
```

**Behavioral contract:**
- Card is clickable as a whole — the bounding box is the hit target, not just the title.
- Favicon/avatar + domain on the same row communicate provenance without a separate "source" label.
- Loading is progressive: title → description → image (image is the last to arrive and must not shift layout).
- Failures degrade gracefully to a plain link (never an empty broken card).
- Action affordances (open, unlink, turn into mention) live in an overflow menu that only appears on hover/focus — never cluttering the resting state.

### Onboarding Progress Shelf

A multi-step setup checklist pinned to the top or right of the app after signup, surfacing the next 3–5 actions required to reach "first successful use". Progress bar included. Dismissible only when complete — re-openable if dismissed early.

**Canonical reference:** Stripe's "integrate checklist" — 5 actions, each taps into the product and completes on real outcome (data flows, not modal closes). The gamified variant (level-ups, reward states) appears in consumer/education products where a child or casual user is the primary audience and the checklist doubles as motivation.

**Structure:**

```
┌─────────────────────────────────────────────┐
│ Get started                         3 of 5  │
│ ████████████░░░░░░░                         │
├─────────────────────────────────────────────┤
│ ✓ Create your first base                    │
│ ✓ Invite a teammate                         │
│ ✓ Connect a data source                     │
│ ▸ Set up an automation           2 min →    │
│ ○ Share your workspace                      │
├─────────────────────────────────────────────┤
│                           Hide for now  ▾   │
└─────────────────────────────────────────────┘
```

**Behavioral contract:**
- Each row is a *complete* action — taps into the product, finishes the step on success, returns the user to the shelf.
- Progress is measured by outcome, not by pages visited ("connect a data source" completes when data flows, not when the modal closes).
- The shelf remembers completion across sessions — never resets.
- Dismissal is soft: "Hide for now" → lives behind a `?` icon or a "Resume setup" link.
- Final step should feel like graduation (confetti, a rename like "You're set up"), not a silent disappearance.

**Common failure mode:** Padding the list with checkbox tasks for their own sake ("Read the docs", "Follow us on X"). Every row must materially move the user closer to real use.

### Gated Admission / Cohort Access

A deliberate "not everyone, not yet" landing surface. Instead of a sign-up form, the homepage presents an application or context-disclosure form, often with a cohort number ("4/7", "1/4 — spring cohort"), numbered progression, and intentionally restrained copy. Reads as exclusive-by-curation, not exclusive-by-friction.

**Canonical reference:** an application form as the homepage — no product description behind it, often with a cohort position visible (e.g. "4/7 — spring cohort"). Common in community products, founder dinners, private clubs; Superhuman's original referral-gated signup is the dev-tool ancestor.

**Structure:**

```
┌─────────────────────────────────────────────┐
│                                             │
│                THE ASSEMBLY                 │
│                                             │
│             Access is considered,           │
│                 not assumed.                │
│                                             │
│                                             │
│    ┌──────────────────────────────┐         │
│    │  Tell us who you are.        │         │
│    │                              │         │
│    │  [ Name                   ]  │         │
│    │  [ What brings you here  ]   │         │
│    │  [ Who referred you      ]   │         │
│    │                              │         │
│    │            [ Submit ]        │         │
│    └──────────────────────────────┘         │
│                                             │
│                       spring cohort · 4/7   │
│                                             │
└─────────────────────────────────────────────┘
```

**Behavioral contract:**
- Homepage *is* the form. No marketing page behind it.
- Progress markers (4/7, cohort dates) imply scarcity without shouting it.
- Copy is short, declarative, and refuses to explain the product in full — the gate is the value proposition.
- Submission returns a quiet acknowledgement + timing expectation ("We review applications weekly"), never an immediate confirmation.
- No social-login shortcuts. The act of writing the form *is* the signal.

**When to avoid:** Anything that needs mass distribution, self-serve onboarding, or clear upfront value disclosure to justify effort. If the product is a tool you can describe in one screenshot, gating is performative.

### Spacebar Peek Preview

Borrowed from macOS Finder: a single spacebar press on any selected item in a list or grid opens a full-size preview overlay, no navigation, no modal ceremony. Second spacebar (or Esc) closes it. Arrow keys move between items while the preview stays open — the preview window swaps content, not position.

**Canonical reference:** macOS Finder. On the web, file managers and design-asset libraries have begun to port the gesture directly. Rarely seen — its presence signals "we built for power users".

**Structure:**

```
Grid state:               With peek open:
┌───┬───┬───┬───┐         ┌─────────────────────────┐
│   │   │   │   │         │                         │
├───┼───┼───┼───┤         │                         │
│   │ ▪ │   │   │  Space  │       [ full-size       │
├───┼───┼───┼───┤  ────►  │         preview ]       │
│   │   │   │   │         │                         │
└───┴───┴───┴───┘         │   Esc / Space to close  │
                          └─────────────────────────┘
     ← → cycles selection behind the preview
```

**Behavioral contract:**
- `Space` toggles the preview for the focused item. `Esc` also closes.
- Arrow keys continue to navigate the underlying list — the preview updates in place, never animates a new modal.
- Preview is read-only. Any action (rename, delete, open) exits peek mode first.
- Works equally on keyboard-focused items and hover-focused items — mouse users can hover + space.
- Loading is instant from cache when possible; otherwise a skeleton shape matching the asset type (image, document, video) renders within ~50ms.

**When to avoid:** Consumer lists where users don't hold keyboards (mobile-primary contexts, public kiosks). On touch, replace with long-press preview — never hide the affordance without a direct replacement.
