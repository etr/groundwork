---
name: groundwork:build-unplanned
description: Build a feature from description with worktree isolation and TDD. Usage /groundwork:build-unplanned "Add user login"
argument-hint: "[feature-description]"
allowed-tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Task", "Skill", "AskUserQuestion"]
disable-model-invocation: true
---

CRITICAL INSTRUCTION: Before doing ANYTHING else, you MUST call the Skill tool with:
  Skill(skill="groundwork:build-unplanned-feature")

Do NOT read files, explore code, or generate any response before invoking this skill. The skill contains your complete workflow and you must follow it exactly as presented to you.
