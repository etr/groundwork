# EARS Requirement Examples

Curated examples demonstrating high-quality EARS requirements across different patterns.

## Event-Driven Requirements

**Pattern:** When `<trigger>` then the system shall `<response>`

Good examples:
- When an artist uploads images then the system shall store them encrypted and scoped to that artist only.
- When a user clicks "Submit" then the system shall validate all required fields before processing.
- When payment confirmation is received then the system shall activate the subscription within 30 seconds.
- When session expires then the system shall redirect user to login page with return URL preserved.

Anti-patterns to avoid:
- ❌ "The system should handle uploads" (no trigger, vague response)
- ❌ "When user does something then system responds" (too vague)
- ❌ "When user uploads, system stores in S3 bucket" (implementation-specific)

## State-Driven Requirements

**Pattern:** While `<state>` the system shall `<behavior>`

Good examples:
- While a training job is running the system shall display progress percentage updated every 10 seconds.
- While the user is authenticated the system shall maintain session for up to 24 hours of inactivity.
- While the system is in maintenance mode the system shall return HTTP 503 with estimated recovery time.

## Unwanted Behavior (Error Handling)

**Pattern:** If `<condition>` then the system shall `<mitigation>`

Good examples:
- If ownership cannot be verified then the system shall reject the finetuning request with reason `OWNERSHIP_VERIFICATION_FAILED`.
- If payment processing fails then the system shall retry up to 3 times with exponential backoff before notifying user.
- If detectors are unavailable then the system shall default to safe mode (block suspicious prompts).
- If rate limit exceeded then the system shall return HTTP 429 with `Retry-After` header.

## Optional/Configurable Features

**Pattern:** Where `<feature enabled>` the system shall `<behavior>`

Good examples:
- Where email notifications are enabled the system shall send digest emails at user-configured frequency.
- Where two-factor authentication is enabled the system shall require OTP on each login from new device.
- Where advanced analytics is enabled the system shall track detailed generation parameters.

## Complex/Compound Requirements

**Pattern:** While `<state>`, when `<trigger>`, the system shall `<response>`

Good examples:
- While an artist has pending approval, when they submit another training job, the system shall queue the request with status `BLOCKED_PENDING_APPROVAL`.
- While quota is exhausted, when artist initiates generation, the system shall prompt for pay-as-you-go authorization.

## Requirements with Specific Thresholds

When requirements involve thresholds or limits, be explicit:

Good examples:
- When generated outputs exceed 0.85 cosine similarity with another artist's model then the system shall block download and log an impersonation event.
- When a pending training job exceeds 72 hours without admin action then the system shall auto-reject with reason `APPROVAL_TIMEOUT`.
- When impersonation attempts exceed 5 per day by same user then the system shall lock account pending admin review.

## Negative Requirements (What NOT to do)

Good examples:
- The system shall never expose one artist's model to another artist's account.
- The system shall never store raw training images after finetuning completes unless explicit consent is given.
- The system shall never process generation requests without binding them to the requesting artist's model.

## Requirements with Data/Logging

Good examples:
- When impersonation attempt detected then the system shall log event to admin dashboard with actor, timestamp, prompt, and artifact ID.
- When deletion completes then the system shall notify artist with signed confirmation including deletion timestamp and scope.

## Temporal Requirements

Good examples:
- When artist requests deletion then the system shall delete training data and derived models within ≤30 days.
- When refund eligible then the system shall reimburse within ≤14 days.
- When an artist creates a training job then the system shall notify admins within 60 seconds.

## Common Mistakes to Avoid

1. **Implementation leakage**
   - ❌ "...shall store in DynamoDB"
   - ✅ "...shall persist durably"

2. **Ambiguous quantifiers**
   - ❌ "...shall respond quickly"
   - ✅ "...shall respond within p95 < 2 seconds"

3. **Multiple behaviors in one requirement**
   - ❌ "When X then system shall A, B, and C"
   - ✅ Split into three separate requirements

4. **Missing trigger**
   - ❌ "The system shall validate inputs"
   - ✅ "When user submits form then the system shall validate inputs"

5. **Untestable language**
   - ❌ "...shall be user-friendly"
   - ✅ "...shall complete task in ≤3 clicks"
