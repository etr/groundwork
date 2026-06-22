---
name: instrument-observability
description: Instrument a change with structured logging, RED metrics, trace spans, and symptom-based alerts - use while building the change, not after an incident proves it was unobservable
---

# Instrument Observability

## Overview

Observability is added with the code that needs it, not bolted on after an outage. **Shift Left:** the cheapest time to make a change observable is while you still hold its context — what can fail, what "normal" looks like, which boundary the latency lives behind.

**Core principle:** A change you cannot observe in production is a change you cannot operate. Logs, metrics, traces, and alerts are part of "done," not a follow-up ticket.

## When to Use

- Adding or changing a service boundary, request handler, job, or external call
- Code paths that can fail partially, retry, time out, or degrade
- Any change whose health you would want to confirm during a [[staged-rollout]]

Skip only for changes with no runtime behavior (docs, pure refactors with identical I/O, config-only edits).

## Process

Apply each layer to the change.

1. **Structured logging.** Emit machine-parseable events (key-value / JSON), not interpolated prose. Attach the correlation/trace id and the dimensions you'd filter on (tenant, route, outcome). Log decisions and failures, not control flow.
2. **RED metrics.** For every request-serving surface, instrument the three:
   - **Rate** — requests per second handled
   - **Errors** — failed requests per second (and the error class)
   - **Duration** — latency distribution (histogram, so you get p50/p95/p99 — never a single mean)
3. **Trace spans.** Wrap each external boundary (DB query, RPC, queue, third-party API) in a span that propagates context. Spans turn "the request was slow" into "the request was slow *here*."
4. **Symptom-based alerts.** Alert on user-visible symptoms (error rate breached, latency SLO burning), **not** on causes (CPU high, pod restarted). Causes generate noise; symptoms generate pages worth waking for. Each alert names the symptom and points at the dashboard/runbook.

## Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll add metrics once it's in prod" | The first incident is the worst time to discover you're blind. Shift Left. |
| "The mean latency is fine" | A mean hides the p99 tail where users actually hurt. Use a histogram. |
| "There are already logs" | Unstructured logs you can't query are not observability. Structure them. |
| "I'll alert on CPU and disk" | Cause-based alerts page you for non-problems and miss real ones. Alert on symptoms. |
| "Tracing is a separate project" | One span around each boundary is minutes of work and the only thing that localizes latency. |

## Red Flags

- Latency reported as a single average instead of a distribution
- Alerts wired to CPU, memory, or restart counts rather than user-visible symptoms
- `log.info("processing " + thing)` style string interpolation instead of structured fields
- An external call (DB, API, queue) with no span around it
- "We'll add observability after launch" in the plan

## Verification

Cite concrete evidence — names and locations, not intentions:

- [ ] Structured log events added at decision/failure points, carrying the correlation id (name the events)
- [ ] Rate, Error, and Duration metrics emitted for each request surface; Duration is a histogram (name the metrics)
- [ ] A trace span wraps every external boundary the change touches (name the spans)
- [ ] At least one symptom-based alert defined against an SLO, pointing at a dashboard/runbook (name the alert)
