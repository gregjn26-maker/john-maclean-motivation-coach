import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StoneSchema = z.object({
  text: z.string().trim().min(1).max(200),
});

const GoalInput = z.object({
  big_goal: z.string().trim().max(500),
  target_date: z.string().trim().max(20).nullable().optional(),
  stones: z.array(StoneSchema).min(1).max(5),
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
    if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
    return { goal: saved };
  });
