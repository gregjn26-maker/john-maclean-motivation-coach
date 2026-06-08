import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NameInput = z.object({
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().max(60).optional().default(""),
});

const AccountInput = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(60),
  last_name: z.string().trim().max(60).optional().default(""),
  company: z.string().trim().max(120).optional().default(""),
  job_title: z.string().trim().max(120).optional().default(""),
});

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name, company, job_title")
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
    if (error) { console.error("[profile] save error:", error); throw new Error("Could not save your name."); }
    return { ok: true };
  });

export const saveMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AccountInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: data.first_name,
        last_name: data.last_name ?? "",
        company: data.company ?? "",
        job_title: data.job_title ?? "",
      })
      .eq("id", userId);
    if (error) { console.error("[profile] save error:", error); throw new Error("Could not save your details."); }
    return { ok: true };
  });
