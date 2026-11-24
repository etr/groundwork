# `design-it-twice`

> **Run it:** `/groundwork:design-it-twice` · **Tier:** user-run or model-invoked — `design-architecture` and `swarm-design-architecture` call it for module boundaries · **Reads:** the constraints, dependencies, and dominant use case around the interface · **Writes:** nothing on disk; its output is the designs, the comparison, and one recommendation

## What it does

Before a module boundary is committed, it generates two or three genuinely different interface designs and compares them on depth, locality, and seam placement. It first checks whether a new interface is needed at all. It ends with one opinionated recommendation, possibly a hybrid, together with the strongest objection it could not resolve.

## When to reach for it

- A new module, service boundary, or public API.
- A refactor that reshapes an interface many callers depend on.
- A seam where a future change is likely to land, and you want it to land in one place.
- **Not when:** the question is which technology to adopt. That is `design-architecture` or `swarm-design-architecture`; this skill only shapes the interface.

## Common questions

**It recommended not building the interface at all.**

That is a valid result. The first step checks the premise: could doing nothing, reusing an existing interface, or moving the boundary solve the underlying problem? If no new interface is needed, it recommends that and stops.

**Do the designs need separate agents?**

No. When the `Agent`/`Task` tool is available it fans out one agent per design in parallel, each with the same framing and a different lens. Without it, it produces the designs itself, one after another. There is no debate round — the designs are independent.

**Why does it argue for one design instead of listing them?**

A neutral menu pushes the judgment onto the reader. It takes a position and keeps the strongest unresolved objection beside it, with the evidence that would change the recommendation. If no substantive objection remains, it says so rather than inventing one.

**Is it worth running on a small piece of code?**

No. It says to skip trivial or single-call-site code, and interfaces an existing contract fully dictates.

## It's working if

- The premise was checked first: doing nothing, reusing an existing interface, and moving the boundary were each considered.
- The problem space was written down before any design — constraints, the dominant use case, and a rough sketch of the interface — in the project's domain language.
- There are two or three designs, and each is stated as optimizing a different goal.
- The comparison names depth, locality, and seam placement explicitly.
- It ends with a single recommendation and its reasoning, not a menu.
- The strongest unresolved objection is stated with the evidence that would change the call, or it says plainly that none remains.

**It is not working if:** the alternatives differ only in naming, or it ends with "any of these could work".
