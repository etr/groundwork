---
name: swarm-debugging
description: This skill should be used when investigating bugs using parallel hypothesis testing with agent teams - spawns multiple teammates to investigate competing theories adversarially, converging on root cause faster than sequential debugging
user-invocable: false
requires: debugging
---

# Swarm Debugging

## Overview

Parallel adversarial investigation. Multiple teammates test competing hypotheses simultaneously, actively trying to disprove each other. Converges on root cause faster by fighting anchoring bias.

**Core principle:** One investigator anchors on their first theory. A team of investigators who must disprove each other cannot.

This skill extends the `groundwork:debugging` workflow. Phases 1-2 and 4-5 follow that skill exactly. Phase 3 (ISOLATE) is replaced by parallel swarm investigation using Claude Code agent teams.

## Prerequisites

This skill requires the **agent teams** experimental feature.

**To enable:**
1. Set the environment variable: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true`
2. Or add to your Claude Code settings: `"experimentalAgentTeams": true`

**If agent teams is not available:** Fall back to the standard `groundwork:debugging` skill and run Phase 3 sequentially. Note to the user that enabling agent teams would allow parallel investigation.

## When to Use

Use swarm debugging instead of standard debugging when:
- The bug has multiple plausible explanations
- Previous debugging attempts anchored on a wrong theory
- The system has multiple interacting components where the fault could originate
- You want to explore the hypothesis space faster

Use standard debugging when:
- The bug is straightforward with an obvious investigation path
- Only one hypothesis is worth testing
- The system is simple enough that parallel investigation adds no value

## Five-Phase Workflow

```
UNDERSTAND → REPRODUCE → ISOLATE (SWARM) → FIX → VERIFY
     │            │            │               │       │
     └────────────┴────────────┴───────────────┴───────┘
                         │
                   DEBUG JOURNAL
                .debug/{slug}.md
```

## Phase 1: UNDERSTAND

Follow the `groundwork:debugging` skill's Phase 1 exactly.

Read the system. Check your assumptions. Don't touch anything yet. Trace the code path from input to failure. For multi-component systems, instrument at each boundary before forming hypotheses.

Create the debug journal at `.debug/{slug}.md` during this phase.

## Phase 2: REPRODUCE

Follow the `groundwork:debugging` skill's Phase 2 exactly.

Make it fail consistently and on demand. Create a minimal reproduction. Document reproduction steps in the debug journal.

## Phase 3: ISOLATE — The Swarm

This is where swarm debugging diverges. Instead of testing hypotheses sequentially, spawn an agent team to investigate them in parallel.

### Step 1: Generate Hypotheses

From the evidence gathered in Phases 1-2, generate **3-5 falsifiable hypotheses**. Each must be:
- **Specific**: "The timeout occurs because the connection pool is exhausted" not "it might be a timeout issue"
- **Falsifiable**: Has a concrete test that would disprove it
- **Independent**: Each hypothesis explains the bug through a different mechanism

Record all hypotheses in the debug journal under `### Swarm Hypotheses`.

**Example:**
```markdown
### Swarm Hypotheses
1. Race condition in session middleware — concurrent requests overwrite session data
2. Database connection leak — pool exhaustion causes timeouts under load
3. Cache invalidation bug — stale user record served after profile update
4. Memory leak in request parser — GC pause causes intermittent 500s
```

### Step 2: Spawn the Agent Team

Create one teammate per hypothesis. Each teammate's prompt must include:

1. **Context**: The reproduction steps and debug journal from Phases 1-2
2. **Assignment**: Their specific hypothesis to investigate
3. **All hypotheses**: The full list, so they know what others are investigating
4. **Adversarial mandate**: Explicit instructions to:
   - Try to **prove** their assigned hypothesis with direct evidence
   - Try to **disprove** at least one other teammate's hypothesis
   - Message other teammates with findings that affect their hypotheses
5. **Read-only constraint**: Investigate only — read files, search code, run diagnostic commands, add temporary logging. **Do not edit source code or tests.**
6. **Evidence standard**: Every claim must cite specific evidence (file:line, command output, log entry)

**Teammate spawn prompt template:**
```
You are investigating a bug as part of a swarm debugging team.

## Bug Context
[Paste reproduction steps and debug journal]

## Your Hypothesis (#N of M)
[The specific hypothesis assigned to this teammate]

## All Hypotheses Being Investigated
[Full numbered list]

## Your Mission
1. Gather evidence to PROVE your hypothesis (#N). Be specific: file paths, line numbers, command outputs.
2. Gather evidence to DISPROVE at least one other hypothesis. Message that teammate with your findings.
3. If another teammate messages you with evidence against your hypothesis, evaluate it honestly. If it's valid, acknowledge it.
4. When you reach a conclusion (Confirmed/Eliminated/Inconclusive), message the team lead with your verdict and all supporting evidence.

## Rules
- READ ONLY. Do not edit source files or tests. You may add temporary logging for diagnostics.
- Cite every claim: file:line, command output, or log entry.
- Be adversarial. Your job is to find truth, not to confirm your assignment.
- If your hypothesis is wrong, say so. Eliminating a hypothesis is as valuable as confirming one.
```

### Step 3: Monitor and Synthesize

While teammates investigate:
- Monitor their messages for cross-hypothesis evidence
- Track which hypotheses are accumulating evidence for/against
- Watch for convergence — multiple teammates pointing to the same root cause
- Watch for new hypotheses that emerge from investigation

### Step 4: Call Convergence

Call convergence when one of these conditions is met:
- **Strong convergence**: One hypothesis reaches "Verified" confidence — direct evidence proves it, and no contradicting evidence exists
- **Moderate convergence**: One hypothesis reaches "Corroborated" confidence — multiple independent observations support it, and competing hypotheses are eliminated
- **Divergence**: No hypothesis gains traction — all eliminated or inconclusive. This means the root cause wasn't in the initial hypothesis set. Generate new hypotheses from teammate findings and either run another swarm round or fall back to sequential investigation.

**Do NOT call convergence prematurely.** Wait for teammates to actively challenge each other's findings. Early agreement without adversarial testing is a red flag.

### Step 5: Update the Debug Journal

Record all teammate findings in the debug journal's `## Swarm Evidence` section (see journal format below). Include:
- Each teammate's hypothesis, verdict, and key evidence
- Cross-hypothesis evidence (findings that affected multiple hypotheses)
- The convergence decision and reasoning

### Step 6: Clean Up

Dismiss the agent team. Remove any temporary logging or instrumentation added by teammates.

## Phase 4: FIX

Follow the `groundwork:debugging` skill's Phase 4 exactly.

State the root cause with a verification level. Write a failing test using TDD. Make the minimal fix. The root cause was identified by the swarm — now the lead executes the fix directly.

## Phase 5: VERIFY

Follow the `groundwork:debugging` skill's Phase 5 exactly.

Run the failing test, full test suite, and original reproduction. Review the fix with fresh eyes. Check related code paths.

## Escalation Rules

Same **3-fix limit** as the debugging skill. If your third fix attempt fails, stop and escalate.

When escalating after swarm debugging, include **all teammate findings** in the escalation output — the breadth of parallel investigation makes the escalation more valuable than a sequential one.

```markdown
## Escalation: [Bug Description]

### Swarm Investigation Summary
| Teammate | Hypothesis | Verdict | Key Evidence |
|----------|-----------|---------|--------------|
| 1 | [hypothesis] | [Confirmed/Eliminated/Inconclusive] | [summary] |
| 2 | [hypothesis] | [Confirmed/Eliminated/Inconclusive] | [summary] |
| ... | ... | ... | ... |

### What I tried
| # | Hypothesis | Fix Attempted | Result |
|---|-----------|---------------|--------|
| 1 | [hypothesis] | [what you changed] | [what happened] |
| ... | ... | ... | ... |

### Eliminated hypotheses
- [hypothesis]: eliminated because [evidence from teammate N]

### What I know
- [confirmed fact with evidence]

### Could this be architectural?
[assessment]

### Recommended next step
[specific suggestion]
```

## Debug Journal — Swarm Extension

Use the same `.debug/{slug}.md` format as the debugging skill, with an additional `## Swarm Evidence` section:

```markdown
# Debug: {slug}

## Status
[Active | Swarm Investigating | Root Cause Found | Fixed | Escalated]

## Symptoms
[same as debugging skill]

## Reproduction
[same as debugging skill]

## Hypotheses
[same as debugging skill — but populated from swarm results]

## Swarm Evidence

### Team Composition
| Teammate | Assigned Hypothesis | Status |
|----------|-------------------|--------|
| 1 | [hypothesis] | [Investigating/Concluded] |
| ... | ... | ... |

### Teammate Reports

#### Teammate 1: [Hypothesis summary]
**Verdict:** [Confirmed | Eliminated | Inconclusive]
**Evidence for:**
- [evidence with file:line citations]

**Evidence against:**
- [evidence with file:line citations]

**Cross-hypothesis findings:**
- [findings that affected other hypotheses]

#### Teammate 2: [Hypothesis summary]
[same structure]

### Convergence Decision
**Converged on:** [winning hypothesis or "no convergence"]
**Reasoning:** [why this hypothesis won / why investigation was inconclusive]
**Dissenting evidence:** [any remaining contradictions to address]

## Evidence Log
[same as debugging skill]

## Root Cause
[same as debugging skill]

## Fix
[same as debugging skill]

## Resolution
[same as debugging skill]
```

## Common Pitfalls

| Pitfall | Remedy |
|---------|--------|
| Spawning teammates before reproduction | Complete Phases 1-2 first. Teammates need shared context. |
| Too many hypotheses (>5) | Prioritize. More teammates means more noise, not more signal. |
| Too few hypotheses (<3) | If there's only one plausible theory, use standard debugging. |
| Teammates not challenging each other | Re-prompt with explicit adversarial instructions. Agreement without challenge is suspect. |
| Calling convergence too early | Wait for active disproof attempts. "No one disagreed" is not convergence. |
| Teammates editing code | Enforce read-only. Code conflicts between teammates waste more time than they save. |
| Ignoring dissenting evidence | Record it. If one teammate found contradicting evidence, the root cause analysis must address it. |
| Skipping cleanup | Remove all temporary logging/instrumentation before Phase 4. |

## Graceful Fallback

If agent teams is not available (feature not enabled or not supported):

1. Detect the absence at the start of Phase 3
2. Notify the user: "Agent teams feature is not enabled. To use swarm debugging, set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true`. Falling back to sequential debugging."
3. Invoke `Skill(skill="groundwork:debugging")` and continue with its standard Phase 3 (sequential hypothesis testing)
4. The debug journal should note that swarm was attempted but unavailable

## Final Rule

```
Parallel investigation → Adversarial disproof → Convergence → Fix with failing test → Verify
Otherwise → you're just running multiple guessers in parallel
```

The swarm's power is adversarial challenge, not parallel agreement. If your teammates aren't trying to prove each other wrong, you're not swarm debugging.
