---
name: groundwork:select-project
description: Switch to a different project in a monorepo
allowed-tools: Read, Glob, Grep, AskUserQuestion, Skill
argument-hint: "[project-name]"
disable-model-invocation: true
---

Switch to a different project in a monorepo. Lists available projects from `.groundwork.yml` and sets the active project context.

If a project name is provided as argument, switch directly without prompting.

**You MUST call the Skill tool now:** `Skill(skill="groundwork:project-selector")`
