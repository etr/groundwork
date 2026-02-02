---
name: split-spec
description: Convert a single-file spec to directory-based format for better organization
argument-hint: "[product_specs|architecture|tasks]"
allowed-tools: ["Read", "Edit", "Bash", "Glob", "Grep", "Write"]
disable-model-invocation: true
---

# Split Spec Command

Converts a single-file spec (e.g., `specs/product_specs.md`) into a directory-based format with content split across multiple files for better organization of large specs.

## Usage

- `/split-spec product_specs` - Split PRD into directory structure
- `/split-spec architecture` - Split architecture doc into directory structure
- `/split-spec tasks` - Split tasks file into directory structure

## When to Use

- Spec file has grown large (>500 lines)
- Multiple people need to work on different sections
- Want to organize by feature, milestone, or component
- Need cleaner git diffs for section-specific changes

## Workflow

### Step 1: Validate Input

1. Parse the spec name from the argument:
   - `product_specs` or `prd` → Product specs
   - `architecture` or `arch` → Architecture document
   - `tasks` → Tasks file

2. Check if single-file version exists:
   - `specs/<spec-name>.md` must exist
   - If directory already exists, warn and ask to confirm overwrite

3. Read the current file content for parsing.

### Step 2: Parse Sections

Parse the spec file by markdown sections (headings).

**For Product Specs (`product_specs.md`):**
```
specs/product_specs/
├── _index.md                 # §1-2 (Overview, NFRs)
├── 03-features/              # §3 (Feature list)
│   ├── _index.md             # Feature list overview
│   ├── <feature-code>.md     # One file per feature (by PRD-XXX prefix)
├── 04-traceability.md        # §4
└── 05-open-questions.md      # §5
```

**For Architecture (`architecture.md`):**
```
specs/architecture/
├── _index.md                 # §1-3 (Summary, Drivers, Overview)
├── 04-components/            # §4 (Component details)
│   └── <component>.md        # One file per component
├── 05-data.md                # §5 (Data architecture)
├── 06-integration.md         # §6 (Integration)
├── 07-security.md            # §7 (Security)
├── 08-infrastructure.md      # §8 (Infrastructure)
├── 09-observability.md       # §9 (Observability)
├── 10-testing.md             # §10 (Testing strategy)
├── 11-decisions/             # §11 (Decision records)
│   └── DR-NNN.md             # One file per decision
└── 12-appendices.md          # §12 (Appendices)
```

**For Tasks (`tasks.md`):**
```
specs/tasks/
├── _index.md                 # Overview, dependency graph
└── M<N>-<milestone-name>/    # One directory per milestone
    └── TASK-NNN.md           # One file per task
```

### Step 3: Create Directory Structure

1. Create the spec directory: `specs/<spec-name>/`
2. Create subdirectories as needed (e.g., `03-features/`, `11-decisions/`)
3. Write each section to its appropriate file

**Section Detection Rules:**

For PRD:
- Look for `## 1.`, `## 2.`, etc. for main sections
- Look for `### 3.N Feature Name` for features
- Extract feature code from `PRD-XXX-REQ-*` patterns

For Architecture:
- Look for `## 1.`, `## 2.`, etc. for main sections
- Look for `### 4.N Component Name` for components
- Look for `### DR-NNN:` for decision records

For Tasks:
- Look for `## M<N>:` for milestones
- Look for `### TASK-NNN:` for tasks

### Step 4: Backup Original

Before removing the original file:

1. Create backup at `specs/<spec-name>.md.bak`
2. Verify backup is readable

### Step 5: Verify Aggregation

After splitting:

1. Aggregate all new files in sorted order
2. Compare aggregated content to original (ignoring whitespace)
3. Report any differences

**Success output:**
```markdown
## Split Complete: <spec-name>

**Original:** specs/<spec-name>.md (backed up to .bak)
**New structure:**
- specs/<spec-name>/
  - _index.md
  - [list other files created]

**Files created:** N
**Content verified:** Aggregated content matches original

**Note:** All skills now automatically read from both file and directory formats.
To revert: `mv specs/<spec-name>.md.bak specs/<spec-name>.md && rm -rf specs/<spec-name>/`
```

### Step 6: Error Handling

| Error | Response |
|-------|----------|
| Spec not found | "No specs/<spec-name>.md found. Create it first with the appropriate skill." |
| Directory exists | "specs/<spec-name>/ already exists. Overwrite? (yes/no)" |
| Parse failure | "Could not parse sections. Manual splitting may be needed." |
| Write failure | "Failed to write files. Check permissions and disk space." |
| Verification failed | "Warning: Aggregated content differs from original. Check the split files manually." |

## Directory Structure Convention

### Ordering Rules

- `_index.md` always first in any directory
- Files/directories sorted by numeric prefix (e.g., `03-features` before `04-components`)
- Within same prefix, alphabetical order

### File Naming

- Use lowercase with hyphens: `feature-name.md`
- Include numeric prefix for ordering: `03-features/`, `11-decisions/`
- Task files use ID: `TASK-001.md`
- Decision files use ID: `DR-001.md`

## Reverting a Split

To convert back to single-file format:

1. Aggregate directory content in order
2. Write to `specs/<spec-name>.md`
3. Remove directory

Or simply restore from backup if available:
```bash
mv specs/<spec-name>.md.bak specs/<spec-name>.md
rm -rf specs/<spec-name>/
```
