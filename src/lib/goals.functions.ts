import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StoneSchema = z.object({
  text: z.string().trim().min(1).max(200),
  target: z.number().min(0).max(100000).nullable().optional(),
  unit: z.string().trim().max(40).optional().default(""),
  cadence: z.enum(["day", "week", "month", "quarter", ""]).optional().default(""),
});

const GoalInput = z.object({
  big_goal: z.string().trim().max(500),
  target_date: z.string().trim().max(20).nullable().optional(),
  stones: z.array(StoneSchema).max(1000),
});

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
    };
    const { data: saved, error } = await supabase
      .from("goals")
      .upsert(payload, { onConflict: "user_id" })
      .select("id, big_goal, target_date, stones, updated_at")
      .single();
    if (error) { console.error("[goals] save error:", error); throw new Error("Could not save your goal."); }
    return { goal: saved };
  });
