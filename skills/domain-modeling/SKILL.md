---
name: domain-modeling
description: Use when designing a product or feature and the project lacks shared, agreed terminology - builds and maintains a pure domain glossary so agents speak one language
---

# Domain Modeling

## Overview

A project's agents are verbose and misaligned when they lack a shared language: the same concept gets three names, one name covers three concepts, and every prompt re-explains what a term means. A tight glossary fixes this — it collapses ambiguity and tokens at once.

**Core principle:** the glossary is **terminology only**. One authoritative definition per term, and nothing else. It is never a spec, never an architecture doc, never a scratchpad. The moment an entry carries implementation detail or a design decision, it stops being a glossary and starts rotting.

The glossary lives at `{{specs_dir}}/glossary.md`.

## When to Use

- Defining a product or feature and a term keeps getting used loosely or two ways ([[design-product]], [[understanding-feature-requests]])
- Architecture work surfaces concepts the team has no agreed name for ([[design-architecture]])
- You catch yourself re-explaining the same concept across prompts or docs

## Lazy Creation

`{{specs_dir}}/glossary.md` does not exist until the **first term resolves**. Do not scaffold an empty file or a placeholder. An empty glossary is sediment; create the file when you have a real first entry, not before.

## Process

Capture terms **inline, as they crystallize** during design and requirements work — never in a batch at the end. Batching loses the context that made the term precise.

1. **Capture on crystallization.** A concept earns an entry the moment it has a stable, agreed meaning. Write it immediately, in the format below. Do not wait for a "glossary pass."
2. **Challenge vague or conflicting language on the spot.** When usage drifts, name it: *"Your glossary defines X as A, but you're using it as B — which is it?"* Resolve to one definition; update the entry or the usage, never both meanings.
3. **Stress-test relationships with concrete edge cases.** Walk a real scenario at the boundary — empty, zero, expired, two-at-once — and check the definition and its links still hold. If the scenario breaks the entry, the term was underspecified; tighten it.
4. **Cross-check terms against the code.** Surface contradictions where the code's structures and names disagree with the agreed term. A glossary that contradicts the codebase is worse than none — reconcile the name, the definition, or the code.

Follow the entry format in the sibling. See `CONTEXT-FORMAT.md`.

### Glossary vs. decision

A glossary entry records *what a word means*, not *why a path was chosen*. When resolving a term forces a real architectural trade-off, that's a decision record (see the **decision-record gate** in `${CLAUDE_PLUGIN_ROOT}/references/engineering-principles.md`), not a glossary entry. Record it in the architecture doc via [[design-architecture]] and link the term to it. Do not narrate the decision inside the definition.

## Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll add the schema/endpoint so it's all in one place" | That makes it a spec. The glossary holds meaning only; implementation rots the entry out of sync. |
| "I'll collect all the terms at the end in one pass" | The precision came from the context you had when the term crystallized. Batching loses it. |
| "Both teams use the word slightly differently — I'll note both" | Two meanings is the bug, not the entry. One authoritative definition; redirect the rest. |
| "I'll explain *why* we defined it this way here" | Rationale belongs in the architecture decision record, not the glossary. The definition states what, not why. |
| "Let me stub an empty glossary so it exists" | Empty file = sediment. Create on the first resolved term. |

## Red Flags

- An entry contains a table name, function signature, file path, or library choice
- The same concept has two entries under different names
- One entry's definition contradicts how the code names or structures the thing
- You're writing the glossary in a single batch after design is "done"
- An entry argues *why* a choice was made instead of stating what the term means
- A placeholder or empty `glossary.md` committed before any term resolved

## Verification

- [ ] `glossary.md` exists only because at least one term has resolved; no placeholder entries
- [ ] Every entry follows `CONTEXT-FORMAT.md` (Term, Definition, Relationships, Edge cases; alphabetical)
- [ ] No entry contains implementation detail or decision rationale
- [ ] Each concept appears exactly once; no synonym has its own definition
- [ ] Every term was stress-tested against at least one concrete edge-case scenario
- [ ] Terms checked against the code; no name or meaning contradicts the codebase
- [ ] Any trade-off uncovered while resolving a term is recorded as an architecture decision (see [[design-architecture]]), not inside the definition
