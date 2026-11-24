# `swarm-debug`

> **Run it:** `/groundwork:swarm-debug [bug description]` · **Tier:** user-run · **Reads:** the code, logs, reproduction steps · **Writes:** a debug journal at `.debug/<slug>-xxxxxx/journal.md` in the project root (gitignored), with a `## Swarm Evidence` section; temporary diagnostic logging, removed before the fix; then the fix and its failing test

## What it does

`debug` with its isolation phase replaced by a team. Phases 1–2 (understand, reproduce) and 4–5 (fix, verify) follow `debug` exactly; in Phase 3 one teammate per hypothesis investigates in parallel, each told to prove its own hypothesis and to disprove at least one other. It writes 3–5 falsifiable hypotheses into the journal before any teammate is spawned, converges when one is verified or corroborated and the competitors are eliminated, and records every teammate's verdict and evidence in the journal's `## Swarm Evidence` section. The lead then makes the fix directly.

## When to reach for it

- The bug has several plausible explanations, or the fault could originate in any of several interacting components.
- Earlier debugging attempts anchored on a wrong theory.
- **Not when:** the bug has an obvious investigation path, or only one hypothesis is worth testing. Use `debug`.

## Common questions

**It says it needs an experimental feature.**

Yes: agent teams. Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS="1"`, or add `"experimentalAgentTeams": true` to your Claude Code settings. Without it the skill tells you, falls back to `debug` for a sequential Phase 3, and the journal notes that swarm was attempted but unavailable.

**It stopped to recommend switching to Opus (1M context).**

That is the pre-flight model recommendation, skipped only when effort is `high`, `xhigh`, or `max` and you are on Opus (1M context). Choose Continue anyway to go ahead. "Cancel — I'll switch first" prints the switching commands (`/model opus[1m]` and `/effort high`) and stops, so you can re-invoke. The question is asked once per conversation — a skill invoked by another skill skips it once it has been shown — and a non-interactive run (a batch or the runner) skips it too.

**The teammates agreed at once. Is that convergence?**

No — that is a red flag. Each teammate is required to try to disprove at least one other hypothesis, and convergence waits for teammates to actively challenge each other's findings. "No one disagreed" is not convergence.

**Are the teammates allowed to change the code?**

No. They investigate only: read files, search code, run diagnostic commands, and add temporary logging. They do not edit source or tests, and the temporary logging is removed when the team is dismissed, before the fix.

## It's working if

- The journal's `## Hypotheses` list is written as **Active**, with 3–5 hypotheses, before any teammate is spawned.
- There is one teammate per hypothesis, and each prompt carries the literal journal path, the full hypothesis list, and the order to disprove at least one other hypothesis.
- Every teammate claim cites evidence: a `file:line`, a command output, or a log entry.
- The journal's `## Swarm Evidence` section records each teammate's hypothesis, verdict, and key evidence, the findings that crossed between hypotheses, and the convergence decision with its reasoning and dissenting evidence.
- If no hypothesis gained traction, the convergence decision says "no convergence", and new hypotheses are generated from the teammate findings.
- The team is dismissed and the temporary logging is gone before the fix.
- The root cause is stated with a verification level, and a failing test is written before the fix.

**It is not working if:** the teammates agreed without trying to disprove each other, a teammate edited source, or the fix landed while temporary logging was still in place.
