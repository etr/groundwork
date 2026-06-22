---
name: vertical-slice
description: Use when building a feature large enough to span multiple layers - structure the work as thin, end-to-end, independently-shippable slices behind a feature flag instead of building layer-by-layer
---

# Vertical Slice

## Overview

Build a feature as a sequence of **thin vertical slices**. Each slice cuts through the full stack — UI → logic → data — and delivers exactly one observable behavior, kept behind a feature flag until it is complete and tested.

**Core principle:** thin vertical slice (defined in `${CLAUDE_PLUGIN_ROOT}/references/engineering-principles.md`). The opposite is horizontal building — finishing the whole data layer, then the whole logic layer, then the whole UI. Horizontal work integrates *last*, which means every integration risk surfaces at the end, all at once, when there is no budget left to absorb it. Vertical slices integrate *first* and *continuously*: each slice proves the stack connects before you build the next one.

A slice is the unit of progress. Finish one — flagged, end-to-end, tested, committed — before starting the next. Cutting a feature into sliced tasks happens during planning ([[create-tasks]]); this skill governs *building* each slice. See [[work-on]] for driving the work item end-to-end and [[test-driven-development]] for the inner loop of each slice.

## When to Use

- A feature that touches more than one layer (endpoint + service + table; component + handler + store)
- Any work big enough to tempt "I'll build all the models first, then wire them up"
- Work that must ship incrementally or be safe to pause and resume

Skip for a change confined to one layer, or a fix small enough that there is nothing to slice.

## Process

### 1. Cut the feature into thin slices

List slices, each delivering one behavior a user or caller can observe. "User sees their order total" is a slice; "build the orders table" is not — it is a layer. If a slice can't be stated as an observable behavior, it is horizontal; re-cut it. Prefer the thinnest slice that still demonstrates the stack end-to-end (a single happy path through every layer beats a complete-but-disconnected layer).

### 2. Put the flag in first

Add the feature flag before building the slice, defaulting off. The slice's new path lives behind it. This keeps `main` shippable at every commit and lets unfinished slices merge without exposing half-built behavior.

### 3. Build the slice end-to-end with TDD

Implement the one behavior through every layer it touches, driven by [[test-driven-development]]. A slice is done only when the behavior works from its entry point (UI / API) all the way to persistence — not when the layer it added is "complete."

### 4. Test, commit, then next slice

Commit the slice with its tests green before starting the next. Each slice is a clean revert point. Repeat until the feature is whole, then remove the flag.

## Rationalizations

| Excuse | Reality |
|--------|---------|
| "Faster to build all the models first" | Layer-first defers all integration risk to the end, where it is most expensive. Slices surface it now. |
| "This slice is too thin to be worth a commit" | Thin is the point. A thin end-to-end slice proves the stack; a thick disconnected layer proves nothing. |
| "I'll add the flag once it works" | Without the flag, a half-built slice can't merge and `main` stops being shippable. Flag goes in first. |
| "It all ships together anyway, so why slice" | Slices give independent revert points and continuous integration. One big merge gives neither. |
| "Wiring the UI now is premature" | A slice with no observable behavior is a layer in disguise. The observable end is what makes it a slice. |

## Red Flags - STOP

- A "slice" described as a layer ("the data model", "the API layer") rather than a behavior
- Building a complete layer before anything connects to it end-to-end
- New code path not behind a flag, leaving `main` un-shippable mid-feature
- Slices that can only be merged or reverted together
- Deferring all UI (or all persistence) to a final "wire it up" phase

## Verification

A slice is done only when **every** box is checked:

- [ ] Behind a feature flag, defaulting off until the feature is complete
- [ ] End-to-end: works from entry point through to data, not just one layer
- [ ] Delivers one observable behavior, stated as such
- [ ] Tested green via [[test-driven-development]] and committed
- [ ] Independently revertible — reverting this slice breaks no other slice

Can't check every box? It is a horizontal layer, not a vertical slice. Re-cut it.
