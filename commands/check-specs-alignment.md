---
name: groundwork:check-specs-alignment
description: Verify alignment between code and specs. Usage /groundwork:check-specs-alignment
argument-hint: "[alignment-context]"
allowed-tools: ["Read", "Glob", "Grep", "Task", "Skill"]
disable-model-invocation: true
---

CRITICAL INSTRUCTION: Before doing ANYTHING else, you MUST call the Skill tool with:
  Skill(skill="groundwork:check-alignment")

Do NOT read files, explore code, or generate any response before invoking this skill. The skill contains your complete workflow and you must follow it exactly as presented to you.
