# `select-project`

> **Run it:** `/groundwork:select-project [project-name]` · **Tier:** user-run or model-invoked · **Reads:** `.groundwork.yml` at the repo root, each project's `specs/` directory · **Writes:** the persisted project selection, through `node ${CLAUDE_PLUGIN_ROOT}/lib/persist-project.js`

## What it does

Switches the active project in a configured monorepo. It reads `.groundwork.yml`, lists each project with its path and which specs exist, asks which one to work on, and persists your answer as the active context. It then shows the new project's spec status and suggests a next action.

## When to reach for it

- The repository has a `.groundwork.yml` and you want to work on a different project.
- You want to see, per project, which specs exist before choosing.
- **Not when:** the repository is not configured yet. It stops on a missing `.groundwork.yml` and sends you to `setup-repo`.

## Common questions

**There is no `.groundwork.yml`.**

It stops there, with: "No `.groundwork.yml` found. Run `/groundwork:setup-repo` to configure your repository first."

**I passed the project name. Why was I still asked?**

It asks only when you gave no name, or the name matches no project in `.groundwork.yml`. A name that matches selects that project directly, without the question; an unknown one brings up the table with a note that the name was not found.

**Does the selection survive `/clear`?**

In a terminal pane, yes: the selection is pane-scoped and other panes are unaffected. Where the harness has no pane identity (chat-window UIs), every selector invocation prints a `groundwork-project-selection-v1` receipt, which a harness that delivers the tool response to the PostToolUse pin hook attaches to that chat's own snapshot.

**What if the harness cannot pin that receipt?**

That is the case for manual runs and hookless exports: only a workspace-level default shared across chats exists. Treat the selection as conversation-scoped — state the active project in your reply, and pass it explicitly later: `--project <name>` where `plan-task`, `implement-task`, `validate`, `finalize-task`, `just-do-it`, `just-do-it-swarming`, and `improve-codebase-architecture` support it, or `GROUNDWORK_PROJECT=<name>` for lib scripts.

**The Specs column says `(none)`. What now?**

The column reports what is in each `<path>/specs/`. After the switch, a status block lists PRD, Architecture, Tasks, and Design System as exists or missing, and suggests a next action based on what is available.

## It's working if

- A table headed `## Available Projects` lists the projects from `.groundwork.yml` with the columns `#`, `Project`, `Path`, `Specs`.
- The Specs column matches what is in each `<path>/specs/`.
- It asked which project through `AskUserQuestion` — unless you passed a project name that matches, in which case that project was selected without a question.
- `node ${CLAUDE_PLUGIN_ROOT}/lib/persist-project.js "<selected-name>"` was run for your choice.
- It confirmed: "Switched to project **<name>**. Specs at `<path>/specs/`."
- A status block follows, with PRD, Architecture, Tasks, and Design System each marked exists or missing, plus a suggested next action.
- In a pane-less harness, the `groundwork-project-selection-v1` receipt was printed.

**It is not working if:** the confirmation line appeared with no `persist-project.js` run before it, or no spec status followed.
