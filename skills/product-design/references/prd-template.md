# PRD Template

Use this template when `specs/product_specs.md` does not exist.

```markdown
# EARS-based Product Requirements

**Doc status:** Draft 0.1
**Last updated:** <today>
**Owner:** [TBD]
**Audience:** Exec, Eng, Design, Data, QA, Sec, Legal

---

## 0) How we'll write requirements (EARS cheat sheet)
- **Ubiquitous form:** "When <trigger> then the system shall <response>."
- **Optional elements:** [when/while/until/as soon as] <trigger>, [the] system shall <response> [<object>].
- **Style:** Clear, atomic, testable, technology-agnostic.

---

## 1) Product context
- **Vision:** [One-sentence product vision]
- **Target users / segments:** [Who is this for?]
- **Key JTBDs:** [Jobs to be done]
- **North-star metrics:** [How we measure success]
- **Release strategy:** [Alpha → Beta → GA plan]

---

## 2) Non‑functional & cross‑cutting requirements
- **Isolation:** [Data/tenant isolation requirements]
- **Identity:** [Authentication/authorization requirements]
- **Security:** [Encryption, access control requirements]
- **Privacy:** [Data handling, retention requirements]
- **Latency:** [Performance SLAs]
- **Scalability:** [Scale targets]
- **Auditability:** [Logging requirements]
- **Compliance:** [Regulatory requirements]

---

## 3) Feature list (living backlog)

<!-- New features are added here -->

---

## 4) Traceability
- Map each EARS requirement to subsystem owner (Eng, Sec, Data, Billing).
- Maintain traceability matrix linking PRD IDs → Jira tickets → Test cases.

---

## 5) Open questions log
<!-- Format: OQ-NNN [Question] -->
```
