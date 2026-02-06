---
name: groundwork:source-architecture-from-code
description: Synchronize architecture document with codebase changes. Usage /groundwork:source-architecture-from-code
argument-hint: "[files...]"
allowed-tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Skill"]
disable-model-invocation: true
---

CRITICAL INSTRUCTION: Before doing ANYTHING else, you MUST call the Skill tool with:
  Skill(skill="groundwork:sync-architecture")

Do NOT read files, explore code, or generate any response before invoking this skill. The skill contains your complete workflow and you must follow it exactly as presented to you.
