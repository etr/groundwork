---
name: groundwork:setup-repo
description: Configure this repository for Groundwork - detect single-project or monorepo structure
allowed-tools: Read, Glob, Grep, Bash(git:*), Write, Edit, AskUserQuestion, Skill
argument-hint: ""
disable-model-invocation: true
---

Configure this repository for Groundwork. Detects whether this is a single-project or monorepo and sets up the appropriate configuration.

**You MUST call the Skill tool now:** `Skill(skill="groundwork:repo-setup")`
