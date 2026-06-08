import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, saveMyAccount } from "@/lib/profile.functions";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "My Account — John Maclean" },
      { name: "description", content: "Manage your account details and password." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const saveAccount = useServerFn(saveMyAccount);

  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [currentEmail, setCurrentEmail] = useState("");
  const [email, setEmail] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchProfile({});
        const p = res.profile;
        if (p) {
          setFirstName(p.first_name ?? "");
          setLastName(p.last_name ?? "");
          setCompany((p as any).company ?? "");
          setJobTitle((p as any).job_title ?? "");
          setCurrentEmail(p.email ?? "");
          setEmail(p.email ?? "");
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Could not load your profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) {
      toast.error("First name is required.");
      return;
    }
    setSavingDetails(true);
    try {
      await saveAccount({
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          company: company.trim(),
          job_title: jobTitle.trim(),
        },
      });
      toast.success("Details saved.");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save your details.");
    } finally {
      setSavingDetails(false);
    }
  }

  async function onSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    const next = email.trim();
    if (!next || next === currentEmail) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser(
      { email: next },
      { emailRedirectTo: `${window.location.origin}/auth` },
    );
    setSavingEmail(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Check your new email for a confirmation link.");
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword.trim()) {
      toast.error("Please enter a new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password updated.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="min-h-screen bg-brand-bg pb-24">
      <AppHeader
        back={{ to: "/" }}
        rightExtra={
          <button
            onClick={signOut}
            className="text-xs text-white/60 hover:text-white"
            aria-label="Sign out"
          >
            Sign out
          </button>
        }
      />

      <div className="mx-auto max-w-xl px-5 pt-6 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-brand-navy leading-tight">My account</h1>
          <p className="mt-1 text-sm text-brand-muted">Manage your details, email, and password.</p>
        </header>

        {loading ? (
          <p className="text-sm text-brand-muted">Loading…</p>
        ) : (
          <>
            <form
              onSubmit={onSaveDetails}
              className="space-y-4 rounded-xl border border-border bg-white p-5"
            >
              <h2 className="text-sm font-semibold text-brand-navy uppercase tracking-wide">Your details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First name</Label>
                  <Input id="first_name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={60} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last name</Label>
                  <Input id="last_name" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} placeholder="Optional" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="job_title">Job title</Label>
                  <Input id="job_title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={120} placeholder="Optional" />
                </div>
              </div>
              <Button
                type="submit"
                disabled={savingDetails}
                className="bg-brand-orange hover:bg-brand-orange/90 text-white font-semibold"
              >
                {savingDetails ? "Saving…" : "Save details"}
              </Button>
            </form>

            <form
              onSubmit={onSaveEmail}
              className="space-y-4 rounded-xl border border-border bg-white p-5"
            >
              <h2 className="text-sm font-semibold text-brand-navy uppercase tracking-wide">Email</h2>
              <p className="text-xs text-brand-muted">
                We'll send a confirmation link to your new address before it takes effect.
              </p>
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={savingEmail || email.trim() === currentEmail || !email.trim()}
                className="bg-brand-orange hover:bg-brand-orange/90 text-white font-semibold"
              >
                {savingEmail ? "Sending…" : "Update email"}
              </Button>
            </form>

            <form
              onSubmit={onChangePassword}
              className="space-y-4 rounded-xl border border-border bg-white p-5"
            >
              <h2 className="text-sm font-semibold text-brand-navy uppercase tracking-wide">Password</h2>
              <div className="space-y-2">
                <Label htmlFor="new_password">New password</Label>
                <Input
                  id="new_password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter a new password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirm new password</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={savingPassword || !newPassword || !confirmPassword}
                className="bg-brand-orange hover:bg-brand-orange/90 text-white font-semibold"
              >
                {savingPassword ? "Updating…" : "Change password"}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
