---
name: project-selector
description: This skill should be used when the user wants to switch between projects in a monorepo - lists projects from .groundwork.yml and sets the active project
user-invocable: false
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

1. Set `GROUNDWORK_PROJECT=<selected-name>`
2. Set `GROUNDWORK_PROJECT_ROOT=<absolute-path>`
3. Persist selection via the persist script:
   ```bash
   node ${PLUGIN_ROOT}/lib/persist-project.js <selected-name>
   ```
   Where `${PLUGIN_ROOT}` is the groundwork plugin directory (use the plugin root path from the session context). The script resolves its own terminal-pane identity internally — no env vars required.

Confirm: "Switched to project **<name>**. Specs at `<path>/specs/`."

### Step 4: Show Status

After switching, show the project's spec status:
- PRD: exists / missing
- Architecture: exists / missing
- Tasks: exists / missing
- Design System: exists / missing

Suggest next action based on what's available.
