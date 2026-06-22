---
name: handoff
description: Use when ending a session or passing work to another agent - produces a compact handoff document that transfers context, state, and next objective without copying source material
argument-hint: "[focus]"
allowed-tools: Bash, Read, Write
---

# Handoff

## Overview

A handoff is a **baton, not a backpack**: it carries just enough for the next session to resume, and points at everything else. The receiving agent has none of this conversation's context, so the document is the entire transfer — but it must stay compact, or it competes for the very context budget it is meant to preserve.

**Core principle:** Reference artifacts by path or URL; never duplicate their content into the handoff.

## When to Use

- Ending a session with work still in progress
- Handing a task to another agent or person
- Approaching context compaction and wanting a durable resume point

The optional `[focus]` argument shapes the summary toward the next objective (e.g. `/groundwork:handoff finish the auth refactor`). Without it, summarize toward the most recent active thread.

## Process

### 1. Locate work products

Gather what already exists rather than restating it. Run as needed:

```bash
git rev-parse --abbrev-ref HEAD          # current branch
git log --oneline -5                     # recent commits
git status --short                       # uncommitted changes
git diff --stat                          # scope of working-tree changes
```

Note paths to PRDs, plans (`.groundwork-plans/`), ADRs, specs, and any issue/PR URLs. These become links, not content.

### 2. Compose the document

Write to a temp path **outside the repo**, slug derived from the focus:

```bash
SLUG=$(echo "${ARGUMENTS:-session}" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-' | cut -c1-40)
OUT="${TMPDIR:-/tmp}/groundwork-handoff-${SLUG}.md"
```

The document has exactly these sections:

| Section | Contents |
|---------|----------|
| **Summary** | Focused recap of the conversation, tailored to the next objective. Decisions made and why; dead ends ruled out. |
| **State** | What is done, what is in progress, what is blocked. Branch and commit refs. |
| **Next objective** | The single thing the receiving session should accomplish next. |
| **Artifacts** | Bulleted links — paths, branch names, commit SHAs, diffs, issue/PR URLs. **References only.** |
| **Suggested skills** | Which Groundwork skills to invoke next, and a pointer to [[using-groundwork]] to map any remaining work. |

### 3. Redact before writing

Strip secrets, API keys, tokens, credentials, and PII from every section. Replace with `[REDACTED]`. Never echo a `.env` value or auth header into the file.

### 4. Report the path

Print the absolute temp path so the user can hand it off. Do not move it into the workspace.

## Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll paste the plan/diff inline so it's all in one place" | That's the backpack. The next agent can open the path; copying it bloats the handoff and rots when the source changes. |
| "Writing it next to the code is more convenient" | The repo is not scratch space. Temp dir only — a handoff is transient and must never be committed. |
| "The secret is needed to resume" | Reference where it lives (env var name, secret manager path), never the value. |

## Red Flags

- The document file lives anywhere under the repository or worktree
- A PRD, plan, ADR, or diff is pasted in full instead of linked
- An API key, token, password, or PII appears in the text
- No "Suggested skills" section / no [[using-groundwork]] pointer

## Verification

- [ ] Document exists at a `${TMPDIR:-/tmp}/...` path, not inside the repo or any worktree
- [ ] Summary is tailored to the next objective (and to `[focus]` when given)
- [ ] State, Next objective, Artifacts, and Suggested skills sections all present
- [ ] Artifacts are links/paths/URLs — no copied source, plan, or diff bodies
- [ ] Secrets, tokens, and PII redacted
- [ ] Suggested skills names concrete skills and points at [[using-groundwork]]
- [ ] Absolute path reported to the user
