# Debug Escalation

What to do when a systematic investigation has not produced a fix: the escalation report that both `debug` and `swarm-debug` use, and the legitimate outcome in which no root cause is found.

## The escalation report

Stop after three failed fix attempts (the 3-fix limit). Revert every failed fix attempt and leave the codebase clean. Then report to your human partner in this format:

```markdown
## Escalation: [Bug Description]

### Swarm Investigation Summary
(Only after a swarm: one row per teammate.)

| Teammate | Hypothesis | Verdict | Key Evidence |
|----------|-----------|---------|--------------|
| 1 | [hypothesis] | [Confirmed/Eliminated/Inconclusive] | [summary] |
| 2 | [hypothesis] | [Confirmed/Eliminated/Inconclusive] | [summary] |

### What I tried

| # | Hypothesis | Fix Attempted | Result |
|---|-----------|---------------|--------|
| 1 | [hypothesis] | [what you changed] | [what happened] |
| 2 | [hypothesis] | [what you changed] | [what happened] |
| 3 | [hypothesis] | [what you changed] | [what happened] |

### Eliminated hypotheses
- [hypothesis]: eliminated because [evidence]

### What I know
- [confirmed fact with evidence]

### Could this be architectural?
[If 3 fixes failed, consider whether the bug reflects a design problem, not just a code problem. What assumption does the current architecture make that might be wrong?]

### Recommended next step
[specific suggestion for the human partner]
```

After a swarm, include **all teammate findings**: the breadth of parallel investigation makes the escalation more valuable than a sequential one.

## When investigation finds no root cause

Sometimes systematic investigation legitimately concludes without a clear root cause — environmental issues, timing-dependent failures, external service flakiness, or bugs that disappear under observation. This is rare, but it happens.

**When you genuinely cannot identify the root cause:**

1. **Document what was investigated and eliminated.** Every hypothesis tested, every result observed. This prevents the next investigator from repeating your work.
2. **Implement appropriate handling.** Retry logic, timeouts, clearer error messages, or monitoring — not as a "fix," but as resilience for a known-unknown failure mode. Be explicit that this is mitigation, not a root cause fix.
3. **Add instrumentation for recurrence.** Logging, metrics, or alerts that will capture more data when the failure happens again. Design the instrumentation to answer the specific questions you couldn't answer this time.
4. **Record in the debug journal with status "Inconclusive."** Include what you know, what you don't, and what data would resolve it.
5. **Communicate honestly.** Tell your human partner what you investigated, what you eliminated, and that you couldn't pin it down — not a vague "it should be fine now."
