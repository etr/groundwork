---
name: groundwork:swarm-debug
description: Start swarm debugging with parallel hypothesis investigation. Usage /groundwork:swarm-debug [bug description]
argument-hint: "[bug description]"
allowed-tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Task", "Skill"]
disable-model-invocation: true
---

CRITICAL INSTRUCTION: Before doing ANYTHING else, you MUST call the Skill tool with:
  Skill(skill="groundwork:swarm-debugging")

Do NOT read files, explore code, or generate any response before invoking this skill. The skill contains your complete workflow and you must follow it exactly as presented to you.
