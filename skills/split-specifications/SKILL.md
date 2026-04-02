---
name: split-specifications
description: This skill should be used when converting a single-file spec to directory-based format for better organization of large specifications
user-invocable: true
---

# Split Specifications Skill

Converts a single-file product spec (`{{specs_dir}}/product_specs.md`) into a directory-based format (`{{specs_dir}}/product_specs/`) for better organization and targeted context loading.

## When to Use

- **Automatically** by `product-design` and `sync-specs` when the single-file PRD crosses **500 lines** or **15 features** (feature sections matching `### \d+\.\d+`)
- **Manually** when the user invokes `/split-specifications`

## Step 0: Resolve Project Context

1. **Monorepo check:** Does `.groundwork.yml` exist at the repo root?
   - If yes → Is `{{project_name}}` non-empty?
     - If empty → Invoke `Skill(skill="groundwork:project-selector")` to select a project, then restart this skill.
     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.
   - If no → Continue (single-project repo).
2. Proceed with the resolved project context.

## Step 1: Validate Preconditions

1. **Check single file exists:** `{{specs_dir}}/product_specs.md` must exist
   - If missing → output "No single-file PRD found at `{{specs_dir}}/product_specs.md`. Nothing to split." and stop.
2. **Check directory does NOT exist:** `{{specs_dir}}/product_specs/` must not already exist
   - If it exists → output "PRD is already in directory format at `{{specs_dir}}/product_specs/`. Nothing to do." and stop.
3. **Read the file** and count lines and features (sections matching `^### \d+\.\d+`).

## Step 2: Split the File

Parse the single-file PRD into sections and write each to its own file under `{{specs_dir}}/product_specs/`.

### Directory Structure

```
{{specs_dir}}/product_specs/
├── _index.md              # Header, metadata, and section 0 (EARS cheat sheet)
├── 01-product-context.md  # Section 1: Product context
├── 02-non-functional.md   # Section 2: Non-functional & cross-cutting requirements
├── 03-features/           # Section 3: One file per feature
│   ├── _index.md          # Section 3 header ("## 3) Feature list (living backlog)")
│   └── <feature-code>.md  # e.g., PRD-SRCH.md, PRD-AUTH.md
├── 04-traceability.md     # Section 4: Traceability
└── 05-open-questions.md   # Section 5: Open questions log
```

### Parsing Rules

1. **`_index.md`** — Everything from the start of the file up to (but not including) `## 1)`. Include the YAML-style header block (Doc status, Last updated, Owner, Audience) and section 0 (EARS cheat sheet).

2. **`01-product-context.md`** — From `## 1)` up to (but not including) `## 2)`.

3. **`02-non-functional.md`** — From `## 2)` up to (but not including) `## 3)`.

4. **`03-features/_index.md`** — The `## 3)` heading line and any text before the first `### 3.` subsection. Typically just:
   ```markdown
   ## 3) Feature list (living backlog)
   ```

5. **`03-features/<feature-code>.md`** — One file per `### 3.N` subsection. The filename is derived from the feature's PRD code:
   - Extract the code from the heading, e.g., `### 3.1 Text Search (PRD-SRCH)` → `PRD-SRCH.md`
   - If no code in parentheses, use a slug of the feature name: `### 3.5 Signature Display` → `signature-display.md`
   - Preserve the full `### 3.N ...` heading in the file

6. **`04-traceability.md`** — From `## 4)` up to (but not including) `## 5)`.

7. **`05-open-questions.md`** — From `## 5)` to the end of the file, or up to `## 6)` if present. If there is a `## 6)` (e.g., "Out of scope"), include it in `05-open-questions.md` as well.

### Edge Cases

- If a section is missing from the source file, skip that output file (don't create empty files).
- Preserve all horizontal rules (`---`) as they appear in the source.
- Preserve trailing newlines — each output file should end with a single newline.

## Step 3: Delete the Single File

After all directory files are written and verified:

1. **Verify** — Read back `_index.md` and at least two feature files to confirm they look correct.
2. **Delete** — Remove `{{specs_dir}}/product_specs.md` using `rm`.
3. **Confirm** — Output a summary:

```
Split product_specs.md into directory format:
  {{specs_dir}}/product_specs/
  ├── _index.md
  ├── 01-product-context.md
  ├── 02-non-functional.md
  ├── 03-features/ (N feature files)
  ├── 04-traceability.md
  └── 05-open-questions.md

The single file has been removed. All skills (product-design, sync-specs, etc.) already support directory mode.
```

## Auto-Split Thresholds

When invoked automatically (not by the user), the caller has already verified that **at least one** threshold is crossed:

- **Line count:** `wc -l` on `{{specs_dir}}/product_specs.md` >= 500
- **Feature count:** Number of `### \d+\.\d+` headings >= 15

No user confirmation is needed — the split happens silently and the caller reports what happened.

When invoked manually by the user, skip threshold checks and split unconditionally.
