---
name: retro
description: Use when a work session has ended, especially one that went sideways - suggests improvements to the agent's environment (steering files, automated checks, coding standards, tooling, information access), most severe first, and applies only what you approve. Pass a session description to retro a session other than the current one
disable-model-invocation: true
argument-hint: "[session description, or nothing for the current session]"
---

<!-- Adapted from the "retro" skill in github.com/mattpocock/skills (MIT). -->

# Retro

After a work session — especially one that went sideways — suggest improvements to the **environment the agent operates in**, not the code it wrote. The environment is what the next session inherits; improving it compounds across every future run.

A retro never changes the environment on its own. It presents candidates, most severe first, and applies only what the user approves.

## What to read

Evidence beats memory. Read the session's **primary sources**:

1. Default: the current conversation.
2. If the user names a session or passes a handoff document, read that instead.
3. On-disk evidence of what the session did, when present:
   - Debug journals under `{{debug_dir}}/` (failed hypotheses, escalations)
   - Plans under `{{plans_dir}}/` (what was promised vs. delivered)
   - The task catalog and validation records (which gates failed and why)
   - `git log` / `git diff` of what actually landed

## Categories, in order of leverage

Work through these lenses. Each row names its trigger — the session symptom that says "look here."

| Category | Look for | Trigger |
|----------|----------|---------|
| **Automated checks** | A mistake the agent made that a deterministic check could have caught — lint rule, type constraint, test, CI gate. **Read the repo's existing check commands first**: an existing check that sits unwired or silently broken *is* the finding, not a reinvention. A repo with no guardrail at all (no pre-commit hook, no CI running lint/typecheck/test) is itself a finding. | Any agent-caused error; or no guardrail exists |
| **Coding standards** | A judgment-call rule the reviewer (human or agent) had to repeat or missed — cross-file consistency, "matches surrounding style." Write it where the reviewer reads it, not where the implementer does. | A reviewer flagged the same class of issue twice; or one slipped through |
| **Navigation** | Facts the agent hunted for — a hidden dependency, a convention only visible in one file, a doc nobody pointed at. Add a one-line pointer in `AGENTS.md`/`CLAUDE.md`; the target already exists, only the pointer is missing. | The session spent significant time finding something |
| **Steering-file bloat** | Instructions in `AGENTS.md`/`CLAUDE.md` that don't change behavior (no-ops), duplicate the environment (`package.json` scripts, config, `--help`), or belong in a check. Every always-loaded line is paid on every turn. | The steering file is large; or an instruction was ignored harmlessly |
| **Information access** | A decision that waited on information the agent couldn't reach — dev-server logs, a test database, browser access, a third-party dashboard. Tee the source somewhere readable. | A crucial fact was unavailable mid-session |
| **Tool economy** | Repeated expensive tool calls that a small script, alias, or task-runner entry would collapse. | The same multi-step lookup ran several times |
| **Skill fit** | A Groundwork skill whose flow fought the session — a step that always gets skipped, a gate that asks at the wrong moment. Shadow it with a personal skill of the same name (personal skills override plugin skills); if you maintain the plugin itself, fix the skill there. Either way, don't settle for a per-session workaround. | A skill step was routed around or ignored |

## The mechanical/judgment split

Classify every candidate before proposing it:

- **Mechanical** (fixed syntactic pattern, banned API, import shape, file-location rule) → propose a **deterministic check**: a linter rule, a pre-commit hook, a CI job — whichever the repo's existing guardrail makes cheapest. Default to building the check over writing the rule; prose that a machine could enforce is a check waiting to be written.
- **Judgment** (cross-file consistency, taste, domain fit) → propose a line in the repo's standards surface — `CLAUDE.md`/`AGENTS.md` or a referenced standards doc — where the *reviewer* reads it. Implementation agents carry the most context pressure; reviewers carry the least and impose standards best.

## Process

1. Read the evidence (above). Note every symptom worth a candidate.
2. Sort candidates by severity: what recurs, what cost the most time, what corrupted work — ahead of what merely annoyed.
3. Present them, most severe first, each as: **what happened** (with the session evidence), **the candidate change**, and **which category** it lands in. Include the "do nothing" option honestly — a session without friction needs no retro output.
4. Apply only what the user approves, one change at a time, showing each edit. Mechanical changes land as real checks (run once to prove they fire); judgment changes land as standards lines.
5. Summarize: what changed, what was deliberately left alone, and what to watch for next session.

## Red Flags — STOP

- Proposing environment changes from a session you didn't read evidence from
- Proposing a new check without running it once
- Writing a prose rule for a mechanical violation (write the check instead)
- Appending to `AGENTS.md`/`CLAUDE.md` without pruning what the addition replaces
- Editing a plugin skill in the plugin's own repository without saying so (the change ships to every project through the installer)

## Verification

- [ ] Every candidate cites session evidence
- [ ] Candidates presented most-severe-first, with an explicit "leave it alone" list
- [ ] Only approved changes applied; each shown before and after
- [ ] Mechanical changes verified to fire; judgment changes placed where reviewers read
- [ ] Steering-file edits net-shorter or justified inline
