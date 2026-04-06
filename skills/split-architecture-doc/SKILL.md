---
name: split-architecture-doc
description: This skill should be used when converting a single-file architecture doc to directory-based format for better organization of large architecture documents
user-invocable: true
---

# Split Architecture Skill

Converts a single-file architecture document (`{{specs_dir}}/architecture.md`) into a directory-based format (`{{specs_dir}}/architecture/`) for better organization and targeted context loading.

## When to Use

- **Automatically** by `architecture` and `sync-architecture` when the single-file architecture doc crosses **500 lines** or **10 decision records** (sections matching `### DR-\d+`)
- **Manually** when the user invokes `/split-architecture`

## Step 0: Resolve Project Context

1. **Monorepo check:** Does `.groundwork.yml` exist at the repo root?
   - If yes → Is `{{project_name}}` non-empty?
     - If empty → Invoke `Skill(skill="groundwork:project-selector")` to select a project, then restart this skill.
     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.
   - If no → Continue (single-project repo).
2. Proceed with the resolved project context.

## Step 1: Validate Preconditions

1. **Check single file exists:** `{{specs_dir}}/architecture.md` must exist
   - If missing → output "No single-file architecture doc found at `{{specs_dir}}/architecture.md`. Nothing to split." and stop.
2. **Check directory does NOT exist:** `{{specs_dir}}/architecture/` must not already exist
   - If it exists → output "Architecture doc is already in directory format at `{{specs_dir}}/architecture/`. Nothing to do." and stop.
3. **Read the file** and count lines and decision records (sections matching `^### DR-\d+`).

## Step 2: Split the File

Parse the single-file architecture doc into sections and write each to its own file under `{{specs_dir}}/architecture/`.

### Directory Structure

```
{{specs_dir}}/architecture/
├── _index.md                 # Header, metadata
├── 01-executive-summary.md   # Section 1: Executive Summary
├── 02-architectural-drivers.md # Section 2: Architectural Drivers
├── 03-system-overview.md     # Section 3: System Overview
├── 04-components/            # Section 4: One file per component
│   ├── _index.md             # Section 4 header ("## 4) Component Details")
│   └── <component-slug>.md   # e.g., cli.md, query-router.md
├── 05-data.md                # Section 5: Data Architecture
├── 06-integration.md         # Section 6: Integration Architecture
├── 07-security.md            # Section 7: Security Architecture
├── 08-infrastructure.md      # Section 8: Infrastructure & Deployment
├── 09-observability.md       # Section 9: Observability
├── 10-cost-model.md          # Section 10: Cost Model
├── 11-decisions/             # Section 11: One file per DR
│   ├── _index.md             # Section 11 header ("## 11) Decision Records")
│   └── DR-NNN.md             # e.g., DR-001.md, DR-015.md
├── 12-open-questions.md      # Section 12: Open Questions & Risks
└── 13-appendices.md          # Section 13: Appendices
```

### Parsing Rules

1. **`_index.md`** — Everything from the start of the file up to (but not including) `## 1)`. This includes the header block (Version, Last updated, Status, Owner).

2. **`01-executive-summary.md`** — From `## 1)` up to (but not including) `## 2)`.

3. **`02-architectural-drivers.md`** — From `## 2)` up to (but not including) `## 3)`.

4. **`03-system-overview.md`** — From `## 3)` up to (but not including) `## 4)`.

5. **`04-components/_index.md`** — The `## 4)` heading line and any text before the first `### 4.` subsection. Typically just:
   ```markdown
   ## 4) Component Details
   ```

6. **`04-components/<component-slug>.md`** — One file per `### 4.N` subsection. The filename is a slug of the component name:
   - `### 4.1 CLI` → `cli.md`
   - `### 4.2 Query Router` → `query-router.md`
   - `### 4.15 MCP Server` → `mcp-server.md`
   - Preserve the full `### 4.N ...` heading in the file

7. **`05-data.md`** — From `## 5)` up to (but not including) `## 6)`.

8. **`06-integration.md`** — From `## 6)` up to (but not including) `## 7)`.

9. **`07-security.md`** — From `## 7)` up to (but not including) `## 8)`.

10. **`08-infrastructure.md`** — From `## 8)` up to (but not including) `## 9)`.

11. **`09-observability.md`** — From `## 9)` up to (but not including) `## 10)`.

12. **`10-cost-model.md`** — From `## 10)` up to (but not including) `## 11)`.

13. **`11-decisions/_index.md`** — The `## 11)` heading line and any text before the first `### DR-` subsection.

14. **`11-decisions/DR-NNN.md`** — One file per `### DR-NNN` subsection. The filename matches the DR number:
    - `### DR-001: Project Structure` → `DR-001.md`
    - `### DR-015: Call Graph Data Model [V3]` → `DR-015.md`
    - Preserve the full `### DR-NNN: ...` heading in the file

15. **`12-open-questions.md`** — From `## 12)` up to (but not including) `## 13)`.

16. **`13-appendices.md`** — From `## 13)` to the end of the file.

### Edge Cases

- If a section is missing from the source file, skip that output file (don't create empty files).
- If non-standard numbered sections exist beyond 13, include them as `NN-slug.md` files.
- Preserve all horizontal rules (`---`) as they appear in the source.
- Preserve trailing newlines — each output file should end with a single newline.

## Step 3: Delete the Single File

After all directory files are written and verified:

1. **Verify** — Read back `_index.md`, at least one component file, and at least one DR file to confirm they look correct.
2. **Delete** — Remove `{{specs_dir}}/architecture.md` using `rm`.
3. **Confirm** — Output a summary:

```
Split architecture.md into directory format:
  {{specs_dir}}/architecture/
  ├── _index.md
  ├── 01-executive-summary.md
  ├── 02-architectural-drivers.md
  ├── 03-system-overview.md
  ├── 04-components/ (N component files)
  ├── 05-data.md
  ├── ...
  ├── 11-decisions/ (N decision records)
  ├── 12-open-questions.md
  └── 13-appendices.md

The single file has been removed. All skills (architecture, sync-architecture, etc.) already support directory mode.
```

## Auto-Split Thresholds

When invoked automatically (not by the user), the caller has already verified that **at least one** threshold is crossed:

- **Line count:** `wc -l` on `{{specs_dir}}/architecture.md` >= 500
- **Decision record count:** Number of `### DR-\d+` headings >= 10

No user confirmation is needed — the split happens silently and the caller reports what happened.

When invoked manually by the user, skip threshold checks and split unconditionally.
