# Architecture Document Template

Use this template when creating `specs/architecture.md`.

```markdown
# System Architecture

**Version:** 0.1
**Last updated:** <today>
**Status:** Draft | Review | Approved
**Owner:** [Architect name]

---

## 1) Executive Summary

[2-3 paragraph overview of the architecture, key technology choices, and how they align with product goals]

---

## 2) Architectural Drivers

### 2.1 Business Drivers
- [From PRD vision and JTBDs]

### 2.2 Quality Attributes (from PRD NFRs)
| Attribute | Requirement | Architecture Response |
|-----------|-------------|----------------------|
| Latency | p95 < Xs | [How architecture achieves this] |
| Scalability | X concurrent users | [How architecture achieves this] |
| Security | [requirement] | [How architecture achieves this] |

### 2.3 Constraints
- [Technical constraints]
- [Team constraints]
- [Budget constraints]
- [Timeline constraints]

---

## 3) System Overview

### 3.1 High-Level Architecture Diagram

```
[ASCII diagram or description - reference external diagram file if complex]
```

### 3.2 Component Summary

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| [Name] | [What it does] | [Stack] |

---

## 4) Component Details

### 4.1 [Component Name]

**Responsibility:** [Single sentence]

**Technology:** [Specific tech choices]

**Interfaces:**
- Exposes: [APIs, events]
- Consumes: [Dependencies]

**Key Design Notes:**
- [Important implementation detail]

**Related Requirements:** PRD-XXX-REQ-NNN, PRD-XXX-REQ-NNN

---

## 5) Data Architecture

### 5.1 Data Stores

| Store | Type | Purpose | Scaling Strategy |
|-------|------|---------|------------------|
| [Name] | [SQL/NoSQL/Cache] | [What data] | [How it scales] |

### 5.2 Data Flow

[Describe how data moves through the system]

### 5.3 Multi-tenancy Strategy

[How tenant isolation is achieved - reference PRD isolation requirements]

---

## 6) Integration Architecture

### 6.1 External Integrations

| System | Protocol | Purpose | Failure Handling |
|--------|----------|---------|------------------|
| [Name] | [REST/gRPC/etc] | [Why] | [Circuit breaker, retry, etc] |

### 6.2 Internal Communication

[Sync vs async, message formats, event schema]

---

## 7) Security Architecture

### 7.1 Authentication & Authorization
[Identity provider, token strategy, RBAC/ABAC]

### 7.2 Data Protection
[Encryption at rest, in transit, key management]

### 7.3 Network Security
[VPC design, firewall rules, WAF]

---

## 8) Infrastructure & Deployment

### 8.1 Environments
| Environment | Purpose | Parity with Prod |
|-------------|---------|------------------|
| Dev | [purpose] | [differences] |
| Staging | [purpose] | [differences] |
| Production | [purpose] | - |

### 8.2 CI/CD Pipeline
[High-level deployment flow]

### 8.3 Infrastructure as Code
[Terraform/CDK/Pulumi approach]

---

## 9) Observability

### 9.1 Logging
[Strategy, retention, tools]

### 9.2 Metrics
[Key metrics, dashboards, tools]

### 9.3 Tracing
[Distributed tracing approach]

### 9.4 Alerting
[Alert strategy, on-call]

---

## 10) Cost Model

| Component | Pricing Model | Estimated Monthly Cost |
|-----------|---------------|----------------------|
| [Name] | [per-request/provisioned] | $X |
| **Total** | | **$X** |

---

## 11) Decision Records

[Include ALL decisions made during architecture design]

### DR-001: [First Decision]
[Full ADR-lite format as specified in SKILL.md]

### DR-002: [Second Decision]
[...]

---

## 12) Open Questions & Risks

| ID | Question/Risk | Impact | Mitigation | Owner |
|----|---------------|--------|------------|-------|
| AR-001 | [description] | [H/M/L] | [plan] | [who] |

---

## 13) Appendices

### A. Glossary
[Domain terms]

### B. References
- PRD: `specs/product_specs.md`
- [External docs, RFCs, etc]
```
