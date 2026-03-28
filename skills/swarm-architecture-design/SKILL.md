---
name: swarm-architecture-design
description: This skill should be used when designing architecture with parallel advocate agents - spawns multiple researchers to build adversarial cases for competing technology options, producing balanced trade-off analysis backed by evidence
user-invocable: false
requires: architecture
---

# Swarm Architecture Design

## Overview

Parallel adversarial research. Multiple advocate agents each build the strongest honest case for one technology option while challenging competitors. Produces balanced trade-off analysis that fights the anchoring bias of single-researcher exploration.

**Core principle:** One researcher anchors on whichever technology they explore first. Advocates who must challenge each other cannot.

This skill extends the `groundwork:architecture` workflow. Steps 1-2 and 5-6 follow that skill exactly. **Step 3 (Research) is replaced** by the swarm research phase. Step 4 (Iterate Decisions) is enhanced with aggregated adversarial findings.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high` or higher AND you are Opus (1M context).
If effort is below `high`, you MUST show the recommendation prompt — regardless of model.
If you are not Opus (1M context), you MUST show the recommendation prompt - regardless of effort level.

Otherwise → use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Do you want to switch? Adversarial prompt design and cross-decision conflict synthesis benefit from deeper reasoning.\n\nTo switch: cancel, run `/model opus[1m]` and `/effort high`, then re-invoke this skill.",
    "header": "Recommended: Opus (1M context) at high effort",
    "options": [
      { "label": "Continue" },
      { "label": "Cancel — I'll switch first" }
    ],
    "multiSelect": false
  }]
}
```

If the user selects "Cancel — I'll switch first": output the switching commands above and stop. Do not proceed with the skill.

## When to Use

Use swarm architecture instead of standard architecture when:
- Multiple viable technology options exist for 2+ decision areas
- Competing NFRs make trade-offs non-obvious
- Previous architecture attempts anchored on the first option explored
- The team wants evidence-backed comparison before choosing

Use standard architecture when:
- Most decisions are pre-constrained (existing stack, client mandate)
- Only 1-2 decision areas need exploration
- Speed matters more than exploration depth

## Workflow Overview

```
LOAD CONTEXT → IDENTIFY DECISIONS → RESEARCH SWARM → ITERATE DECISIONS → DOCUMENT → NEXT STEP
      │                │                   │                  │              │           │
      └────────────────┴───────────────────┴──────────────────┴──────────────┴───────────┘
                                           │
                                   RESEARCH JOURNAL
                              .architecture/{slug}-research.md
```

## Step 0: Resolve Project Context

**Before loading specs, ensure project context is resolved:**

1. **Check `.groundwork.yml`:** Does a monorepo config file exist at the repo root?
   - If yes → Check if `GROUNDWORK_PROJECT` is set. If not, list projects and ask the user to select one.
2. **CWD mismatch check (monorepo only):**
   - Skip if not in monorepo mode or if the project was just selected in item 1 above.
   - If CWD is the repo root → fine, proceed.
   - Check which project's path CWD falls inside (compare against all projects in `.groundwork.yml`).
   - If CWD is inside the selected project's path → fine, proceed.
   - If CWD is inside a different project's path → warn via `AskUserQuestion`:
     > "You're working from `<cwd>` (inside **[cwd-project]**), but the selected Groundwork project is **[selected-project]** (`[selected-project-path]/`). What would you like to do?"
     > - "Switch to [cwd-project]"
     > - "Stay with [selected-project]"
     If the user switches, invoke `Skill(skill="groundwork:project-selector")`.
   - If CWD doesn't match any project → proceed without warning (shared directory).
3. Proceed with the resolved project context. All `{{specs_dir}}/` paths will resolve to the correct location.

## Step 1: Load Context

Follow the `groundwork:architecture` skill's Step 1 exactly.

Read the product specs and extract non-functional requirements, feature list, EARS requirements, and implicit constraints. Summarize key architectural drivers.

**Detection:** Check for `{{specs_dir}}/product_specs.md` first (single file), then `{{specs_dir}}/product_specs/` directory. If PRD doesn't exist, prompt user to run `/product-design` first.

## Step 2: Identify Decision Areas

Follow the `groundwork:architecture` skill's Step 2 exactly.

Identify and prioritize architectural decision categories by dependency (foundational first).

## Step 3: Research Swarm

This is where swarm architecture diverges from the base skill. Instead of a single researcher per decision area, spawn parallel advocate agents that build adversarial cases.

### 3.1 — Detect Agent Availability

At the start of Step 3, check whether the Task tool is available by attempting to use it. If Task is unavailable, fall back gracefully (see Graceful Fallback section).

Also check for agent teams availability. If agent teams is not available:
> "Agent teams not enabled — running parallel research without debate round. Enable with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true` for adversarial debate between advocates."

### 3.2 — Triage Decision Areas

Not every decision needs a swarm. Classify each decision area:

| Classification | Criteria | Action |
|---------------|----------|--------|
| **Swarm** | 2+ viable options, high long-term consequence, no strong constraint forcing a choice | Spawn advocate agents |
| **Sequential** | Pre-constrained, low-impact, or single viable option | Use standard single researcher from base architecture skill |

Present the triage to the user:
> "I've identified N decision areas. I'll run parallel advocate research for [swarm-worthy areas] and standard research for [sequential areas]. Sound good?"

### 3.3 — Spawn Advocate Agents

For each swarm-worthy decision area, spawn one advocate per technology option (2-4 advocates per decision area). Each advocate is a Task using the `groundwork:researcher:researcher` agent with an advocate prompt overlay.

**Launch all advocates for a decision area in parallel.** Cap at 3 decision areas swarmed simultaneously (max ~12 agents total). If more than 3 decision areas qualify, batch them.

**Advocate prompt template:**

```
You are a technology advocate researching as part of an architecture decision swarm.

## Project Context
{Paste PRD summary, key architectural drivers, constraints from Steps 1-2}

## Decision Area
{The architectural decision being evaluated — e.g., "Database selection for multi-tenant SaaS"}

## Your Assigned Technology
{The specific technology this advocate must champion — e.g., "PostgreSQL with row-level security"}

## Competing Options
{Numbered list of ALL options being evaluated for this decision, including yours}

## PRD Requirements This Decision Must Satisfy
{Specific requirements from PRD that this decision area affects, with IDs}

## Your Mission

1. **Research your technology deeply.** Use the researcher methodology (Context7 > WebFetch > GitHub CLI > WebSearch). Gather version info, ecosystem, patterns, and pitfalls.

2. **Build the strongest honest case** for your assigned technology tied to PRD requirements. For each PRD requirement listed above, explain how your technology satisfies it. Include:
   - Specific version recommendations with rationale
   - Ecosystem packages that support the use case
   - Production deployment patterns relevant to the project
   - Cost characteristics (hosting, licensing, operational)

3. **Challenge competitors.** For each competing option, identify at least one weakness with evidence:
   - Link to GitHub issues, known limitations, or documented pitfalls
   - Scenarios where the competitor would struggle given the PRD requirements
   - Cost or operational disadvantages
   - Ecosystem gaps relevant to this project

4. **Acknowledge your own weaknesses honestly.** Where would a competing option genuinely be better? What are your technology's known pitfalls for this use case?

5. **Assess PRD fit.** Rate your technology's fit for each listed PRD requirement:
   - STRONG: Directly satisfies with mature, well-documented support
   - ADEQUATE: Satisfies with reasonable effort or workarounds
   - WEAK: Significant gaps or requires heavy customization
   - INCOMPATIBLE: Cannot satisfy this requirement

## Evidence Standards
- Cite every claim: official docs URL, GitHub issue, benchmark, or version number
- Use the researcher verification levels: verified, corroborated, unverified
- Flag anything from training data only as LOW confidence
- "I couldn't verify this" is better than speculation

## Output Format

Return your findings as JSON:

{
  "technology": "Your assigned technology name",
  "summary": "2-3 sentence executive summary of your case",
  "confidence": "high|medium|low",
  "version_recommendation": {
    "stable": "x.y.z",
    "latest": "a.b.c",
    "recommended": "version to use",
    "rationale": "why"
  },
  "case_for": [
    {
      "claim": "Specific strength",
      "evidence": "URL or citation",
      "prd_requirement": "REQ-ID it supports",
      "verification": "verified|corroborated|unverified"
    }
  ],
  "challenges_to_competitors": [
    {
      "competitor": "Technology name",
      "weakness": "Specific weakness identified",
      "evidence": "URL or citation",
      "verification": "verified|corroborated|unverified"
    }
  ],
  "own_weaknesses": [
    {
      "weakness": "Honest weakness",
      "severity": "critical|major|minor",
      "mitigation": "How to work around it, if possible",
      "competitor_advantage": "Which competitor does this better"
    }
  ],
  "prd_fit": [
    {
      "requirement_id": "REQ-ID",
      "requirement_summary": "Brief description",
      "fit": "STRONG|ADEQUATE|WEAK|INCOMPATIBLE",
      "explanation": "Why this rating"
    }
  ],
  "ecosystem": {
    "key_packages": ["list of recommended ecosystem packages"],
    "compatibility_notes": "Integration considerations"
  },
  "cost_profile": {
    "hosting": "Cost characteristics",
    "licensing": "License type and implications",
    "operational": "Maintenance and ops cost factors"
  },
  "sources": [
    {
      "url": "Full URL",
      "type": "official_docs|github|benchmark|community",
      "reliability": "high|medium|low"
    }
  ],
  "research_gaps": ["Questions that could not be answered"]
}
```

### 3.4 — Debate Round (When Agent Teams Available)

If agent teams is enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true`), run a structured debate after Phase 1 research completes:

1. Share each advocate's Phase 1 findings with all other advocates for the same decision area
2. Each advocate must challenge at least one specific claim from a competitor with new evidence
3. Each advocate can strengthen their case by addressing weaknesses identified by competitors
4. Debate concludes when each advocate has responded once (single round)

**If agent teams is not available:** Skip this step. Phase 1 results with adversarial prompting still provide substantially better research than a single researcher.

### 3.5 — Cross-Decision Conflict Scan

After each decision area's advocates report back, scan for cross-decision conflicts:

- **Ecosystem incompatibility** between options leading in different decision areas
- **Vendor lock-in cascading** across decisions (e.g., choosing AWS-specific services in multiple areas)
- **Cumulative cost/latency** exceeding budgets when individual choices are combined
- **Team skill fragmentation** — too many new technologies requiring simultaneous learning

Flag any conflicts found for user attention during Step 4.

### 3.6 — Synthesize Consolidated Research

Aggregate all advocate findings into a comparison table per decision area:

```markdown
## Research Summary: {Decision Area}

### Comparison Table
| Option | PRD Fit Score | Confidence | Key Strength | Key Weakness |
|--------|--------------|------------|--------------|--------------|
| {Tech A} | X/Y strong | high/med/low | {strength} | {weakness} |
| {Tech B} | X/Y strong | high/med/low | {strength} | {weakness} |

### Adversarial Findings
| Challenger | Target | Challenge | Evidence | Rebuttal |
|-----------|--------|-----------|----------|----------|
| {Tech A advocate} | {Tech B} | {claim} | {citation} | {if any} |

### PRD Requirement Coverage
| Requirement | {Tech A} | {Tech B} | {Tech C} |
|------------|----------|----------|----------|
| REQ-001 | STRONG | ADEQUATE | WEAK |

### Cost Comparison
| Factor | {Tech A} | {Tech B} | {Tech C} |
|--------|----------|----------|----------|
| Hosting | {est} | {est} | {est} |
| Licensing | {type} | {type} | {type} |
| Operational | {est} | {est} | {est} |

### Cross-Decision Conflicts
{Any conflicts with other decision areas, or "None detected"}

### Orchestrator Assessment
{Your recommendation with reasoning, noting where advocates agreed and where they diverged}
```

### 3.7 — Persist Research Journal

Write findings to `.architecture/{slug}-research.md`. This survives context compaction and documents the research for future reference.

```markdown
# Architecture Research: {Project/Feature Name}

**Date:** {YYYY-MM-DD}
**Status:** Complete | Partial (debate round skipped)

## Decision Areas Researched

### {Decision Area 1}
**Method:** Swarm (N advocates) | Sequential (single researcher)

{Full comparison table and synthesis from 3.6}

### {Decision Area 2}
{Same structure}

## Cross-Decision Analysis
{Conflicts, synergies, and cumulative impact assessment}

## Research Gaps
{Questions no advocate could answer — flagged for user/team investigation}

## Methodology Notes
- Agent teams debate: {enabled/skipped}
- Advocates spawned: {count}
- Decision areas swarmed: {count} of {total}
- Sequential research: {count} areas
```

## Step 4: Iterate on Each Decision

Follow the `groundwork:architecture` skill's Step 4, **enhanced** with swarm research.

For each decision point, present the synthesized comparison from Step 3.6 along with the standard 2-4 options format. The adversarial findings and PRD fit matrix replace the single-researcher pros/cons with evidence-backed analysis.

When presenting options:
- Lead with the comparison table for quick overview
- Include adversarial challenges as context (not just generic pros/cons)
- Reference specific advocate findings when making recommendations
- Flag any cross-decision conflicts that affect this choice
- Note research confidence levels and gaps

All other Step 4 behavior (exploratory questions, conflict detection, YAGNI principles, user interaction) follows the base architecture skill exactly.

## Step 5: Document Architecture

Follow the `groundwork:architecture` skill's Step 5 exactly.

Write the architecture document using the template in `references/architecture-template.md`. Include ALL decision records with discarded options and reasoning. Run the prd-architecture-checker validation.

**Additional:** In each Decision Record, add a "Research" section linking to the research journal entry for that decision area:
```markdown
**Research:** See `.architecture/{slug}-research.md` — {N} advocates evaluated {options list}
```

## Step 6: Suggest Next Step

Follow the `groundwork:architecture` skill's Step 6 exactly.

## Common Pitfalls

| Pitfall | Remedy |
|---------|--------|
| Swarming pre-constrained decisions | Triage first. Only swarm decisions with 2+ genuinely viable options. |
| Too many advocates per decision (>4) | Cap at 4. More advocates means more noise, not more signal. |
| Too few advocates (<2) | If there's only one viable option, use sequential research. |
| Advocates not challenging competitors | The adversarial mandate is explicit in the prompt. If results lack challenges, re-prompt. |
| Ignoring cross-decision conflicts | Always run the conflict scan. Individual best choices can create systemic problems. |
| Calling a winner without presenting to user | The swarm researches; the user decides. Always present the full comparison. |
| Anchoring on orchestrator recommendation | Present the recommendation as one input, not the answer. The user has context the advocates don't. |
| Skipping research journal | Always persist. The journal documents why options were considered, which is as valuable as the final choice. |
| Swarming >3 decision areas simultaneously | Batch them. Too many parallel agents degrades quality and overwhelms synthesis. |
| Treating advocate JSON as truth | Advocates are prompted to be honest but adversarial. Cross-check claims between advocates. |

## Graceful Fallback

If Task tool is unavailable or parallel spawning fails:

1. Detect the failure at the start of Step 3
2. Notify the user: "Parallel advocate research unavailable. Falling back to standard architecture skill with single researcher."
3. Invoke `Skill(skill="groundwork:architecture")` and continue with its standard Step 3
4. Note the fallback in the research journal

## Final Rule

```
Parallel advocates → Adversarial challenge → Cross-decision scan → Synthesize → User decides
Otherwise → you're just running multiple researchers who agree with themselves
```

The swarm's power is adversarial honesty, not parallel confirmation. If your advocates aren't challenging each other's technologies, you're not swarm researching.
