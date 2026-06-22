---
name: design-it-twice
description: Use before committing to a non-trivial module, service boundary, or public API - generate 2-3 divergent interface designs, compare them on depth/locality/seam, and recommend one
allowed-tools: ["Read", "Glob", "Grep", "Task"]
---

# Design It Twice

## Overview

Your first interface is rarely your best (**Design it twice**, Ousterhout). Before you commit a module boundary, generate genuinely different designs and compare them — the cost of exploring on paper is trivial next to the cost of a shallow interface that **Hyrum's Law** then freezes into a contract.

**Core principle:** Aim for **deep modules** — a simple interface hiding substantial functionality. A design that merely forwards calls is shallow and usually a liability.

This is a build-time and architecture-time discipline. [[design-architecture]] and [[swarm-design-architecture]] invoke it for module boundaries; invoke it directly any time you're about to design a single non-trivial interface.

## When to Use

- A new module, service boundary, or public API
- A refactor that reshapes an existing interface many callers depend on
- Any seam where a future change is likely to land and you want it to land in one place

Skip for trivial or single-call-site code, or interfaces fully dictated by an existing contract.

## Process

### 1. Frame the problem space

Before generating alternatives, write down the constraints, dependencies, the dominant use case, and a rough code sketch of the interface. Use the project's domain language (see [[domain-modeling]]). Vague framing yields vague designs.

### 2. Generate 2–3 divergent designs

Each design optimizes **one distinct goal** — they must genuinely differ, not be three shades of the same idea:

| Lens | Optimizes for |
|------|---------------|
| Minimize entry points | Fewest interfaces, maximum leverage per surface — a deep module |
| Maximize flexibility | Reuse across the widest set of use cases |
| Optimize the common case | Simplest path for the dominant workflow |
| Isolate seams | Cross-boundary dependencies behind ports & adapters |

**Orchestration:** if the `Agent`/`Task` tool is available, fan out one agent per design **in parallel**, each with the same framing and a different lens. No agent teams or debate are needed — the designs are independent. If agents are unavailable, produce the designs sequentially yourself. Each brief returns the interface sketch plus its trade-offs.

### 3. Compare on three axes

- **Depth** — functionality hidden behind the interface vs. surface exposed. Favor depth; mind Hyrum's Law on every exposed behavior.
- **Locality** — where a likely future change concentrates (one module vs. scattered across callers).
- **Seam placement** — whether boundaries fall where the system actually flexes.

### 4. Recommend, don't enumerate

Give an **opinionated recommendation** — which design solves the problem best and why — possibly a hybrid that grafts the best of two. A neutral menu pushes the judgment onto the reader and defeats the exercise.

Named principles referenced here are defined in `${CLAUDE_PLUGIN_ROOT}/references/engineering-principles.md`.

## Rationalizations

| Excuse | Reality |
|--------|---------|
| "My first design is obviously right" | That feeling is exactly when a second design most often beats it. Cost of checking is one sketch. |
| "Three designs is slower" | Slower than reworking a shallow interface every caller already depends on? No. |
| "They'd all come out the same" | Then your lenses aren't divergent. Force distinct optimization goals. |
| "I'll just present the options and let them pick" | A menu without a recommendation is unfinished work. Take a position. |

## Red Flags

- The alternatives differ only cosmetically (same interface, renamed)
- A "design" that forwards calls with no functionality hidden (shallow module)
- Comparing on taste rather than depth / locality / seam
- Ending with "any of these could work" instead of a recommendation

## Verification

- [ ] Problem space framed: constraints, dominant use case, interface sketch
- [ ] 2–3 designs, each optimizing a genuinely distinct goal
- [ ] Compared explicitly on depth, locality, and seam placement
- [ ] A single opinionated recommendation (or justified hybrid), with reasoning
