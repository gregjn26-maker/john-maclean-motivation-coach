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
      `You are reviewing a user's newly-saved plan for depth and specificity. This is a ONE-OFF review at goal-setting, not a check-in.\n\n` +
      `THEIR BIG GOAL: ${data.big_goal || "(not set)"}\n` +
      `TARGET DATE: ${data.target_date || "(not set)"}\n` +
      `THEIR STONES (${(data.stones ?? []).length}):\n${stoneLines || "(none)"}\n\n` +
      `Assess whether the plan has enough depth to realistically reach the big goal by the target date. Consider:\n` +
      `- Are there enough stones (a big goal usually needs many small steps)?\n` +
      `- Is each stone specific and measurable?\n` +
      `- Do they cover the different areas this goal actually needs?\n` +
      `- Are they substantial enough overall?\n\n` +
      `Reply with ONE JSON object and nothing else, in this shape:\n` +
      `{"light": true|false, "message": "..."}\n\n` +
      `- "light": true if the plan looks a bit thin and would benefit from more stones or more specificity; false if it looks solid.\n` +
      `- If light=true: "message" is a warm, direct note in YOUR voice (John Maclean). Acknowledge what's already good, gently note it looks a little light, remind them a big goal is reached one stone at a time, and name 1–3 concrete example stones or areas they could add for THIS specific goal. Keep it under 130 words. Use Australian English. Draw on your own story only where natural — don't fabricate details.\n` +
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
