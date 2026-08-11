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

### Step 4: Show Status

After switching, show the project's spec status:
- PRD: exists / missing
- Architecture: exists / missing
- Tasks: exists / missing
- Design System: exists / missing

Suggest next action based on what's available.
