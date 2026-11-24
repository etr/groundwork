# `vertical-slice`

> **Run it:** `/groundwork:vertical-slice` · **Tier:** user-run or model-invoked · **Reads:** `references/engineering-principles.md`, for the definition of a thin vertical slice · **Writes:** no files of its own; it shapes the feature's commits — the flag first, one commit per slice with its tests, the flag removed at the end

## What it does

Structures a multi-layer feature as a sequence of thin vertical slices instead of layer by layer. Each slice cuts through the whole stack — UI → logic → data — and delivers one observable behavior, behind a feature flag that goes in before the slice is built. A slice is finished — flagged, end-to-end, tested, committed — before the next starts, so each one proves the stack connects and stands as a clean revert point.

## When to reach for it

- A feature touches more than one layer: endpoint + service + table, or component + handler + store.
- The work is big enough to tempt "I'll build all the models first, then wire them up", or must ship incrementally.
- **Not when:** the change stays in one layer, or the fix is too small to slice. Write it test-first with `test-driven-development` and skip the slicing.
- **Not when:** you are cutting the feature into tasks. That is planning — `create-tasks`.

## Common questions

**What counts as a slice?**

One behavior a user or caller can observe. "User sees their order total" is a slice; "build the orders table" is a layer. If a slice cannot be stated as an observable behavior, it is horizontal and gets re-cut.

**Why add the flag before building anything?**

Without the flag a half-built slice cannot merge, and `main` stops being shippable. The flag goes in first, defaulting off, so unfinished slices can merge without exposing half-built behavior. It comes off when the feature is whole.

**The first slice is very thin. Is that right?**

Thin is the point. The preferred slice is the thinnest one that still demonstrates the stack end-to-end: a single happy path through every layer beats a complete-but-disconnected layer.

**Is this the skill that breaks the feature into tasks?**

No. Cutting a feature into sliced tasks happens during planning, in `create-tasks`. This skill governs building each slice.

## It's working if

- A feature flag is in place, defaulting off, before the slice's new path is built.
- Each slice is stated as one observable behavior, not as a layer such as "the data model".
- Each slice works from its entry point (UI / API) through to persistence.
- Each slice's tests are green and the slice is committed before the next one starts.
- Each slice can be reverted on its own without breaking another.
- No UI or persistence is left for a final "wire it up" phase.
- The flag is removed once the feature is whole.

**It is not working if:** a "slice" is really a layer ("the data model", "the API layer"), the slices can only be merged or reverted together, or a box in the verification checklist is unchecked — that is a horizontal layer, and it gets re-cut.
