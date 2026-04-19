# Decision Record Examples

Real-world examples of architectural decision records.

## Example 1: Database Selection

### DR-001: Primary Database

**Status:** Accepted
**Date:** 2025-01-15
**Context:** The platform needs to store artist profiles, training jobs, model metadata, and generation history. PRD requires strict tenant isolation (PRD-FINE-REQ-001), ACID transactions for billing (PRD-MON-REQ-001), and complex queries across related entities.

**Options Considered:**

1. **Aurora DSQL**
   - Pros: Auto-scaling, pay-per-use, PostgreSQL compatible, zero management
   - Cons: Relatively new service (GA late 2024), less mature tooling

2. **Aurora Serverless v2**
   - Pros: Proven technology, fast scaling, full PostgreSQL features
   - Cons: Minimum capacity costs (~$43/month base), more expensive at low scale

3. **DynamoDB**
   - Pros: True serverless, extreme scale, low latency single-item reads
   - Cons: Poor fit for relational data model, no joins, limited query flexibility, expensive for complex access patterns

4. **RDS PostgreSQL**
   - Pros: Battle-tested, full PostgreSQL features, predictable costs
   - Cons: Fixed capacity (wasteful for variable load), manual scaling, management overhead

**Decision:** Aurora DSQL

**Rationale:** 
- Variable workload pattern (training job spikes) favors pay-per-use over fixed capacity
- Relational model with joins is natural for our entity relationships
- Row-level filtering by `artist_id` provides straightforward tenant isolation
- 20-40% cost savings vs traditional RDS at our scale
- ACID transactions critical for billing correctness per PRD-MON-REQ-001

**Consequences:**
- Must design for potential cold starts (though minimal)
- Limited PostgreSQL tuning options
- Need VPC endpoint for Lambda connection management
- Team needs to monitor a newer AWS service

---

## Example 2: Compute Strategy

### DR-002: API Compute Layer

**Status:** Accepted
**Date:** 2025-01-15
**Context:** APIs need to handle variable load with low latency (PRD NFR: p95 < 2s). Must support multiple service domains (identity, training, generation, billing).

**Options Considered:**

1. **Lambda + API Gateway**
   - Pros: Zero idle cost, auto-scaling, per-service isolation, no server management
   - Cons: Cold starts, 15-min timeout limit, stateless only

2. **ECS Fargate**
   - Pros: Container flexibility, longer-running processes, more control
   - Cons: Minimum task costs, capacity planning needed, more ops overhead

3. **EKS**
   - Pros: Full Kubernetes ecosystem, maximum flexibility, portable
   - Cons: Significant ops overhead, overkill for current scale, expensive baseline

**Decision:** Lambda + API Gateway HTTP API

**Rationale:**
- Variable load pattern (training completions, generation bursts) fits serverless perfectly
- p95 < 2s achievable with provisioned concurrency for hot paths
- Team can focus on product, not infrastructure
- Natural service isolation per Lambda function
- Cost-effective at current scale (1k artists)

**Consequences:**
- Must design for stateless execution
- Need provisioned concurrency for latency-critical paths
- 15-minute timeout constrains long-running operations (training orchestration uses Step Functions)
- Cold starts require monitoring and optimization

---

## Example 3: Frontend Framework

### DR-003: Frontend Technology

**Status:** Accepted
**Date:** 2025-01-16
**Context:** Need artist dashboard and admin console. Team has mixed frontend experience. Must integrate with Cognito for auth.

**Options Considered:**

1. **React + Vite**
   - Pros: Largest ecosystem, easy hiring, @aws-amplify/ui-react for Cognito, React Query for API state
   - Cons: More setup decisions, re-render management complexity

2. **Next.js**
   - Pros: Full-stack framework, automatic optimizations, opinionated
   - Cons: Overkill for SPA (no SSR needed for authenticated dashboards), Vercel-optimized

3. **Vue 3**
   - Pros: Gentler learning curve, smaller bundles
   - Cons: Smaller talent pool, less mature Cognito integration

4. **HTMX + Server Rendering**
   - Pros: Simple mental model, no JS build step
   - Cons: Poor fit for real-time training progress, file upload UX, interactive galleries

**Decision:** React + Vite

**Rationale:**
- Authenticated SPA doesn't need SSR (Next.js overkill)
- @aws-amplify/ui-react saves 1-2 weeks on auth flows
- React Query perfect for REST API integration
- Real-time training progress, drag-drop uploads, image galleries all natural in React
- Hiring flexibility if team scales

**Consequences:**
- Must make decisions on state management, routing (React Router v6)
- Team needs React expertise or training
- Larger bundle than Vue/Svelte (acceptable tradeoff)
