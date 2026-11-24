# Glossary Entry Format

The glossary at `{{specs_dir}}/glossary.md` is terminology only. Each entry follows this shape:

```markdown
### Term

**Definition:** One or two sentences. The single authoritative meaning — no implementation detail.

**Avoid:** Comma-separated synonyms and near-synonyms this entry retires (e.g. "ticket, work item"). Omit the line when no rival word exists.

**Relationships:** Links to other terms — what it contains, depends on, or is distinguished from. Reference other terms by name (e.g. "an [[Order]] without a confirmed [[Payment]]").

**Edge cases:** The boundary scenarios that pin the term down — what counts, what does not, what happens at zero/empty/expired.
```

## Rules

- **Alphabetical.** Entries sorted A–Z so any term is found by name, not by reading the file.
- **One authoritative definition per term.** No synonyms with their own entries — pick the canonical name, retire the rivals inline under **Avoid** so they are visible at the moment someone is about to write them (a bare `See [[Canonical]]` entry hides that guidance), and redirect any pre-existing synonym entries to the canonical one.
- **Be opinionated in Avoid lists.** When multiple words compete for one concept, the entry names the winner; writers using a retired word learn the canonical one from the same glance.
- **No implementation detail.** No table names, function signatures, file paths, libraries, or "we use X for this." That belongs in specs or architecture, not the glossary.
- **No duplication.** A fact lives in exactly one entry. If two terms overlap, the relationship line links them rather than restating.
- **Definition before relationships.** A reader must understand the term standalone before seeing how it connects.

## Example

```markdown
### Reservation

**Definition:** A time-bounded hold a guest places on a Room before it becomes a Booking. Expires if not confirmed.

**Avoid:** booking request, hold, provisional booking

**Relationships:** Held against one [[Room]]; converts to a [[Booking]] on payment; blocks other [[Reservation]]s for the same dates.

**Edge cases:** Two reservations may target the same Room for non-overlapping dates. An expired Reservation frees the Room immediately, even mid-checkout.
```
