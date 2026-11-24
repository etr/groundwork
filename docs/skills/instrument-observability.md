# `instrument-observability`

> **Run it:** `/groundwork:instrument-observability` · **Tier:** user-run or model-invoked — typed by you, or dispatched by `ship` as its first step · **Reads:** the change being built · **Writes:** instrumentation inside the change: structured log events, RED metrics, trace spans, symptom-based alerts

## What it does

Instruments a change while it is being built, not after an incident: structured logs at decisions and failures, RED metrics for every request surface, a trace span around each external boundary, and alerts on user-visible symptoms. Its verification has to name things — events, metrics, spans, alerts — and say where they live. `ship` runs it first, because the rollout's monitoring window watches these signals.

## When to reach for it

- Adding or changing a service boundary, request handler, job, or external call.
- Code paths that can fail partially, retry, time out, or degrade.
- Any change whose health you will want to confirm during a `staged-rollout`.
- **Not when:** the change has no runtime behavior — docs, pure refactors with identical I/O, config-only edits. Skip it.

## Common questions

**It would not take my average-latency metric.**

A mean hides the p99 tail. Duration has to be a histogram, so you get p50, p95, and p99 — never a single mean.

**It would not alert on CPU, memory, or restarts.**

Alerts are for symptoms, not causes. Cause-based alerts page you for non-problems and miss real ones, so each alert names a user-visible symptom — error rate breached, latency SLO burning — and points at a dashboard or runbook.

**It rewrote my log lines.**

`log.info("processing " + thing)` is one of its red flags. Logs must be machine-parseable events, key-value or JSON, carrying the correlation/trace id and the dimensions you would filter on, such as tenant, route, or outcome.

**What do I get at the end?**

A verification list that cites names and locations, not intentions: the log events, the metrics, the spans, and at least one alert with the dashboard or runbook it points at.

## It's working if

- New logs are structured events with fields, carrying the correlation id — and the events are named.
- Rate, Error, and Duration metrics exist for each request surface, and Duration is a histogram — the metrics are named.
- A trace span wraps every external boundary the change touches, such as a DB query, RPC, queue, or third-party API — the spans are named.
- At least one symptom-based alert is defined against an SLO and points at a dashboard or runbook — the alert is named.
- No verification item is checked on an intention: each cites a name and a location.

**It is not working if:** latency is reported as a single average, an external call has no span around it, or the plan still says "We'll add observability after launch".
