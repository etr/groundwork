---
name: groundwork:review-pr
description: Review a GitHub PR using multi-agent verification. Usage /groundwork:review-pr [PR number or URL]. Pass --no-interactive to skip all prompts and auto-publish.
argument-hint: "[PR number or URL] [--no-interactive]"
allowed-tools: ["Bash", "Read", "Grep", "Glob", "Agent", "AskUserQuestion", "Skill"]
disable-model-invocation: true
---

CRITICAL INSTRUCTION: Before doing ANYTHING else, you MUST call the Skill tool with:
  Skill(skill="groundwork:pr-reviewing")

Do NOT read files, explore code, or generate any response before invoking this skill. The skill contains your complete workflow and you must follow it exactly as presented to you.
