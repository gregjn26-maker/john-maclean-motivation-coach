## What we're building

Four additive changes, all reusing the existing John context and Anthropic mechanism. Nothing else changes.

---

### 1. Reframe the first check-in field (narrower)

In `src/routes/_authenticated/index.tsx`:
- Label → *"Anything else you're doing towards this goal — or want John's take on how you're measuring it?"*
- Placeholder → *"Other efforts, or ask John about your stones, targets, or how to measure progress."*

No change to storage or how `goals` is passed into the coach.

---

### 2. Beef up `reviewMyPlan` (goals.functions.ts)

Keep the current shape (returns `{ light, message }`, gated so it doesn't fire at 6+ stones, one short reply in John's voice). Expand what John reviews:

- **Clarity of the big goal** — vague / not time-bound → suggest sharpening.
- **Stone quality** — measurable? realistic target for the cadence? sensible unit?
- **Coverage** — do the stones plausibly add up to the big goal?
- **Balance** — all habit stones with no counts/rates, or vice versa.

Implementation: extend the user message sent to Anthropic with a structured breakdown of the big goal + each stone's metric/target/cadence/unit, plus explicit review instructions. Same model, same system prompt, same gating.

---

### 3. State-aware "Help me set this goal" button on the goals page

**New server function** `suggestGoalPlan` in `src/lib/goals.functions.ts`:
- Input: `{ intent: string, role?: string, context?: string, existingBigGoal?: string, existingStones?: StoneMeta[] }`
- Uses the same John system prompt + Anthropic call.
- Returns structured JSON: `{ suggestedBigGoal: string, suggestedTargetDate: string | null, suggestedStones: StoneMeta[], note: string }`. Parse the model's JSON reply; on parse failure, return `{ note: reply }` so the user still sees John's take.

**New UI** on `src/routes/_authenticated/goals.tsx`:
- Button visibility (state-aware):
  - **No big goal + no stones** → prominent button: *"Not sure where to start? Talk it through with John"*
  - **Big goal saved but < 3 stones, OR stones average < 25 chars, OR no measurable stones** → button: *"Get John's help sharpening this"*
  - **6+ solid stones** → hidden (or a small quiet link — TBD in build)
- Button opens a modal (shadcn Dialog) with 2–3 short textareas: *what you want to achieve*, *your role / context*, *anything else*. Submit → calls `suggestGoalPlan` → shows John's note + the suggested big goal / stones with an **"Apply to my plan"** button that pre-fills the existing goal form (does NOT auto-save). User still owns what gets saved.

---

### 4. Guardrail in the coach system

Add one rule to the check-in coach's user-message rules (in `buildUserMessage`, `coach.functions.ts`): if the user's input asks about anything outside goal execution, measurement, or discipline, John gently redirects back to the goal rather than giving generic life advice. One sentence in the rules block — no code branching needed; the model handles it.

---

## Files touched

- `src/routes/_authenticated/index.tsx` — field relabel (item 1)
- `src/lib/coach.functions.ts` — one extra rule line (item 4)
- `src/lib/goals.functions.ts` — expanded `reviewMyPlan` prompt (item 2) + new `suggestGoalPlan` server fn (item 3)
- `src/routes/_authenticated/goals.tsx` — state-aware button + modal + "apply to my plan" wiring (item 3)

## Not touched

- Database schema — no migration. The suggestion flow is stateless; nothing is saved until the user hits the existing Save Goal button.
- Existing coach reply generation, stones-nudge logic, `stones_nudge_shown` flag — all preserved.
- No new AI provider, no new secrets, no new tables.

## Order of build

1. Item 1 (relabel) + Item 4 (guardrail line) — tiny, land first.
2. Item 2 (beefier `reviewMyPlan`) — pure prompt change.
3. Item 3 (new server fn + modal) — biggest surface, done last so items 1–2 are already live.

Verify after each with a quick typecheck; verify item 3 end-to-end by invoking the new server function against the preview.
