---
name: groundwork:implement-task
description: Implement a previously planned task. Usage /groundwork:implement-task 4 or /groundwork:implement-task path/to/plan.md
argument-hint: "[task-number-or-plan-path]"
allowed-tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Task", "Skill", "AskUserQuestion"]
disable-model-invocation: true
---

CRITICAL INSTRUCTION: Before doing ANYTHING else, you MUST call the Skill tool with:
  Skill(skill="groundwork:task-implementation")

Do NOT read files, explore code, or generate any response before invoking this skill. The skill contains your complete workflow and you must follow it exactly as presented to you.
