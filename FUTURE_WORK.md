JOHN MACLEAN COACH APP — FUTURE WORK & DECISIONS

Saved from the build session of 13 June 2026.

================================================================

DONE & LIVE (no action needed — saved in Supabase + GitHub repo):

- Full story library merged into the coach (original 27 + book stories), de-duped.

- Primary model bumped to claude-opus-4-8 (fallback claude-sonnet-4-6).

- Check-in button reworded to "Save and get John's feedback".

- Explainer box (John's "how it works" text) added above the story on page 2;

  blue video placeholder left untouched.

- Stone data migration to the two-shape model (count_up / report_level), with a

  stones_legacy snapshot backup. Rollback if ever needed:

  UPDATE goals SET stones = stones_legacy;

- Goals + progress pages rebuilt to the new shape; rate-as-tally bug fixed.

- Target fix: the "1 coaching session per rep per month so 20" stone = target 20.

STILL OWED (your actions — not builds):

- Send Amanda and John a heads-up: a few of their stones now show a "needs setup"

  prompt (tap in to add a target/unit). Nothing lost. Amanda = the rep; John = the

  namesake. (Dormant users Angel Selikas & Emanuele Galli don't need telling.)

- Fill in targets on the 8 "needs setup" stones.

- Two goals have no owner profile (orphaned test data) — leave or delete later.

----------------------------------------------------------------

NEXT SESSION (headline): ENGAGEMENT SYSTEM = CADENCE + STREAK + NUDGES

----------------------------------------------------------------

Key insight: the streak metric and the nudges are the SAME system — both key off

"did you check in within your chosen cadence." Build them together.

Design:

1. User SETS their own check-in cadence (daily / weekly / monthly). Stored per user.

2. STREAK measures consistency against THEIR cadence — a weekly user checking in

   weekly has a perfect streak, same as a daily user daily. The bar is each

   person's own commitment (honest, not one-size).

3. Individual STONES keep carrying actual progress (the count_up / report_level

   tracking already built). Streak = consistency story; stones = performance story.

4. NUDGES fire when someone misses THEIR OWN declared cadence ("you said weekly,

   it's been two weeks"). This is the set-and-forget defence.

The headline progress number becomes the streak (e.g. "3-week streak") — REPLACING

the current misleading "50% on pace" card. (That card currently = % of stones with

recent check-ins that are hitting >=80% of expected progress; it silently ignores

untracked stones, which is why it misleads. Leave it until replaced by the streak.)

Decision to make when building: streak-break rule. Strict (one miss -> reset to 0)

vs forgiving (grace period / bends-not-snaps). Recommendation: FORGIVING — fits

John's "the setback is part of the road" ethos.

Nudge details: written in JOHN'S voice, not a system notification

("Mate, the stone doesn't move itself. Two minutes — how'd yesterday go?").

Email first (push later). Needs a SCHEDULED job (Supabase scheduled function,

wired by Lovable) — this is the one genuinely new bit of infrastructure.

Possible companion metric (optional): alongside the streak, a separate

"X of Y steps updated this week" engagement number.

----------------------------------------------------------------

NEXT SESSION (structural): MULTIPLE BIG GOALS PER USER

----------------------------------------------------------------

Currently goals.user_id is UNIQUE -> one goal per user. To allow several:

- DB: drop the UNIQUE constraint (migration; snapshot-first, like the stone one).

- Goals page: change from "edit the one goal" to list / create / switch goals.

- Progress page: show multiple goals (tabs or stacked sections).

- DESIGN DECISION (decide before building): with several goals, which goal's

  stones does the morning check-in cover, and which does John reference?

  Options: per-goal check-in / one combined check-in / a "primary goal".

Build it in its own session; stage it (schema -> goals page -> progress page ->

check-in/coaching) with read-only previews, like the stone migration.

----------------------------------------------------------------

MINOR POLISH (whenever):

----------------------------------------------------------------

- Habit-style stones currently read "0 of 1 check / BEHIND", which is harsh for a

  "did you do your weekly check" habit. Decide nicer wording.

----------------------------------------------------------------

HOW TO RESUME NEXT TIME:

----------------------------------------------------------------

A new Claude chat has NO memory of the build session and cannot read it. Paste

THIS file's contents into the new chat as the first message and say "continue from

here". The live app changes are already safe in Supabase + GitHub regardless.

================================================================
