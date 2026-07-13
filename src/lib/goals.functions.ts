import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StoneSchema = z.object({
  text: z.string().trim().min(1).max(200),
  target: z.number().min(0).max(100000).nullable().optional(),
  unit: z.string().trim().max(40).optional().default(""),
  cadence: z.enum(["day", "week", "month", "quarter", ""]).optional().default(""),
  metric: z.enum(["count", "rate", "habit"]).optional(),
  numerator_label: z.string().trim().max(80).optional().default(""),
  denominator_label: z.string().trim().max(80).optional().default(""),
});

const GoalInput = z.object({
  big_goal: z.string().trim().max(500),
  target_date: z.string().trim().max(20).nullable().optional(),
  stones: z.array(StoneSchema).max(1000),
});

const ReviewInput = GoalInput;

export const getMyGoal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("goals")
      .select("id, big_goal, target_date, stones, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) { console.error("[goals] load error:", error); throw new Error("Could not load your goal."); }
    return { goal: data };
  });

export const saveMyGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GoalInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      user_id: userId,
      big_goal: data.big_goal,
      target_date: data.target_date && data.target_date.length > 0 ? data.target_date : null,
      stones: data.stones,
      // Any save counts as a material change to the plan — reset the
      // "add more stones" nudge flag so John may raise it again later
      // if the plan still looks light.
      stones_nudge_shown: false,
    };
    const { data: saved, error } = await supabase
      .from("goals")
      .upsert(payload, { onConflict: "user_id" })
      .select("id, big_goal, target_date, stones, updated_at")
      .single();
    if (error) { console.error("[goals] save error:", error); throw new Error("Could not save your goal."); }
    return { goal: saved };
  });


// -------- Feature 1: John reviews your plan (one-off depth check) --------

const PRIMARY_MODEL = "claude-opus-4-8";
const FALLBACK_MODEL = "claude-sonnet-4-6";

async function callAnthropic(opts: {
  apiKey: string; model: string; system: string; userMessage: string; maxTokens?: number;
}): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 600,
      system: opts.system,
      messages: [{ role: "user", content: opts.userMessage }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[goals review] Anthropic ${opts.model} ${res.status}:`, text.slice(0, 400));
    throw new Error("Could not generate a review.");
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim();
  if (!text) throw new Error("Anthropic returned empty response");
  return text;
}

function extractJson(raw: string): { light?: boolean; message?: string } | null {
  // Try to find a JSON object in the reply
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export const reviewMyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    // Hard cap: if the plan already has 6+ stones, skip the review entirely.
    if ((data.stones ?? []).length >= 6) {
      return { light: false, message: null };
    }

    // Fallback path shared with error branch
    const buildFallback = (): { light: boolean; message: string | null } => {
      if ((data.stones ?? []).length < 3) {
        return {
          light: true,
          message:
            "Good start on getting your goal down. But listen — I never walked out of that hospital in one leap. It was one stone further than yesterday, every single day. A big goal like this needs a lot more small stones under it than what's here. Think hard about what you actually do in a week that moves the needle — the calls, the training sessions, the conversations, the reps — and get as many of those on the list as you can. The more stones you lay down, the more chance you've got of reaching that pole.",
        };
      }
      return { light: false, message: null };
    };

    if (!apiKey) return buildFallback();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settingRow } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "coach_system_prompt")
      .maybeSingle();
    void userId;
    void supabase;
    const systemPrompt = settingRow?.value ?? "You are John Maclean, a motivational coach.";

    const stoneLines = (data.stones ?? []).map((s, i) => {
      const bits: string[] = [`${i + 1}. ${s.text}`];
      if (s.metric === "count") {
        bits.push(`type=count, target=${s.target ?? "?"}${s.unit ? " " + s.unit : ""}${s.cadence ? " per " + s.cadence : ""}`);
      } else if (s.metric === "rate") {
        bits.push(`type=rate, target=${s.target ?? "?"}%${s.cadence ? " per " + s.cadence : ""}`);
      } else {
        bits.push("type=yes/no habit");
      }
      return `  ${bits.join(" — ")}`;
    }).join("\n");

    const userMessage =
      `You are reviewing a user's newly-saved plan for depth, specificity and measurability. This is a ONE-OFF review at goal-setting, not a check-in.\n\n` +
      `THEIR BIG GOAL: ${data.big_goal || "(not set)"}\n` +
      `TARGET DATE: ${data.target_date || "(not set)"}\n` +
      `THEIR STONES (${(data.stones ?? []).length}):\n${stoneLines || "(none)"}\n\n` +
      `Assess the plan across these dimensions:\n` +
      `1. GOAL CLARITY — is the big goal specific and time-bound, or vague? (e.g. "grow the business" vs "hit $1.2M new revenue by Dec").\n` +
      `2. STONE QUALITY — is each stone measurable? Is the target realistic for the chosen cadence? Is the unit sensible? Any that are actually outcomes disguised as stones (things you can't directly do daily/weekly)?\n` +
      `3. COVERAGE — do the stones plausibly add up to the big goal, or are there obvious gaps (e.g. a sales goal with no prospecting stone; a fitness goal with only nutrition)?\n` +
      `4. BALANCE — is it all yes/no habits with no counts (hard to see progress) or all counts with no supporting habit? A mix usually holds up better.\n\n` +
      `Reply with ONE JSON object and nothing else, in this shape:\n` +
      `{"light": true|false, "message": "..."}\n\n` +
      `- "light": true if the plan would benefit from sharpening on ANY of the four dimensions above; false if it looks solid.\n` +
      `- If light=true: "message" is a warm, direct note in YOUR voice (John Maclean). Acknowledge what's already good, then name the 1–2 most useful, concrete suggestions for THIS specific goal — be specific: name a missing stone, a target to add, a unit to tighten, a stone to make measurable. Don't list everything, pick what matters most. Remind them a big goal is reached one stone at a time. Keep it under 150 words. Use Australian English. Draw on your own story only where natural — don't fabricate details.\n` +
      `- If light=false: "message" can be an empty string or one short affirming line in your voice. Do not nag.\n\n` +
      `Return the JSON object only. No preamble, no code fences.`;

    let raw: string;
    try {
      raw = await callAnthropic({ apiKey, model: PRIMARY_MODEL, system: systemPrompt, userMessage });
    } catch {
      try {
        raw = await callAnthropic({ apiKey, model: FALLBACK_MODEL, system: systemPrompt, userMessage });
      } catch {
        return buildFallback();
      }
    }

    const parsed = extractJson(raw);
    if (!parsed || typeof parsed.light !== "boolean") return buildFallback();
    const message = (parsed.message ?? "").trim();
    return { light: parsed.light, message: parsed.light ? (message || buildFallback().message) : (message || null) };
  });


// -------- Feature 3: "Help me set this goal" — John suggests a plan --------

const SuggestInput = z.object({
  intent: z.string().trim().min(1).max(2000),
  role: z.string().trim().max(500).optional().default(""),
  context: z.string().trim().max(2000).optional().default(""),
  existingBigGoal: z.string().trim().max(500).optional().default(""),
  existingStones: z.array(StoneSchema).max(1000).optional().default([]),
});

type SuggestedStone = {
  text: string;
  metric: "count" | "rate" | "habit";
  target: number | null;
  unit: string;
  cadence: "day" | "week" | "month" | "quarter" | "";
};

function extractSuggestion(raw: string): {
  suggestedBigGoal?: string;
  suggestedTargetDate?: string | null;
  suggestedStones?: SuggestedStone[];
  note?: string;
} | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export const suggestGoalPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SuggestInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        suggestedBigGoal: "",
        suggestedTargetDate: null as string | null,
        suggestedStones: [] as SuggestedStone[],
        note: "John's not available to chat right now — try again in a minute.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settingRow } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "coach_system_prompt")
      .maybeSingle();
    const systemPrompt = settingRow?.value ?? "You are John Maclean, a motivational coach.";

    const existingStonesText = data.existingStones && data.existingStones.length > 0
      ? data.existingStones.map((s, i) => `  ${i + 1}. ${s.text}${s.metric ? ` (${s.metric})` : ""}${typeof s.target === "number" ? ` target ${s.target}${s.unit ? " " + s.unit : ""}${s.cadence ? " per " + s.cadence : ""}` : ""}`).join("\n")
      : "(none)";

    const userMessage =
      `The user wants your help setting a proper goal. Coach them on GOAL-SETTING and MEASUREMENT only — nothing else.\n\n` +
      `WHAT THEY WANT TO ACHIEVE:\n${data.intent}\n\n` +
      `THEIR ROLE / CONTEXT:\n${data.role || "(not given)"}\n\n` +
      `ANYTHING ELSE THEY SAID:\n${data.context || "(none)"}\n\n` +
      `EXISTING BIG GOAL: ${data.existingBigGoal || "(none yet)"}\n` +
      `EXISTING STONES:\n${existingStonesText}\n\n` +
      `Your job: propose a clear, measurable big goal wording, and 3–5 concrete stones that would realistically get them there. For each stone, pick the right type:\n` +
      `- "count" — a number they build up over a period (calls, sessions, kg). Needs target + unit + cadence.\n` +
      `- "rate" — a percentage they report (close rate, on-time %). Needs target (%) + cadence.\n` +
      `- "habit" — a yes/no thing they either did or didn't.\n\n` +
      `Reply with ONE JSON object and nothing else, in this shape:\n` +
      `{\n` +
      `  "suggestedBigGoal": "specific, time-bound wording of the big goal",\n` +
      `  "suggestedTargetDate": "YYYY-MM-DD or null",\n` +
      `  "suggestedStones": [\n` +
      `    { "text": "short stone name", "metric": "count"|"rate"|"habit", "target": number|null, "unit": "e.g. calls", "cadence": "day"|"week"|"month"|"quarter"|"" }\n` +
      `  ],\n` +
      `  "note": "your short coaching note in your voice — 2–4 sentences, Australian English, explaining why these stones and how to measure them. If their intent is outside goal-setting (e.g. life advice, relationships, career choice), say so in one line and steer back to what you CAN help with."\n` +
      `}\n\n` +
      `Rules for the stones you propose: each one must be something they can actually do this week; targets must be realistic for the cadence; prefer a mix of one supporting habit + a couple of counts/rates over five habits. Don't invent numbers you can't justify — if you're unsure of a target, put target=null and let them fill it in.\n\n` +
      `Return the JSON object only. No preamble, no code fences.`;

    let raw: string;
    try {
      raw = await callAnthropic({ apiKey, model: PRIMARY_MODEL, system: systemPrompt, userMessage, maxTokens: 1200 });
    } catch {
      try {
        raw = await callAnthropic({ apiKey, model: FALLBACK_MODEL, system: systemPrompt, userMessage, maxTokens: 1200 });
      } catch {
        return {
          suggestedBigGoal: "",
          suggestedTargetDate: null as string | null,
          suggestedStones: [] as SuggestedStone[],
          note: "John couldn't get to this one — give it another go in a moment.",
        };
      }
    }

    const parsed = extractSuggestion(raw);
    if (!parsed) {
      return {
        suggestedBigGoal: "",
        suggestedTargetDate: null as string | null,
        suggestedStones: [] as SuggestedStone[],
        note: raw.slice(0, 1200),
      };
    }

    const stones: SuggestedStone[] = Array.isArray(parsed.suggestedStones)
      ? parsed.suggestedStones
          .filter((s) => s && typeof s.text === "string" && s.text.trim().length > 0)
          .slice(0, 8)
          .map((s) => ({
            text: String(s.text).trim().slice(0, 200),
            metric: (s.metric === "count" || s.metric === "rate" || s.metric === "habit") ? s.metric : "habit",
            target: typeof s.target === "number" && s.target > 0 ? s.target : null,
            unit: typeof s.unit === "string" ? s.unit.trim().slice(0, 40) : "",
            cadence: (s.cadence === "day" || s.cadence === "week" || s.cadence === "month" || s.cadence === "quarter") ? s.cadence : "",
          }))
      : [];

    return {
      suggestedBigGoal: typeof parsed.suggestedBigGoal === "string" ? parsed.suggestedBigGoal.trim().slice(0, 500) : "",
      suggestedTargetDate: typeof parsed.suggestedTargetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.suggestedTargetDate) ? parsed.suggestedTargetDate : null,
      suggestedStones: stones,
      note: typeof parsed.note === "string" ? parsed.note.trim().slice(0, 2000) : "",
    };
  });
