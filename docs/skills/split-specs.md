# `split-specs`

> **Run it:** `/groundwork:split-specs` · **Tier:** user-run or model-invoked — `design-product` and `source-product-specs-from-code` call it automatically at 500 lines or 15 features · **Reads:** `specs/product_specs.md` · **Writes:** the `specs/product_specs/` directory, then removes the single file

## What it does

Converts a single-file PRD into a directory holding the same content, so later skills can load only the part they need. Each section of `specs/product_specs.md` becomes its own file under `specs/product_specs/`, one file per feature, with the headings preserved. It reads back what it wrote, then deletes the single file.

## When to reach for it

- You ran `/groundwork:split-specs` yourself on a PRD that has grown large.
- Another skill crossed the threshold — 500 lines or 15 features — and called it.
- **Not when:** the file that grew is the architecture document. That is `split-architecture`.

## Common questions

**It said "Nothing to split" or "Nothing to do".**

"Nothing to split" means `specs/product_specs.md` does not exist. "Nothing to do" means `specs/product_specs/` already does — the PRD is already in directory format. Either way it stops without changing anything.

**It split the file without asking me.**

By design. A skill that calls it after checking the thresholds gets no confirmation prompt, and a manual run skips the threshold check entirely. The one case where it stops is a model reaching for it on its own with neither threshold crossed: it reports the counts and does nothing.

**Where did my feature go?**

Into `specs/product_specs/03-features/`, one file per `### 3.N` subsection. The file is named by the PRD code in the heading when there is one (`PRD-SRCH.md`), otherwise by a slug of the feature name (`signature-display.md`). The full heading is kept inside the file.

**Is the single file gone for good?**

Yes. It is removed with `rm`, but only after `_index.md` and at least two feature files are read back to confirm they look right. The skills that read the PRD already support directory mode.

## It's working if

- `specs/product_specs.md` no longer exists, and `specs/product_specs/` does.
- The directory holds `_index.md`, `01-product-context.md`, `02-non-functional.md`, `03-features/`, `04-traceability.md`, and `05-open-questions.md` — less any section the source file did not have.
- `03-features/` has its own `_index.md` and one file per `### 3.N` feature, each keeping its full heading.
- `_index.md` holds the header block and section 0, the EARS cheat sheet.
- `_index.md` and at least two feature files were read back before the single file was deleted.
- Every file ends with a single newline, and horizontal rules are kept as they were.
- The summary starts "Split product_specs.md into directory format:" and lists the tree with the feature-file count.

**It is not working if:** the single file and the directory both exist afterwards, or a file was created for a section the source never had.
