# Engineering Principles

A shared vocabulary of named principles. Skills and agents reference these by name instead of re-explaining them — one authoritative definition per principle. Cite the leading name (e.g. "deep module", "Chesterton's Fence") and link here.

## Design & architecture

- **Deep modules** (Ousterhout) — the best modules pair a *simple interface* with *substantial functionality*. Depth = functionality hidden ÷ interface exposed. Prefer few powerful interfaces over many shallow ones. A class that just forwards calls is a shallow module and usually a liability.
- **Design it twice** (Ousterhout) — your first design is rarely the best. Generate 2–3 genuinely different approaches and compare them before committing.
- **Hyrum's Law** — with enough consumers, *every observable behavior* of your interface will be depended on, whether documented or not. Minimize the observable surface; what you don't expose, you can change.
- **Information hiding** — a module's design decisions should be invisible to its callers. Leaking implementation through the interface creates coupling that Hyrum's Law then freezes.
- **Decision-record gate** — record an architecture decision only when it is *hard to reverse*, *surprising without context*, **and** the result of a *real trade-off* between viable options. If any condition is missing, just implement it; a record for an obvious choice is noise.

## Change & review

- **Small changes (~100 lines)** — reviewers catch defects in small diffs and miss them in large ones. Keep a change reviewable; split when it grows past roughly 100 lines of real logic.
- **Thin vertical slice** — deliver a feature as thin slices that each cut through the whole stack (UI → logic → data) to produce one observable behavior, kept behind a feature flag until done. Slices integrate continuously; building layer-by-layer defers all integration risk to the end, where it is most expensive.
- **Chesterton's Fence** — do not remove or change something until you understand why it is there. Recover the original intent first, then refactor. The cornerstone of safe simplification.
- **Rule of 500** — a file or module past ~500 lines is a smell, not a rule violation. Treat it as a prompt to look for a missing seam, not a mandate to split blindly.
- **YAGNI** — "You Aren't Gonna Need It." Build for the requirement in front of you, not the one you imagine. Speculative generality is a cost, not an investment.
- **Sunk cost fallacy** — time already spent is gone. The only question is which path is best *from here*. Unverified code you can't trust is debt, regardless of hours invested.

## Testing & verification

- **The Beyoncé Rule** — "if you liked it, you should have put a test on it." If a behavior matters, it has a test; an untested behavior is one a refactor may silently break.
- **Test pyramid (~80/15/5)** — many fast unit tests, fewer integration tests, very few end-to-end tests. Inverting the pyramid yields slow, flaky suites.
- **DAMP over DRY in tests** — tests favor *Descriptive And Meaningful Phrases* over deduplication. A little repetition that keeps a test readable beats a clever helper that hides what's under test.
- **Shift Left** — move verification earlier. Types, tests, and CI gates that fail at author time are cheaper than defects found in review, staging, or production.
- **Default to refuted when uncertain** — for high-stakes decisions, the burden of proof is on the approach. Absent concrete evidence it is safe, treat it as wrong.
