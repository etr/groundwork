---
name: groundwork:just-do-it-swarming
description: Execute all remaining tasks using agent teams for context isolation. Each task runs in its own session. Usage /groundwork:just-do-it-swarming [--parallel]
allowed-tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Task", "AskUserQuestion", "Skill"]
disable-model-invocation: true
---

CRITICAL INSTRUCTION: Before doing ANYTHING else, you MUST call the Skill tool with:
  Skill(skill="groundwork:execute-all-tasks-swarming")

Do NOT read files, explore code, or generate any response before invoking this skill. The skill contains your complete workflow and you must follow it exactly as presented to you.
