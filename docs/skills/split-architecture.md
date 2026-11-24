# `split-architecture`

> **Run it:** `/groundwork:split-architecture` · **Tier:** user-run or model-invoked — `design-architecture`, `swarm-design-architecture`, and `source-architecture-from-code` call it automatically at 500 lines or 10 decision records · **Reads:** `specs/architecture.md` · **Writes:** the `specs/architecture/` directory, then removes the single file

## What it does

Converts a single-file architecture document into a directory holding the same content, so later skills can load only the part they need. Each section of `specs/architecture.md` becomes its own file under `specs/architecture/`, with one file per component and one per decision record, headings preserved. It reads back what it wrote, then deletes the single file.

## When to reach for it

- You ran `/groundwork:split-architecture` yourself on an architecture document that has grown large.
- Another skill crossed the threshold — 500 lines or 10 decision records — and called it.
- **Not when:** the file that grew is the PRD. That is `split-specs`.

## Common questions

**It said "Nothing to split" or "Nothing to do".**

"Nothing to split" means `specs/architecture.md` does not exist. "Nothing to do" means `specs/architecture/` already does — the document is already in directory format. Either way it stops without changing anything.

**It split the file without asking me.**

By design. A skill that calls it after checking the thresholds gets no confirmation prompt, and a manual run skips the threshold check entirely. The one case where it stops is a model reaching for it on its own with neither threshold crossed: it reports the counts and does nothing.

**Where did my decision records go?**

Into `specs/architecture/11-decisions/`, one file per `### DR-NNN` subsection, named by its number — `DR-001.md` — with the full heading kept. Components go the same way to `04-components/<component-slug>.md`, such as `query-router.md`.

**The document has a section numbered past 13.**

It is kept, as its own `NN-slug.md` file. Sections missing from the source are the only ones without a file; no empty files are created.

## It's working if

- `specs/architecture.md` no longer exists, and `specs/architecture/` does.
- The directory holds `_index.md` and the numbered section files from `01-executive-summary.md` through `13-appendices.md` — less any section the source file did not have.
- `04-components/` has its own `_index.md` and one file per `### 4.N` component, each keeping its full heading.
- `11-decisions/` has its own `_index.md` and one `DR-NNN.md` per decision record.
- `_index.md` holds the header block: Version, Last updated, Status, Owner.
- `_index.md`, at least one component file, and at least one decision record file were read back before the single file was deleted.
- The summary starts "Split architecture.md into directory format:" and lists the tree with the component and decision-record counts.

**It is not working if:** the single file and the directory both exist afterwards, or two decision records ended up in one file.
