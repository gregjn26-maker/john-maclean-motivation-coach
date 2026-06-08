import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CheckInInput = z.object({
  goals: z.string().trim().max(4000),
  wins: z.string().trim().max(4000),
  misses: z.string().trim().max(4000),
});

const PRIMARY_MODEL = "claude-opus-4-7";
const FALLBACK_MODEL = "claude-sonnet-4-6";

interface PastCheckIn {
  check_in_date: string;
  goals: string;
  wins: string;
  misses: string;
  reply: string;
}

function buildUserMessage(today: { goals: string; wins: string; misses: string }, past: PastCheckIn[]) {
  let memory = "";
  if (past.length > 0) {
    memory = "Here are this user's most recent check-ins (most recent first), so you can refer back naturally:\n\n";
    past.forEach((p, i) => {
      memory += `--- Check-in ${i + 1} (${p.check_in_date}) ---\n`;
      memory += `Their goals: ${p.goals || "(none)"}\n`;
      memory += `Their wins: ${p.wins || "(none)"}\n`;
      memory += `Their misses: ${p.misses || "(none)"}\n`;
      memory += `Your previous reply: ${p.reply || "(none)"}\n\n`;
    });
    memory += "---\n\n";
  }
  return (
    memory +
    `TODAY'S CHECK-IN (about yesterday):\n\n` +
    `Yesterday's goals:\n${today.goals || "(left blank)"}\n\n` +
    `Wins:\n${today.wins || "(left blank)"}\n\n` +
    `Misses:\n${today.misses || "(left blank)"}\n\n` +
    `Now respond as John, following the pattern in your system prompt.`
  );
}

async function callAnthropic(opts: {
  apiKey: string;
  model: string;
  system: string;
  userMessage: string;
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
      max_tokens: 800,
      system: opts.system,
      messages: [{ role: "user", content: opts.userMessage }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${opts.model} ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim();
  if (!text) throw new Error("Anthropic returned empty response");
  return text;
}

export const submitCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CheckInInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

    // Fetch system prompt
    const { data: settingRow, error: settingErr } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "coach_system_prompt")
      .maybeSingle();
    if (settingErr) throw new Error(`Failed to load coach prompt: ${settingErr.message}`);
    const systemPrompt = settingRow?.value ?? "You are John Maclean, a motivational coach.";

    // Last 5 past check-ins
    const { data: pastRows, error: pastErr } = await supabase
      .from("check_ins")
      .select("check_in_date, goals, wins, misses, reply")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);
    if (pastErr) throw new Error(`Failed to load history: ${pastErr.message}`);

    const userMessage = buildUserMessage(data, (pastRows ?? []) as PastCheckIn[]);

    let reply: string;
    try {
      reply = await callAnthropic({ apiKey, model: PRIMARY_MODEL, system: systemPrompt, userMessage });
    } catch (primaryErr) {
      console.warn("Primary model failed, falling back:", primaryErr);
      reply = await callAnthropic({ apiKey, model: FALLBACK_MODEL, system: systemPrompt, userMessage });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("check_ins")
      .insert({
        user_id: userId,
        goals: data.goals,
        wins: data.wins,
        misses: data.misses,
        reply,
      })
      .select("id, created_at, check_in_date, goals, wins, misses, reply")
      .single();
    if (insertErr) throw new Error(`Failed to save check-in: ${insertErr.message}`);

    return { checkIn: inserted, reply };
  });
