# `setup-repo`

> **Run it:** `/groundwork:setup-repo` · **Tier:** user-run or model-invoked · **Reads:** the repository's layout, an existing `.groundwork.yml`, `.gitignore` · **Writes:** `.groundwork.yml` at the repo root (monorepo only), missing `.gitignore` entries, the persisted project choice (monorepo only)

## What it does

Works out whether the repository is one project or a monorepo, asks you to confirm, and configures Groundwork to match. A single project gets no config file: specs live in `specs/` at the repo root. A monorepo gets a `.groundwork.yml` listing each project's path, and the project you pick to start with is persisted the same way `/groundwork:select-project` does it. Run it again later to add or remove projects.

## When to reach for it

- You are setting up a repository for Groundwork.
- You want to add or remove projects from an existing `.groundwork.yml`.
- **Not when:** `.groundwork.yml` already lists your projects and you only want to switch between them. That is `select-project`.

## Common questions

**Where is the config file for a single-project repo?**

There is none. Single-project mode needs no config file and creates no `.groundwork.yml`: specs go in `specs/` at the repo root and plans in `.groundwork-plans/`.

**What does it add to `.gitignore`?**

The Groundwork working directories, only the ones that are missing: `.groundwork-plans/`, `.debug/`, and `.architecture/` for a single project, plus `.groundwork.local` for a monorepo. The entries are unanchored, so in a monorepo they cover every project's `<project-path>/.groundwork-plans/`, `<project-path>/.debug/`, and `<project-path>/.architecture/` — no per-project entries are needed.

**Do I need to export `GROUNDWORK_PROJECT` after choosing a project?**

No. It asks which project to start with and persists your answer with `persist-project.js`, the mechanism `/groundwork:select-project` uses. An exported `GROUNDWORK_PROJECT` is not needed and would outrank a later `/groundwork:select-project`.

**It accepted "single project" right after pointing at monorepo indicators.**

Detection only suggests; your answer decides. It mentions the indicators it found (`apps/`, `packages/`, a workspace config), and if you still choose single-project it accepts that and notes them. When `.groundwork.yml` already exists, it shows the current config and asks whether you want to modify it.

## It's working if

- You were asked to confirm the structure through `AskUserQuestion` before anything was written; in a monorepo, the project list was confirmed with multi-select.
- The confirmation matches the mode: "Single-project mode. Specs will be stored in `specs/` at the repo root, plans in `.groundwork-plans/`." or "Project **<name>** selected. Specs will be stored in `<path>/specs/`."
- A single-project repo has no `.groundwork.yml`.
- A monorepo has `.groundwork.yml` with `version: 1` and, under `projects:`, each confirmed project as `<project-name>: path: <relative/path>`.
- The start project was persisted: `node ${CLAUDE_PLUGIN_ROOT}/lib/persist-project.js "<selected-name>"` was run.
- `.gitignore` carries the working-directory entries for the mode.

**It is not working if:** a single-project repo got a `.groundwork.yml`, `.groundwork.local` was written by hand, or files changed before you answered.
