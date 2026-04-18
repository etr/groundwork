# UX Writing Guide

## Button Labels

Never use "OK", "Submit", or "Yes/No". Use specific verb + object patterns:

| Bad | Good | Why |
|-----|------|-----|
| OK | Save changes | Says what will happen |
| Submit | Create account | Outcome-focused |
| Yes | Delete message | Confirms the action |
| Cancel | Keep editing | Clarifies what "cancel" means |
| Click here | Download PDF | Describes the destination |

**For destructive actions**, name the destruction: "Delete" not "Remove" (delete is permanent, remove implies recoverable). Show count: "Delete 5 items" not "Delete selected".

## Error Messages

Every error message must answer three questions: (1) What happened? (2) Why? (3) How to fix it?

| Situation | Template |
|-----------|----------|
| Format error | "[Field] needs to be [format]. Example: [example]" |
| Missing required | "Please enter [what's missing]" |
| Permission denied | "You don't have access to [thing]. [What to do instead]" |
| Network error | "We couldn't reach [thing]. Check your connection and [action]." |
| Server error | "Something went wrong on our end. We're looking into it. [Alternative action]" |

**Don't blame the user**: "Please enter a date in MM/DD/YYYY format" not "You entered an invalid date".

**Never use humor for errors.** Users are already frustrated. Be helpful, not cute.

## Empty States

Empty states are onboarding moments, not dead ends. Formula: (1) Acknowledge briefly, (2) Explain the value of filling it, (3) Provide a clear action.

"No projects yet. Projects help you organize related tasks. Create your first one." — not just "No items."

Three types need different treatment:
- **First-run empty**: Teach and motivate. This is an onboarding moment.
- **Filtered-empty**: "No results for [query]. Try broadening your search."
- **Error-empty**: "Couldn't load [content]. [Retry action]."

## Voice and Tone

**Voice** is the brand's personality — consistent everywhere. **Tone** adapts to the moment:

| Moment | Tone |
|--------|------|
| Success | Celebratory, brief: "Done! Your changes are live." |
| Error | Empathetic, helpful: "That didn't work. Here's what to try..." |
| Loading | Reassuring, specific: "Saving your draft..." not "Loading..." |
| Destructive confirm | Serious, clear: "Delete this project? This can't be undone." |
| Empty state | Encouraging: "Create your first project to get started." |

## Link and Alt Text

**Link text must stand alone** — screen readers often read links out of context. "View pricing plans" not "Click here".

**Alt text describes information**, not the element: "Revenue increased 40% in Q3" not "Chart". For decorative images, use `alt=""` or `aria-hidden="true"` — never skip the attribute entirely.

**Icon buttons** need `aria-label` describing the action: "Close dialog", "Open menu", "Search".

## Text Expansion

Design layouts that accommodate translation. Never design to exact English string length.

| Language | Expansion |
|----------|-----------|
| German | +30% |
| French | +20% |
| Finnish | +30-40% |
| Chinese | -30% (fewer chars, similar width) |

Keep numbers separate ("New messages: 3" not "You have 3 new messages" — word order varies by language). Use full sentences as single translation strings. Avoid abbreviations ("5 minutes ago" not "5 mins ago").

## Terminology Consistency

Pick one term and stick with it:

| Inconsistent | Consistent |
|--------------|------------|
| Delete / Remove / Trash | Delete |
| Settings / Preferences / Options | Settings |
| Sign in / Log in / Enter | Sign in |
| Create / Add / New | Create |

Build a terminology glossary and enforce it. Variety in UI labels creates confusion, not elegance.

## Redundancy

If the heading explains it, the intro paragraph is noise. If the button is clear, don't explain it again below. Say it once, say it well.

For loading states, be specific: "Saving your draft..." not "Loading...". For long waits, set expectations: "This usually takes 30 seconds."

## Voice Archetypes

Five recurring voices observed across the 59-brand survey. Pick one deliberately — the one that matches your tonal direction — and avoid drift between product surfaces.

### Technical (precise, dense with proper nouns, assumes expertise)

Canonical example: Stripe — *"Financial infrastructure to grow your revenue — from your first transaction to your billionth."* Metric-anchored, plural-noun verbs, quietly ambitious; one superlative per page backed by a customer proof quote.

**How to copy it:** Use verbs that only apply to the product's exact category (`ingest`, `settle`, `resolve`). Never use "empower" or "unlock".

### Friendly-Direct (short, second-person, no ornament)

Canonical example: Linear — lets customer testimonials carry the product pitch and keeps its own copy terse. The signature move is naming competitors directly (Cal.com: *"More elegant than Calendly, more open than SavvyCal"*) instead of dancing around them.

**How to copy it:** Second person, present tense, one clause per sentence. If it would fit in a terminal prompt, it's on-voice.

### Playful (winking, product-name-as-verb, willing to be silly)

Canonical example: PostHog — parentheticals and em-dashes as the signature ("*acts like a co-pilot for you (and your AI agents)*"). The tell is willingness to downshift the expected verb ("chatting" instead of "prompting"; "move fast" instead of "accelerate").

**How to copy it:** Parentheticals, one informal verb per sentence, willing to name the opposite (what this *isn't*).

### Aspirational (world-scale, future tense, imagery over specifics)

Canonical example: Apple — *"Amazing Mac. Surprising price."* Two-word imperatives, a period where most writers would use a comma. The copy makes identity claims, not product claims; the period is the brand.

**How to copy it:** Short. Declarative. No qualifiers. If you can imagine it on a billboard at 70 mph, it's on-voice.

### Gated / Curated (withholds information deliberately)

A recent voice for community products, application-gated tools, and luxury-adjacent surfaces. Sentences imply more than they state; product value is *not* explained on the landing page — the gate is the value proposition. Canonical example: *"Access is considered, not assumed."* Three words, no product description behind them.

**How to copy it:** Short. Intransitive verbs ("access", "consider", "assemble") instead of transactional ones ("sign up", "start trial"). Never list features. Pair the voice with a numbered cohort marker ("4/7") to signal scarcity without saying "limited".

**When the voice fails:** When the product needs mass self-serve onboarding, a gated voice reads as dysfunction rather than discipline. Reserve for offerings whose distribution is genuinely constrained.

### Minimal / Research (close-to-silent, one sentence, no sales)

Canonical example: Claude — *"Tackle any big, bold, bewildering challenge with Claude."* Three adjectives doing exact work. AI-lab surfaces generally prefer one-sentence claims and will list competitors as equals (Opencode) rather than hide them — the absence of comparison claims is itself the claim.

**How to copy it:** One sentence. If a second sentence feels necessary, delete the first.

### Cross-archetype anti-patterns

- **Don't mix archetypes on the same surface.** A technical product page with an aspirational headline reads as marketing-department override, and users can tell.
- **Quoted testimonials are how ambitious brands dodge their own voice rules** — if you need "our customer processed $4.2B", put it in their quote, not your headline. It lets you cite metrics while keeping your own copy terse.
- **Avoid the AI-trade-show voice**: "Unlock", "Empower", "Transform", "At scale", "End-to-end", "Seamless", "Cutting-edge". Most of the 59 brands have banned at least two of these from their copy.

---

**Avoid**: Jargon without explanation. Blaming users. Vague errors ("Something went wrong" alone). Varying terminology for variety. Humor for errors. Redundant copy.
