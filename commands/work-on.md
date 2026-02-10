---
name: groundwork:work-on
description: Execute task with worktree isolation. Usage /groundwork:work-on 4 or /groundwork:work-on TASK-004
argument-hint: "[task-number]"
allowed-tools: ["Read", "Bash", "Glob", "Grep", "Task", "Skill", "AskUserQuestion"]
disable-model-invocation: true
---

CRITICAL INSTRUCTION: Before doing ANYTHING else, you MUST call the Skill tool with:
  Skill(skill="groundwork:execute-task")

Do NOT read files, explore code, or generate any response before invoking this skill. The skill contains your complete workflow and you must follow it exactly as presented to you.
