---
name: groundwork:create-tasks
description: Generate implementation tasks from architecture document. Usage /groundwork:create-tasks
argument-hint: "[filter]"
allowed-tools: ["Read", "Edit", "Write", "Glob", "Grep", "Task", "Skill"]
disable-model-invocation: true
---

CRITICAL INSTRUCTION: Before doing ANYTHING else, you MUST call the Skill tool with:
  Skill(skill="groundwork:tasks")

Do NOT read files, explore code, or generate any response before invoking this skill. The skill contains your complete workflow and you must follow it exactly as presented to you.
