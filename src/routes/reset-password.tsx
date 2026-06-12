import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/john-maclean-logo-white.png.asset.json";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset Password — John Maclean Motivation Coach" },
      { name: "description", content: "Set a new password for your account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setRecovery(true);
    } else {
      toast.error("Invalid or expired reset link.");
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || !confirm) return;
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated successfully.");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="min-h-screen bg-brand-bg flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 rounded-2xl bg-brand-navy px-6 py-8 flex items-center justify-center shadow-sm">
          <img src={logo.url} alt="John Maclean" className="h-20 w-auto object-contain" />
        </div>
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy uppercase">Reset Password</h1>
        </header>

        <div className="space-y-3 rounded-xl border border-border bg-white p-6">
          {recovery ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-brand-text">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm" className="text-brand-text">Confirm Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-12 text-base"
                />
              </div>
              <Button type="submit" className="w-full h-12 text-base bg-brand-orange hover:bg-brand-orange/90 text-white font-semibold" disabled={submitting}>
                {submitting ? "Updating…" : "Update password"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-brand-muted text-center">
              This reset link is invalid or has expired. Please request a new one.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
