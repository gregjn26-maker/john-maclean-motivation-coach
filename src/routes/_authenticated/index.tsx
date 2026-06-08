import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { submitCheckIn } from "@/lib/coach.functions";
import { getMyGoal } from "@/lib/goals.functions";
import { getMyProfile, saveMyName } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Target, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Your check-in — John Maclean" },
      { name: "description", content: "Log your goals, wins and misses, and hear from John." },
    ],
  }),
  component: HomePage,
});

interface PastCheckIn {
  id: string;
  check_in_date: string;
  goals: string;
  wins: string;
  misses: string;
  reply: string;
  created_at: string;
}

interface BigGoal {
  big_goal: string;
  target_date: string | null;
  stones: Array<{ text: string }>;
}

function timeGreeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}.` : `${part}.`;
}

function HomePage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState<string>("");
  const [nameLoaded, setNameLoaded] = useState(false);
  const [needsName, setNeedsName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [goals, setGoals] = useState("");
  const [wins, setWins] = useState("");
  const [misses, setMisses] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [history, setHistory] = useState<PastCheckIn[]>([]);
  const [checkInCount, setCheckInCount] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [bigGoal, setBigGoal] = useState<BigGoal | null>(null);
  const [goalLoaded, setGoalLoaded] = useState(false);
  const [stoneTaps, setStoneTaps] = useState<Record<string, boolean | null>>({});

  const submit = useServerFn(submitCheckIn);
  const fetchGoal = useServerFn(getMyGoal);
  const fetchProfile = useServerFn(getMyProfile);
  const persistName = useServerFn(saveMyName);

  useEffect(() => {
    fetchProfile({})
      .then((res) => {
        const fn = (res.profile?.first_name ?? "").trim();
        setFirstName(fn);
        if (!fn) setNeedsName(true);
      })
      .catch(() => {})
      .finally(() => setNameLoaded(true));

    loadHistory();

    fetchGoal({})
      .then((res) => {
        const g = res.goal;
        if (g) {
          const stones = Array.isArray(g.stones) ? (g.stones as Array<{ text: string }>) : [];
          setBigGoal({
            big_goal: g.big_goal ?? "",
            target_date: g.target_date ?? null,
            stones,
          });
          const initial: Record<string, boolean | null> = {};
          stones.forEach((s) => { initial[s.text] = null; });
          setStoneTaps(initial);
        } else {
          let seen = false;
          try { seen = localStorage.getItem("jm_welcome_seen") === "1"; } catch {}
          navigate({ to: seen ? "/goals" : "/welcome" });
        }
      })
      .catch(() => {})
      .finally(() => setGoalLoaded(true));
  }, []);

  async function loadHistory() {
    setLoadingHistory(true);
    const { data, error, count } = await supabase
      .from("check_ins")
      .select("id, check_in_date, goals, wins, misses, reply, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(20);
    setLoadingHistory(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setHistory((data ?? []) as PastCheckIn[]);
    setCheckInCount(count ?? (data?.length ?? 0));
  }

  function setTap(text: string, worked: boolean) {
    setStoneTaps((prev) => ({ ...prev, [text]: prev[text] === worked ? null : worked }));
  }

  async function onSaveName(e: React.FormEvent) {
    e.preventDefault();
    const v = nameInput.trim();
    if (!v) return toast.error("Please enter your first name.");
    setSavingName(true);
    try {
      await persistName({ data: { first_name: v, last_name: "" } });
      setFirstName(v);
      setNeedsName(false);
      setNameInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your name.");
    } finally {
      setSavingName(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!goals.trim() && !wins.trim() && !misses.trim()) {
      toast.error("Add at least one of goals, wins or misses.");
      return;
    }
    setSubmitting(true);
    setReply(null);
    try {
      const stone_statuses = (bigGoal?.stones ?? [])
        .filter((s) => stoneTaps[s.text] === true || stoneTaps[s.text] === false)
        .map((s) => ({ text: s.text, worked: !!stoneTaps[s.text] }));
      const result = await submit({ data: { goals, wins, misses, stone_statuses } });
      setReply(result.reply);
      setGoals("");
      setWins("");
      setMisses("");
      const cleared: Record<string, boolean | null> = {};
      (bigGoal?.stones ?? []).forEach((s) => { cleared[s.text] = null; });
      setStoneTaps(cleared);
      loadHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  // First-name capture screen (blocking) before the check-in form
  if (nameLoaded && needsName) {
    return (
      <main className="min-h-screen bg-background flex items-center px-5 py-10">
        <div className="mx-auto max-w-md w-full rounded-xl border border-border bg-card p-6">
          <h1 className="text-xl font-semibold text-foreground">G'day.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            What should John call you?
          </p>
          <form onSubmit={onSaveName} className="mt-5 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">First name</Label>
              <Input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. Greg"
                className="text-base h-11"
                maxLength={60}
              />
            </div>
            <Button type="submit" disabled={savingName} className="w-full h-12 text-base">
              {savingName ? "Saving…" : "Save"}
            </Button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between px-5 py-3">
          <div>
            <h1 className="text-base font-semibold text-foreground leading-tight">John Maclean</h1>
            <p className="text-xs text-muted-foreground leading-tight">Your Coach</p>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/welcome" className="text-xs text-muted-foreground hover:text-foreground">
              About
            </Link>
            <Link to="/goals" className="text-xs text-muted-foreground hover:text-foreground">
              My goals
            </Link>
            <button
              onClick={signOut}
              className="text-xs text-muted-foreground hover:text-foreground"
              aria-label="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-5 pt-5 space-y-6">
        {goalLoaded && bigGoal && (
          <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <Target className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-primary font-semibold">Your big goal</div>
                  <p className="text-sm text-foreground font-medium mt-0.5 leading-snug break-words">
                    {bigGoal.big_goal || "(not set)"}
                  </p>
                  {bigGoal.target_date && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      by {new Date(bigGoal.target_date).toLocaleDateString("en-AU", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </p>
                  )}
                </div>
              </div>
              <Link
                to="/goals"
                className="text-muted-foreground hover:text-foreground flex-shrink-0"
                aria-label="Edit goal"
              >
                <Pencil className="h-4 w-4" />
              </Link>
            </div>
            {bigGoal.stones.length > 0 && (
              <div className="mt-4 space-y-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Since last time — did you work on each stone?
                </div>
                {bigGoal.stones.map((s, i) => {
                  const tap = stoneTaps[s.text];
                  return (
                    <div key={i} className="rounded-lg border border-border bg-background p-2.5">
                      <p className="text-sm text-foreground break-words mb-2">{s.text}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setTap(s.text, true)}
                          className={`flex-1 h-9 rounded-md text-xs font-medium border transition-colors ${
                            tap === true
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground border-border hover:text-foreground"
                          }`}
                        >
                          Worked on it
                        </button>
                        <button
                          type="button"
                          onClick={() => setTap(s.text, false)}
                          className={`flex-1 h-9 rounded-md text-xs font-medium border transition-colors ${
                            tap === false
                              ? "bg-muted text-foreground border-foreground/40"
                              : "bg-background text-muted-foreground border-border hover:text-foreground"
                          }`}
                        >
                          Didn't
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{timeGreeting(firstName)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Take a minute. How have things been since last time?
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-2xl font-bold text-primary leading-none">{checkInCount}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1">check-ins</div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <Field
              label="Since your last check-in"
              placeholder="What have you been working towards?"
              value={goals}
              onChange={setGoals}
            />
            <Field
              label="Wins"
              placeholder="What went well? Even the small stuff."
              value={wins}
              onChange={setWins}
            />
            <Field
              label="Misses"
              placeholder="What didn't land? What got in the way?"
              value={misses}
              onChange={setMisses}
            />

            <Button type="submit" disabled={submitting} className="w-full h-12 text-base">
              {submitting ? "John is writing back…" : "Send check-in"}
            </Button>
          </form>
        </section>

        {reply && (
          <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                JM
              </span>
              <div className="text-sm font-medium text-foreground">From John</div>
            </div>
            <div className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">
              {reply}
            </div>
          </section>
        )}

        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3 px-1">Your history</h3>
          {loadingHistory ? (
            <p className="text-sm text-muted-foreground px-1">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1">No check-ins yet. Your first one is above.</p>
          ) : (
            <ul className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="text-xs text-muted-foreground">
                    {new Date(h.created_at).toLocaleDateString("en-AU", {
                      weekday: "short", day: "numeric", month: "short",
                    })}
                  </div>
                  <HistoryLine label="Goals" value={h.goals} />
                  <HistoryLine label="Wins" value={h.wins} />
                  <HistoryLine label="Misses" value={h.misses} />
                  {h.reply && (
                    <div className="mt-3 border-t border-border pt-3">
                      <div className="text-xs font-medium text-primary mb-1">John</div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{h.reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, placeholder, value, onChange }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Textarea
        rows={3}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-base resize-none"
      />
    </div>
  );
}

function HistoryLine({ label, value }: { label: string; value: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="mt-2 text-sm">
      <span className="font-medium text-foreground">{label}: </span>
      <span className="text-muted-foreground whitespace-pre-wrap">{value}</span>
    </div>
  );
}
