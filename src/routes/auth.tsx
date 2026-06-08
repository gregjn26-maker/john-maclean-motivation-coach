import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyGoal } from "@/lib/goals.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/john-maclean-logo-white.png.asset.json";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — John Maclean Motivation Coach" },
      { name: "description", content: "Sign in with your email to start your daily check-in." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const fetchGoal = useServerFn(getMyGoal);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function routeAfterAuth() {
    try {
      const res = await fetchGoal({});
      if (res.goal && (res.goal.big_goal ?? "").trim().length > 0) {
        navigate({ to: "/", replace: true });
      } else {
        let seen = false;
        try { seen = localStorage.getItem("jm_welcome_seen") === "1"; } catch {}
        navigate({ to: seen ? "/goals" : "/welcome", replace: true });
      }
    } catch {
      navigate({ to: "/welcome", replace: true });
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) routeAfterAuth();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) routeAfterAuth();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <main className="min-h-screen bg-brand-bg flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 rounded-2xl bg-brand-navy px-6 py-8 flex items-center justify-center shadow-sm">
          <img src={logo.url} alt="John Maclean" className="h-20 w-auto object-contain" />
        </div>
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy uppercase">How far can you go?</h1>
        </header>


        {sent ? (
          <div className="rounded-xl border border-border bg-white p-6 text-center">
            <h2 className="text-base font-semibold text-brand-navy">Check your email</h2>
            <p className="mt-2 text-sm text-brand-muted">
              We've sent a sign-in link to <span className="font-medium text-brand-text">{email}</span>.
              Open it on this device to log in.
            </p>
            <button
              onClick={() => setSent(false)}
              className="mt-4 text-sm text-brand-orange underline-offset-4 hover:underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-white p-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-brand-text">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <Button type="submit" className="w-full h-12 text-base bg-brand-orange hover:bg-brand-orange/90 text-white font-semibold" disabled={sending}>
              {sending ? "Sending link…" : "Send me a sign-in link"}
            </Button>
            <p className="text-xs text-brand-muted text-center">
              No password. We email you a one-tap sign-in link.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
