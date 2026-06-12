import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { getMyGoal } from "@/lib/goals.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/john-maclean-logo-white.png.asset.json";

type AuthMode = "signin" | "signup" | "forgot";

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
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function routeAfterAuth() {
    try {
      const res = await fetchGoal({});
      if (res.goal && (res.goal.big_goal ?? "").trim().length > 0) {
        navigate({ to: "/", replace: true });
      } else {
        navigate({ to: "/welcome", replace: true });
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
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return;
    if (mode === "signup" && !password.trim()) {
      toast.error("Please enter a password.");
      return;
    }
    setSubmitting(true);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      setSubmitting(false);
      if (error) {
        toast.error(error.message);
        return;
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      });
      setSubmitting(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      if (!data.session) {
        toast.success("Check your email to confirm your account.");
      }
    }
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

        <div className="space-y-3 rounded-xl border border-border bg-white p-6">
          <Button
            type="button"
            onClick={async () => {
              setSubmitting(true);
              const result = await lovable.auth.signInWithOAuth("google", {
                redirect_uri: window.location.origin,
              });
              if (result.redirected) return;
              setSubmitting(false);
              if (result.error) {
                toast.error(result.error.message ?? "Google sign-in failed.");
                return;
              }
              routeAfterAuth();
            }}
            disabled={submitting}
            variant="outline"
            className="w-full h-12 text-base font-medium gap-2 bg-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
            </svg>
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 py-1">
            <div className="h-px bg-border flex-1" />
            <span className="text-[11px] uppercase tracking-wide text-brand-muted">or</span>
            <div className="h-px bg-border flex-1" />
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
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
            <div className="space-y-2">
              <Label htmlFor="password" className="text-brand-text">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <Button type="submit" className="w-full h-12 text-base bg-brand-orange hover:bg-brand-orange/90 text-white font-semibold" disabled={submitting}>
              {submitting ? (mode === "signin" ? "Signing in…" : "Creating account…") : (mode === "signin" ? "Sign in" : "Create account")}
            </Button>
            <p className="text-xs text-brand-muted text-center">
              {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="text-brand-orange underline-offset-4 hover:underline font-medium"
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
