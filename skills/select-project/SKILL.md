---
name: select-project
description: This skill should be used when the user wants to switch between projects in a monorepo - lists projects from .groundwork.yml and sets the active project
argument-hint: "[project-name]"
---

# Select Project Skill

Quick project switching within a configured monorepo.

## Workflow

### Step 1: Load Config

Read `.groundwork.yml` from the repo root.

**If not found:** "No `.groundwork.yml` found. Run `/groundwork:setup-repo` to configure your repository first."

### Step 2: List Projects

Present available projects with their spec status:

```markdown
## Available Projects

| # | Project | Path | Specs |
|---|---------|------|-------|
| 1 | web-app | apps/web-app | PRD, Architecture, Tasks |
| 2 | mobile-app | apps/mobile-app | PRD |
| 3 | api-server | services/api | (none) |
```

For each project, check if `<path>/specs/` exists and what spec files are present.

Use `AskUserQuestion` to ask which project to work on.

### Step 3: Set Context

Persist the selection and use the returned project/root values as the active context:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/lib/persist-project.js "<selected-name>"
   ```
The script resolves its own harness-specific selection scope internally — no env vars required.

Confirm: "Switched to project **<name>**. Specs at `<path>/specs/`."

Selection scope: in a terminal pane, the selection is pane-scoped, survives `/clear`, and other panes are unaffected. Where the harness has no pane identity (chat-window UIs), the persisted selection is only a workspace-level default shared across chats — treat the selection as conversation-scoped: state the active project in your reply, and pass it explicitly on later invocations (`--project <name>` where plan-task, implement-task, and validate support it, or `GROUNDWORK_PROJECT=<name>` for lib scripts).

### Step 4: Show Status

After switching, show the project's spec status:
- PRD: exists / missing
- Architecture: exists / missing
- Tasks: exists / missing
- Design System: exists / missing

Suggest next action based on what's available.
