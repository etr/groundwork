---
name: groundwork:plan-task
description: Plan a task or feature without implementing. Usage /groundwork:plan-task 4 or /groundwork:plan-task "Add user login"
argument-hint: "[task-number-or-description]"
allowed-tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Task", "Skill", "AskUserQuestion"]
disable-model-invocation: true
---

CRITICAL INSTRUCTION: Before doing ANYTHING else, you MUST call the Skill tool with:
  Skill(skill="groundwork:task-planning")

Do NOT read files, explore code, or generate any response before invoking this skill. The skill contains your complete workflow and you must follow it exactly as presented to you.
