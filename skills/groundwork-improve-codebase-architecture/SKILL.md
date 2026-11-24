---
name: groundwork-improve-codebase-architecture
description: Use when the codebase resists change more than the changes warrant - surveys for deepening opportunities (shallow module clusters that could become one deep module), shows them in chat and as an HTML report, and takes the chosen one through design-it-twice. Optional argument - a module, subsystem, or pain point to scope the survey (none - change hot spots); in a monorepo --project <name> pins the monorepo package for the whole run.
---
## Portable Project Context

Before interpreting project-context placeholders in this workflow:

1. Resolve the directory containing this `SKILL.md`.
2. Run `node <skill-directory>/scripts/project-context-cli.js resolve --harness zcode` from the repository working directory.
3. Use the returned JSON values as the exact bindings for `{{project_name}}`, `{{project_root}}`, `{{specs_dir}}`, `{{plans_dir}}`, `{{debug_dir}}`, and `{{research_dir}}` everywhere below.
4. If `selection_required` is true, follow the `groundwork-select-project` workflow, then resolve again.


<!-- Adapted from the "improve-codebase-architecture" and "codebase-design" skills in github.com/mattpocock/skills (MIT). -->

# Improve Codebase Architecture

A **survey, not a rescue**. It surfaces **deepening opportunities** — places where a cluster of shallow modules can consolidate into one deep module: a lot of behavior behind a small interface, tested through that interface. The aim is leverage for callers, locality for maintainers, and testability for everyone. On a genuinely tangled codebase it finds real candidates; it does not untangle the mud in one run.

This is proactive upkeep for the agent's working environment: a codebase that is deep is one the next session navigates cheaply.

## Explicit Project Input

If arguments include `--project <name>`, resolve that project directly from the repository's `.groundwork.yml` for this invocation. Treat it as authoritative; do not depend on or change persisted project selection.

## Step 0: Resolve Project Context

1. **Monorepo check:** Does `.groundwork.yml` exist at the repo root?
   - If yes → Is `{{project_name}}` non-empty?
     - If empty → Follow the groundwork-select-project workflow steps to select a project, then restart this skill.
     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.
   - If no → Continue (single-project repo).
2. **CWD mismatch check (monorepo only):** skip it when the project was just selected or the invocation carried an explicit `--project`.
   - Compare CWD against the project paths in `.groundwork.yml`: the repo root or the selected project's path → fine, proceed; no project's path → proceed without warning (shared directory).
   - A different project's path → with `--noninteractive`, keep the selected project and continue; otherwise warn via `Ask the user`:
     > "You're working from `<cwd>` (inside **[cwd-project]**), but the selected Groundwork project is **[selected-project]** (`[selected-project-path]/`). What would you like to do?"
     > - "Switch to [cwd-project]"
     > - "Stay with [selected-project]"
     If the user switches, Follow the groundwork-select-project workflow steps.
3. Proceed with the resolved project context. The survey reads and reports only inside the resolved project root; all `{{specs_dir}}/` paths resolve to the correct location.

## Vocabulary (use these terms exactly)

- **Module**: anything with an interface and an implementation — function, class, package, or tier-spanning slice. *Avoid*: component, service, unit.
- **Interface**: everything a caller must know to use the module correctly — types, but also invariants, ordering, error modes, configuration. *Avoid*: API, signature (too narrow).
- **Deep / shallow**: a module is **deep** when much behavior sits behind a small interface; **shallow** when the interface is nearly as complex as the implementation.
- **Seam**: the place where a module's interface lives — where behavior can be altered and observed without editing that place.
- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through; if it reappears spread across N callers, it was earning its keep. A "yes, concentrates" answer is the deepening signal.
- **Locality**: change, bugs, and verification concentrate in one place instead of spreading across callers.
- **Adapter**: a concrete thing that satisfies an interface at a seam. It describes the role a thing fills, not what is inside it.
- **Leverage**: what callers get from depth — more capability per unit of interface learned. One implementation pays back across N call sites and M tests.
- **Dependency category**: what a cluster depends on, which decides how the deepened module is tested. One of: `in-process` (pure computation, no I/O), `local-substitutable` (has a local test stand-in, such as an in-memory database), `ports & adapters` (your own service across a network), or `external — mock` (a third party you do not control).

## Step 1: Scope Before You Scan (YAGNI)

Deepening pays off where **change is frequent** — it makes future changes to the module cheaper. So decide where to look before looking:

- User named a direction (module, subsystem, pain point) → take it; skip the inference below.
- Otherwise, walk the change hot spots: `git log --oneline -200` (inside the project root), find the files and areas that keep recurring, and let those pull the survey's attention first. Scattered changes with no hot spot → widen the net once, then stop.

Read `{{specs_dir}}/glossary.md` (if present) for naming candidates, and the architecture decision records: **a candidate that contradicts a standing decision record is only surfaced when the friction is real enough to justify reopening it**, and it must carry a callout ("contradicts DR-NNN, worth reopening because …"). Never re-litigate silently.

## Step 2: Explore for Candidates

Dispatch an exploration sub-task with a fresh context window over the scoped area. It hunts, in priority order:

1. **Understanding sprawl** — where grasping one concept requires bouncing between many small modules
2. **Shallow clusters** — modules whose interface nearly matches their implementation (mass-diagram test: would the interface rectangle shrink a lot if this cluster consolidated?)
3. **Testability leaks** — logic extracted into pure functions while the real bugs hide in how they're wired together (no locality); areas untested or untestable through their current interface
4. **Seam leakage** — tightly-coupled modules reaching past each other's interfaces
5. **Pass-throughs** — wrappers/delegators that fail the deletion test

The sub-task returns per candidate: files involved, what hurts, the consolidation in one sentence, its evidence, and its dependency category. **No interface proposals yet** — the survey names opportunities, not designs.

## Step 3: Present the Candidates

Present the candidates twice — each half does a job the other can't:

1. **In chat**, as a numbered list (the durable, copyable half). Per candidate:

   - **Title** — names the deepening in domain language (glossary terms when they exist)
   - **Files/modules** involved
   - **Dependency category** — what the cluster depends on, which decides how the deepened module is tested
   - **What hurts** → **what changes** — one sentence each
   - **Wins** — in vocabulary terms ("locality: pricing bugs concentrate in one module", "one interface, N call sites", "tests hit one seam")
   - **Recommendation strength** — `Strong` / `Worth exploring` / `Speculative` (Strong = recent hot-spot evidence + passes the deletion test + no decision-record conflict)

2. **As a visual HTML report** (the half that makes shallowness visible) — one self-contained file with a before/after diagram per candidate and a top recommendation. When producing it, follow `HTML-REPORT.md` for its location, structure, diagram patterns, and skeleton; then tell the user the path to open.

Then stop and ask which (if any) to take further. A survey that finds nothing worth exploring is a successful run — say so.

## Step 4: Work the Chosen Candidate

With the user's pick:

1. **Settle the constraints first** — one round of recommended-answer questions with the user ([[understanding-feature-requests]]): what the deepened module must still do for each caller, which dependencies end up behind the seam, which existing tests survive.
2. **Design the deepened interface** — invoke [[design-it-twice]] to generate 2–3 divergent interface designs for the consolidated module and recommend one (depth / locality / seam placement).
3. **Record the decision** — when the chosen interface passes the decision-record gate (`<skill-directory>/references/engineering-principles.md`), capture it in the architecture document in `design-architecture`'s Decision Record Format: what was consolidated, the interface chosen, and the alternatives design-it-twice rejected. Implementation and every later reader rely on that record; without it the decision dies with the session. When no architecture document exists, carry the record in the hand-off instead of creating one unasked.
4. **Sharpen the domain name** — a deepened module usually deserves a name; resolve it through [[domain-modeling]] (glossary term, created lazily) rather than inventing a synonym.
5. **Hand off to the lifecycle** — the agreed design becomes implementation work. Recommend the user run `/groundwork-create-tasks` with the decision record in hand (the lifecycle router lists it as user-initiated), or invoke [[plan-task]] for a single candidate; either way the new consolidated interface is the task's recorded test seam. This skill does not implement.

A candidate the user parks rather than pursues goes under **Open decisions** in section 12 of the architecture document (when one exists), so it survives the session. A candidate the user **rejects** for a load-bearing reason deserves more: when that reason should stop a future survey from suggesting it again, offer to record it as a decision record ("record this so future surveys don't re-suggest it?"). Skip ephemeral reasons ("not right now") and self-evident ones.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "The whole codebase is a mess, start everywhere" | A survey that scans everything prioritizes nothing. Hot spots first. |
| "It's legacy, don't touch it" | Files that never change are cheap to leave shallow — the deletion test decides, not age. |
| "We should redesign the architecture" | This is a deepening survey, not a rewrite. Candidates are local consolidations. |
| "Just propose the new interface now" | Survey first, design second. Candidates chosen without the user are solutions without a sponsor. |

## Red Flags — STOP

- Scanning the entire codebase when hot spots were findable
- Presenting a design (interface, methods) in the candidate list
- Surfacing a candidate that contradicts a decision record without the callout
- Skipping the "nothing worth exploring" outcome when it's true
- Implementing inside this skill

## Verification

- [ ] Scope came from the user's direction or change hot spots (say which)
- [ ] Decision records read; conflicts carry callouts
- [ ] Candidates carry recommendation strength with evidence
- [ ] HTML report written outside the repo at a uniqueness-suffixed temp path, self-contained, and its path reported
- [ ] User selected; the chosen interface designed via design-it-twice and recorded as a decision (or carried in the hand-off)
- [ ] Name resolved via domain-modeling
- [ ] Implementation handed to the lifecycle with the new interface as a recorded test seam
