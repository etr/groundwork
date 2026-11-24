# `swarm-design-architecture`

> **Run it:** `/groundwork:swarm-design-architecture [feature-name]` · **Tier:** user-run · **Reads:** the PRD (`specs/product_specs.md` or the `specs/product_specs/` directory) · **Writes:** `specs/architecture.md` with its decision records (split into `specs/architecture/` at 500 lines or 10 decision records), a research journal under `.architecture/<slug>-xxxxxx/research.md` (gitignored), and a `.architecture/` line in `.gitignore`

## What it does

Runs the `design-architecture` workflow with its research step replaced by a swarm. For each decision area with genuinely competing options it spawns one advocate agent per technology, each building the strongest honest case for its own option and challenging the others. The research is synthesized into comparison tables and saved to a journal, and you decide each decision with that evidence in front of you.

## When to reach for it

- Two or more decision areas each have several viable technology options.
- Competing non-functional requirements make the trade-offs non-obvious.
- An earlier architecture attempt anchored on the first option it explored.
- **Not when:** most decisions are already constrained by the existing stack or a mandate, or only one or two areas need exploring. That is `design-architecture`.

## Common questions

**It said "Agent teams not enabled".**

Only the debate round is lost. The parallel advocate research still runs; what is skipped is the round where each advocate answers the others with new evidence. Agent teams are enabled with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS="1"`, and the journal records whether the debate ran.

**Only some decision areas got advocates.**

By design. It triages first and swarms only areas with two or more viable options, high long-term consequence, and no constraint forcing a choice. The rest get a single researcher from the base skill, and it shows you the split before any research starts.

**Where is the research journal?**

`.architecture/<slug>-xxxxxx/research.md` — a fresh directory per run, created before anything is written. Its literal path is returned in the final output and any handoff. It is not long-lived state: if a journal is missing, the advocates re-research that area.

**It asked me to choose instead of picking a winner.**

The swarm researches; you decide. The recommendation is one input, presented with the full comparison, because you have context the advocates do not.

## It's working if

- You saw the triage before research began: which areas get advocates, which get a single researcher.
- Advocates for one decision area were launched in parallel, two to four per area, with at most three areas swarmed at once.
- Each advocate's report has a `case_for` list with evidence and a PRD requirement ID, a `challenges_to_competitors` list, and an `own_weaknesses` list.
- Claims carry a verification level — `verified`, `corroborated`, or `unverified` — and "I couldn't verify this" where a claim could not be checked.
- Each decision area has a comparison table, an adversarial findings table, and a PRD requirement coverage table, with conflicts against other decision areas flagged.
- Every decision was presented to you, comparison table first, before it was recorded.
- The research journal exists, and each decision record links to it in a "Research" section.

**It is not working if:** the advocates agreed with one another, or a decision was recorded without its comparison being shown.
