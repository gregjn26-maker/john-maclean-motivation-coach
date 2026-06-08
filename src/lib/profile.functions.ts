import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NameInput = z.object({
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().max(60).optional().default(""),
});

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name")
      .eq("id", userId)
      .maybeSingle();
    if (error) { console.error("[profile] load error:", error); throw new Error("Could not load your profile."); }
    return { profile: data };
  });

export const saveMyName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => NameInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ first_name: data.first_name, last_name: data.last_name ?? "" })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
