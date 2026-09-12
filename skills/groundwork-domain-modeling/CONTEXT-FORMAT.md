# Glossary Entry Format

The glossary at `{{specs_dir}}/glossary.md` is terminology only. Each entry follows this shape:

```markdown
### Term

**Definition:** One or two sentences. The single authoritative meaning — no implementation detail.

**Relationships:** Links to other terms — what it contains, depends on, or is distinguished from. Reference other terms by name (e.g. "an [[Order]] without a confirmed [[Payment]]").

**Edge cases:** The boundary scenarios that pin the term down — what counts, what does not, what happens at zero/empty/expired.
```

## Rules

- **Alphabetical.** Entries sorted A–Z so any term is found by name, not by reading the file.
- **One authoritative definition per term.** No synonyms with their own entries — pick the canonical name, redirect the rest (`See [[Canonical]]`).
- **No implementation detail.** No table names, function signatures, file paths, libraries, or "we use X for this." That belongs in specs or architecture, not the glossary.
- **No duplication.** A fact lives in exactly one entry. If two terms overlap, the relationship line links them rather than restating.
- **Definition before relationships.** A reader must understand the term standalone before seeing how it connects.

## Example

```markdown
### Reservation

**Definition:** A time-bounded hold a guest places on a Room before it becomes a Booking. Expires if not confirmed.

**Relationships:** Held against one [[Room]]; converts to a [[Booking]] on payment; blocks other [[Reservation]]s for the same dates.

**Edge cases:** Two reservations may target the same Room for non-overlapping dates. An expired Reservation frees the Room immediately, even mid-checkout.
```
