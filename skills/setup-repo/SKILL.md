---
name: setup-repo
description: This skill should be used when configuring a repository for groundwork - detects single-project or monorepo structure and creates .groundwork.yml
---

# Setup Repository Skill

Configures the repository structure for Groundwork. Detects or asks whether this is a single-project repo or a monorepo, and creates `.groundwork.yml` for monorepos.

## Workflow

### Step 1: Detect Repository Structure

Look for common monorepo patterns:
- Multiple directories with their own `package.json`, `go.mod`, `Cargo.toml`, etc.
- Common monorepo directories: `apps/`, `packages/`, `services/`, `projects/`
- Existing `specs/` directory (suggests single-project)
- Workspace configuration files (`pnpm-workspace.yaml`, `lerna.json`, `turbo.json`)

### Step 2: Ask User

Use `AskUserQuestion` to confirm:

> "I've analyzed your repo structure. Is this:"
> - **Single project** — One project, specs at the repo root
> - **Monorepo** — Multiple projects, each with their own specs

If monorepo indicators were found, mention them:
> "I noticed [apps/, packages/, workspace config], which suggests a monorepo structure."

### Step 3: Configure

**If single project:**
- No config file needed
- Ensure `.groundwork-plans/`, `.debug/`, and `.architecture/` are in `.gitignore` (add any missing entries) — plan-task, debug, and swarm-design-architecture write per-task working files there. All three patterns are unanchored, so they cover any depth.
- Confirm: "Single-project mode. Specs will be stored in `specs/` at the repo root, plans in `.groundwork-plans/`."
- Proceed — no `.groundwork.yml` created.

**If monorepo:**
1. Ask which directories are projects. Suggest based on detected structure.
2. Use `AskUserQuestion` with multi-select to confirm project list.
3. Create `.groundwork.yml`:

```yaml
version: 1
projects:
  <project-name>:
    path: <relative/path>
  <project-name>:
    path: <relative/path>
```

4. Ensure `.groundwork.local`, `.groundwork-plans/`, `.debug/`, and `.architecture/` are in `.gitignore` (add any missing entries). Each project's plans live in `<project-path>/.groundwork-plans/` and its journals in `<project-path>/.debug/` and `<project-path>/.architecture/`; the unanchored entries cover every project, so no per-project entries are needed.
5. Ask which project to start with using `AskUserQuestion`.
6. Set project context: `GROUNDWORK_PROJECT=<name>` and `GROUNDWORK_PROJECT_ROOT=<path>`

### Step 4: Persist Selection

For monorepo mode, persist the selection through the same mechanism `/groundwork:select-project` uses:

```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/persist-project.js "<selected-name>"
```

This keys state per terminal pane (and pins a per-chat snapshot where hooks observe the selection), so concurrent sessions do not clobber each other. Do not write `.groundwork.local` by hand — it is a legacy format read only for one-time migration.

Confirm: "Project **<name>** selected. Specs will be stored in `<path>/specs/`."

## Adding Projects Later

This skill can also be invoked to add or remove projects from an existing `.groundwork.yml`:
- Read existing config
- Present current projects
- Ask what to add/remove
- Update the config file

## Edge Cases

| Situation | Response |
|-----------|----------|
| `.groundwork.yml` already exists | Show current config, ask if user wants to modify |
| No obvious project directories | Ask user to specify paths manually |
| User says single-project but monorepo indicators exist | Accept user's choice, note the indicators |
