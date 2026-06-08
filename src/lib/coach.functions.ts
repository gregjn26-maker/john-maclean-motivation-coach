import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StoneStatusSchema = z.object({
  text: z.string().trim().min(1).max(200),
  worked: z.boolean(),
  amount: z.number().min(0).max(1000000).nullable().optional(),
  achieved: z.number().min(0).max(1000000).nullable().optional(),
  total: z.number().min(0).max(1000000).nullable().optional(),
});

const CheckInInput = z.object({
  goals: z.string().trim().max(4000),
  wins: z.string().trim().max(4000),
  misses: z.string().trim().max(4000),
  stone_statuses: z.array(StoneStatusSchema).max(8).default([]),
  overall_rating: z.enum(["", "hit", "partly", "missed"]).default(""),
});

const PRIMARY_MODEL = "claude-opus-4-7";
const FALLBACK_MODEL = "claude-sonnet-4-6";

interface StoneStatus { text: string; worked: boolean; amount?: number | null; achieved?: number | null; total?: number | null }

interface StoneMeta {
  text: string;
  target?: number | null;
  unit?: string;
  cadence?: string;
  metric?: "count" | "rate" | "habit";
  numerator_label?: string;
  denominator_label?: string;
}

function getMetric(s: StoneMeta): "count" | "rate" | "habit" {
  if (s.metric === "count" || s.metric === "rate" || s.metric === "habit") return s.metric;
  return typeof s.target === "number" && s.target > 0 ? "count" : "habit";
}

interface PastCheckIn {
  check_in_date: string;
  goals: string;
  wins: string;
  misses: string;
  reply: string;
  stone_statuses: StoneStatus[];
  nudged_stone: string;
}

interface BigGoalContext {
  big_goal: string;
  target_date: string | null;
  stones: StoneMeta[];
}

function normaliseText(s: string) {
  return (s || "").trim().toLowerCase();
}

function currentPeriodRange(cadence: string | undefined):
  { start: Date; end: Date; label: string } | null {
  const now = new Date();
  if (cadence === "month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      label: "this month",
    };
  }
  if (cadence === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return {
      start: new Date(now.getFullYear(), q * 3, 1),
      end: new Date(now.getFullYear(), q * 3 + 3, 1),
      label: "this quarter",
    };
  }
  if (cadence === "week") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    // Week starts Monday
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    const end = new Date(d);
    end.setDate(end.getDate() + 7);
    return { start: d, end, label: "this week" };
  }
  if (cadence === "day") {
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    const end = new Date(d); end.setDate(end.getDate() + 1);
    return { start: d, end, label: "today" };
  }
  return null;
}


/**
 * For a given stone, compute how many consecutive most-recent check-ins it
 * has gone UNTOUCHED for (worked === false or absent). Stops at the first
 * check-in where it was worked on.
 */
function untouchedStreak(stoneText: string, past: PastCheckIn[]): number {
  const key = normaliseText(stoneText);
  let streak = 0;
  for (const p of past) {
    const arr = Array.isArray(p.stone_statuses) ? p.stone_statuses : [];
    const match = arr.find((s) => normaliseText(s.text) === key);
    if (match && match.worked) break;
    streak++;
  }
  return streak;
}

function recentlyNudged(stoneText: string, past: PastCheckIn[]): boolean {
  const key = normaliseText(stoneText);
  return past.slice(0, 2).some((p) => normaliseText(p.nudged_stone) === key);
}

function buildUserMessage(
  today: { goals: string; wins: string; misses: string; stone_statuses: StoneStatus[] },
  past: PastCheckIn[],
  bigGoal: BigGoalContext | null,
  nudgeCandidate: string | null,
  firstName: string,
) {
  const nameBlock = firstName
    ? `THIS USER'S FIRST NAME: ${firstName}\nAddress them by their first name naturally — don't overuse it.\n\n---\n\n`
    : "";

  let goalBlock = "";
  if (bigGoal && (bigGoal.big_goal || (bigGoal.stones && bigGoal.stones.length > 0))) {
    goalBlock = "THIS USER'S BIG GOAL:\n";
    if (bigGoal.big_goal) goalBlock += `Big goal: ${bigGoal.big_goal}\n`;
    if (bigGoal.target_date) goalBlock += `Target date: ${bigGoal.target_date}\n`;
    if (bigGoal.stones?.length) {
      goalBlock += `Stones (measurable steps):\n`;
      bigGoal.stones.forEach((s, i) => {
        const streak = untouchedStreak(s.text, past);
        const todayMatch = today.stone_statuses.find((t) => normaliseText(t.text) === normaliseText(s.text));
        const metric = getMetric(s);
        const unit = (s.unit ?? "").trim();
        const cadence = s.cadence === "week" ? "per week" : s.cadence === "month" ? "per month" : s.cadence === "quarter" ? "per quarter" : s.cadence === "day" ? "per day" : "";

        let targetStr = "";
        if (metric === "count" && typeof s.target === "number" && s.target > 0) {
          targetStr = ` — type COUNT, target ${s.target}${unit ? " " + unit : ""}${cadence ? " " + cadence : ""}`;
        } else if (metric === "rate" && typeof s.target === "number" && s.target > 0) {
          const num = (s.numerator_label ?? "").trim();
          const den = (s.denominator_label ?? "").trim();
          const ratio = num && den ? ` (${num} / ${den})` : "";
          targetStr = ` — type RATE, target ${s.target}%${ratio}${cadence ? " " + cadence : ""}`;
        } else {
          targetStr = " — type YES/NO HABIT";
        }

        let status: string;
        if (todayMatch) {
          if (metric === "count") {
            const amt = typeof todayMatch.amount === "number" ? todayMatch.amount : (todayMatch.worked ? "(yes, no number)" : 0);
            status = `this check-in: ${amt}${unit ? " " + unit : ""}`;
          } else if (metric === "rate") {
            const ach = typeof todayMatch.achieved === "number" ? todayMatch.achieved : 0;
            const tot = typeof todayMatch.total === "number" ? todayMatch.total : 0;
            const pct = tot > 0 ? Math.round((ach / tot) * 100) : 0;
            status = `this check-in: ${ach} of ${tot} (${pct}%)`;
          } else {
            status = todayMatch.worked ? "WORKED ON since last check-in" : "did NOT work on since last check-in";
          }
        } else {
          status = "no answer this check-in";
        }

        // Period-aggregated progress for rate stones — combine across current period.
        let periodInfo = "";
        if (metric === "rate" && typeof s.target === "number" && s.target > 0) {
          const period = currentPeriodRange(s.cadence);
          let ach = 0;
          let tot = 0;
          const todayPlusPast = [
            { ...today, check_in_date: "today", reply: "", nudged_stone: "", created_at: new Date().toISOString() } as PastCheckIn & { created_at: string },
            ...past.map((p) => ({ ...p, created_at: (p as PastCheckIn & { created_at?: string }).created_at ?? p.check_in_date })),
          ];
          for (const p of todayPlusPast) {
            const ts = new Date(p.created_at);
            if (period && (ts < period.start || ts >= period.end)) continue;
            const arr = Array.isArray(p.stone_statuses) ? p.stone_statuses : [];
            const m = arr.find((x) => normaliseText(x.text) === normaliseText(s.text));
            if (!m) continue;
            if (typeof m.achieved === "number") ach += m.achieved;
            if (typeof m.total === "number") tot += m.total;
          }
          const pct = tot > 0 ? Math.round((ach / tot) * 100) : 0;
          const periodLbl = period?.label ?? "all-time";
          periodInfo = `; ${periodLbl}: ${ach} of ${tot} = ${pct}% (target ${s.target}%)`;
        }

        // Recent actuals for count stones (most recent 5 check-ins)
        let recent = "";
        if (metric === "count" && typeof s.target === "number" && s.target > 0) {
          const recentVals = past.slice(0, 5).map((p) => {
            const arr = Array.isArray(p.stone_statuses) ? p.stone_statuses : [];
            const m = arr.find((x) => normaliseText(x.text) === normaliseText(s.text));
            if (!m) return "—";
            if (typeof m.amount === "number") return String(m.amount);
            return m.worked ? "✓" : "0";
          });
          if (recentVals.length) recent = `; recent actuals: [${recentVals.join(", ")}]`;
        }

        const nudged = recentlyNudged(s.text, past) ? "  [you already nudged this step in the last 2 check-ins]" : "";
        goalBlock += `  ${i + 1}. ${s.text}${targetStr} — ${status}${periodInfo}${recent}; untouched streak: ${streak} check-in(s) in a row${nudged}\n`;
      });
    }
    goalBlock += "\n---\n\n";
  }

  let memory = "";
  if (past.length > 0) {
    memory = "Most recent check-ins (most recent first):\n\n";
    past.forEach((p, i) => {
      memory += `--- Check-in ${i + 1} (${p.check_in_date}) ---\n`;
      memory += `Their goals: ${p.goals || "(none)"}\n`;
      memory += `Their wins: ${p.wins || "(none)"}\n`;
      memory += `Their misses: ${p.misses || "(none)"}\n`;
      memory += `Your previous reply: ${p.reply || "(none)"}\n\n`;
    });
    memory += "---\n\n";
  }

  let rules =
    `ACCOUNTABILITY RULES (apply when writing the reply):\n` +
    `- Celebrate first. Lead with the wins. Respond to the misses in your real voice, with a relevant true story.\n` +
    `- A step only counts as "neglected" once it has gone UNTOUCHED for 3 check-ins in a row.\n` +
    `- If a step is neglected, nudge ONLY the single most neglected one — never list several.\n` +
    `- Do not repeat a nudge on a step you already nudged in the last 2 check-ins.\n` +
    `- The nudge is your ONE closing forward challenge, at the very end. Keep the reply tight and encouraging.\n` +
    `- On check-ins when nothing is neglected, just coach the wins/misses and end with a normal forward challenge.\n` +
    `- Do NOT assume the user's last check-in was yesterday. Say "last time" or "since we last spoke" rather than "yesterday".\n` +
    `- Do NOT pressure them to check in daily. This is their check-in, not a daily streak.\n` +
    `- Use Australian English.\n\n`;

  if (nudgeCandidate) {
    rules += `THIS CHECK-IN'S NUDGE TARGET: "${nudgeCandidate}". End your reply with one short, sharp closing challenge that points the user back to this step — one stone further than last time. Do not mention any other neglected step.\n\n`;
  } else {
    rules += `THIS CHECK-IN'S NUDGE TARGET: none. End with a normal forward challenge — do not single out any specific step as neglected.\n\n`;
  }

  return (
    nameBlock +
    goalBlock +
    memory +
    rules +
    `THIS CHECK-IN (about what's happened since they last checked in):\n\n` +
    `Their goals since last check-in:\n${today.goals || "(left blank)"}\n\n` +
    `Wins:\n${today.wins || "(left blank)"}\n\n` +
    `Misses:\n${today.misses || "(left blank)"}\n\n` +
    `Now respond as John, following the pattern in your system prompt and the accountability rules above.`
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
    console.error(`[coach] Anthropic ${opts.model} ${res.status}:`, text.slice(0, 400));
    throw new Error("Could not generate a reply. Please try again.");
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

    const { data: settingRow, error: settingErr } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "coach_system_prompt")
      .maybeSingle();
    if (settingErr) { console.error("[coach] prompt load:", settingErr); throw new Error("Could not load coach settings."); }
    const systemPrompt = settingRow?.value ?? "You are John Maclean, a motivational coach.";

    const { data: pastRows, error: pastErr } = await supabase
      .from("check_ins")
      .select("check_in_date, goals, wins, misses, reply, stone_statuses, nudged_stone")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (pastErr) { console.error("[coach] history load:", pastErr); throw new Error("Could not load check-in history."); }

    const past: PastCheckIn[] = (pastRows ?? []).map((r) => ({
      check_in_date: r.check_in_date,
      goals: r.goals,
      wins: r.wins,
      misses: r.misses,
      reply: r.reply,
      nudged_stone: r.nudged_stone ?? "",
      stone_statuses: Array.isArray(r.stone_statuses) ? (r.stone_statuses as unknown as StoneStatus[]) : [],
    }));

    const { data: goalRow, error: goalErr } = await supabase
      .from("goals")
      .select("big_goal, target_date, stones")
      .eq("user_id", userId)
      .maybeSingle();
    if (goalErr) { console.error("[coach] goal load:", goalErr); throw new Error("Could not load your goal."); }
    const bigGoal: BigGoalContext | null = goalRow
      ? {
          big_goal: goalRow.big_goal ?? "",
          target_date: goalRow.target_date ?? null,
          stones: Array.isArray(goalRow.stones) ? (goalRow.stones as unknown as StoneMeta[]) : [],
        }
      : null;

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("first_name")
      .eq("id", userId)
      .maybeSingle();
    const firstName = (profileRow?.first_name ?? "").trim();

    // Decide this check-in's nudge candidate (server-side, deterministic).
    // Neglected = untouched streak >= 3 (counting this check-in as untouched if not worked).
    const todayEntry: PastCheckIn = {
      check_in_date: "today",
      goals: data.goals,
      wins: data.wins,
      misses: data.misses,
      reply: "",
      nudged_stone: "",
      stone_statuses: data.stone_statuses,
    };
    const historyForStreak = [todayEntry, ...past];

    let nudgeCandidate: string | null = null;
    if (bigGoal?.stones?.length) {
      const scored = bigGoal.stones
        .map((s) => ({
          text: s.text,
          streak: untouchedStreak(s.text, historyForStreak),
          recentlyNudged: recentlyNudged(s.text, past),
        }))
        .filter((s) => s.streak >= 3 && !s.recentlyNudged)
        .sort((a, b) => b.streak - a.streak);
      nudgeCandidate = scored[0]?.text ?? null;
    }

    const userMessage = buildUserMessage(data, past, bigGoal, nudgeCandidate, firstName);


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
        stone_statuses: data.stone_statuses,
        nudged_stone: nudgeCandidate ?? "",
        overall_rating: data.overall_rating,
      })
      .select("id, created_at, check_in_date, goals, wins, misses, reply, overall_rating")
      .single();
    if (insertErr) { console.error("[coach] save check-in:", insertErr); throw new Error("Could not save your check-in."); }

    return { checkIn: inserted, reply };
  });
