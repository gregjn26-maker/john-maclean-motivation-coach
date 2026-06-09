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
import { Pencil, ArrowRight } from "lucide-react";
import { AppHeader } from "@/components/app-header";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Your check-in — John Maclean" },
      { name: "description", content: "Log your wins and misses, and hear from John." },
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

interface StoneMeta {
  text: string;
  target?: number | null;
  unit?: string;
  cadence?: string;
  metric?: "count" | "rate" | "habit";
  numerator_label?: string;
  denominator_label?: string;
}

function stoneMetric(s: StoneMeta): "count" | "rate" | "habit" {
  if (s.metric === "count" || s.metric === "rate" || s.metric === "habit") return s.metric;
  return typeof s.target === "number" && s.target > 0 ? "count" : "habit";
}

interface BigGoal {
  big_goal: string;
  target_date: string | null;
  stones: StoneMeta[];
}

type Rating = "" | "hit" | "partly" | "missed";

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
  const [rating, setRating] = useState<Rating>("");
  const [submitting, setSubmitting] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [submittedSummary, setSubmittedSummary] = useState<{ goals: string; wins: string; misses: string } | null>(null);
  const [history, setHistory] = useState<PastCheckIn[]>([]);
  const [checkInCount, setCheckInCount] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [bigGoal, setBigGoal] = useState<BigGoal | null>(null);
  const [goalLoaded, setGoalLoaded] = useState(false);
  const [stoneTaps, setStoneTaps] = useState<Record<string, boolean | null>>({});
  const [stoneAmounts, setStoneAmounts] = useState<Record<string, string>>({});
  const [stoneAchieved, setStoneAchieved] = useState<Record<string, string>>({});
  const [stoneTotals, setStoneTotals] = useState<Record<string, string>>({});

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
          const stones = Array.isArray(g.stones) ? (g.stones as unknown as StoneMeta[]) : [];
          setBigGoal({
            big_goal: g.big_goal ?? "",
            target_date: g.target_date ?? null,
            stones,
          });
          const initialTaps: Record<string, boolean | null> = {};
          const initialAmts: Record<string, string> = {};
          const initialAch: Record<string, string> = {};
          const initialTot: Record<string, string> = {};
          stones.forEach((s) => {
            initialTaps[s.text] = null;
            initialAmts[s.text] = "";
            initialAch[s.text] = "";
            initialTot[s.text] = "";
          });
          setStoneTaps(initialTaps);
          setStoneAmounts(initialAmts);
          setStoneAchieved(initialAch);
          setStoneTotals(initialTot);
        } else {
          navigate({ to: "/welcome" });
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
    setSubmittedSummary(null);
    try {
      type Status = { text: string; worked: boolean; amount?: number; achieved?: number; total?: number };
      const stone_statuses: Status[] = (bigGoal?.stones ?? [])
        .map((s): Status | null => {
          const metric = stoneMetric(s);
          if (metric === "count") {
            const raw = (stoneAmounts[s.text] ?? "").trim();
            if (raw === "") return null;
            const n = Number(raw);
            if (!Number.isFinite(n) || n < 0) return null;
            return { text: s.text, worked: n > 0, amount: n };
          }
          if (metric === "rate") {
            const rawA = (stoneAchieved[s.text] ?? "").trim();
            const rawT = (stoneTotals[s.text] ?? "").trim();
            if (rawA === "" && rawT === "") return null;
            const a = Number(rawA);
            const t = Number(rawT);
            if (!Number.isFinite(a) || a < 0 || !Number.isFinite(t) || t < 0) return null;
            return { text: s.text, worked: a > 0, achieved: a, total: t };
          }
          const tap = stoneTaps[s.text];
          if (tap !== true && tap !== false) return null;
          return { text: s.text, worked: tap };
        })
        .filter((x): x is Status => x !== null);
      const summary = { goals, wins, misses };
      const result = await submit({ data: { ...summary, stone_statuses, overall_rating: rating } });
      setReply(result.reply);
      setSubmittedSummary(summary);
      setGoals("");
      setWins("");
      setMisses("");
      setRating("");
      const clearedTaps: Record<string, boolean | null> = {};
      const clearedAmts: Record<string, string> = {};
      const clearedAch: Record<string, string> = {};
      const clearedTot: Record<string, string> = {};
      (bigGoal?.stones ?? []).forEach((s) => {
        clearedTaps[s.text] = null;
        clearedAmts[s.text] = "";
        clearedAch[s.text] = "";
        clearedTot[s.text] = "";
      });
      setStoneTaps(clearedTaps);
      setStoneAmounts(clearedAmts);
      setStoneAchieved(clearedAch);
      setStoneTotals(clearedTot);
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

  return (
    <main className="min-h-screen bg-brand-bg pb-24">
      <AppHeader
        rightExtra={
          <nav className="flex items-center gap-3">
            <Link to="/progress" className="text-xs text-white/80 hover:text-white">Progress</Link>
            <Link to="/goals" className="text-xs text-white/80 hover:text-white">Goals</Link>
            <Link to="/account" className="text-xs text-white/80 hover:text-white">Account</Link>
            <button onClick={signOut} className="text-xs text-white/60 hover:text-white" aria-label="Sign out">
              Sign out
            </button>
          </nav>
        }
      />

      <div className="mx-auto max-w-xl lg:max-w-6xl px-5 pt-5 space-y-5">
        {/* Greeting + count */}
        <section>
          <h1 className="text-2xl lg:text-3xl font-semibold text-brand-navy leading-tight">
            {timeGreeting(firstName)}
          </h1>
          <p className="mt-1 text-sm text-brand-muted">
            {loadingHistory ? "…" : `${checkInCount} check-in${checkInCount === 1 ? "" : "s"}`}
          </p>
        </section>

        <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-5 lg:space-y-0">
          <div className="space-y-5 lg:min-w-0">

        {/* Goal recap card */}
        {goalLoaded && bigGoal && (
          <section className="rounded-2xl bg-white border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-brand-muted font-semibold">Since your last check-in</div>
                <p className="text-base text-brand-navy font-semibold mt-1 leading-snug break-words">
                  {bigGoal.big_goal || "(goal not set)"}
                </p>
                {bigGoal.target_date && (
                  <p className="text-xs text-brand-muted mt-0.5">
                    by {new Date(bigGoal.target_date).toLocaleDateString("en-AU", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </p>
                )}
              </div>
              <Link to="/goals" className="text-brand-muted hover:text-brand-navy flex-shrink-0" aria-label="Edit goal">
                <Pencil className="h-4 w-4" />
              </Link>
            </div>
            {bigGoal.stones.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-brand-muted font-semibold">
                  Did you work on each stone?
                </div>
                {bigGoal.stones.map((s, i) => {
                  const metric = stoneMetric(s);
                  const tap = stoneTaps[s.text];
                  const cadenceLbl =
                    s.cadence === "week" ? "this week"
                    : s.cadence === "month" ? "this month"
                    : s.cadence === "quarter" ? "this quarter"
                    : "today";
                  const cadenceShort =
                    s.cadence === "week" ? "/wk"
                    : s.cadence === "month" ? "/mo"
                    : s.cadence === "quarter" ? "/qtr"
                    : "/day";
                  const unit = (s.unit ?? "").trim();
                  const achievedVal = stoneAchieved[s.text] ?? "";
                  const totalVal = stoneTotals[s.text] ?? "";
                  const a = Number(achievedVal);
                  const t = Number(totalVal);
                  const livePct =
                    metric === "rate" && Number.isFinite(a) && Number.isFinite(t) && t > 0
                      ? Math.round((a / t) * 100)
                      : null;
                  return (
                    <div key={i} className="rounded-lg bg-brand-bg p-2.5">
                      <div className="flex items-baseline justify-between gap-2 mb-2">
                        <p className="text-sm text-brand-text break-words font-medium">{s.text}</p>
                        {metric === "count" && (
                          <span className="text-[11px] text-brand-muted flex-shrink-0">
                            target {s.target}{unit ? ` ${unit}` : ""} {cadenceShort}
                          </span>
                        )}
                        {metric === "rate" && (
                          <span className="text-[11px] text-brand-muted flex-shrink-0">
                            target {s.target}% {cadenceShort}
                          </span>
                        )}
                      </div>
                      {metric === "count" && (
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-brand-muted whitespace-nowrap">
                            {unit ? `${unit.charAt(0).toUpperCase() + unit.slice(1)} ${cadenceLbl}:` : `${cadenceLbl}:`}
                          </Label>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={stoneAmounts[s.text] ?? ""}
                            onChange={(e) =>
                              setStoneAmounts((prev) => ({ ...prev, [s.text]: e.target.value }))
                            }
                            placeholder="0"
                            className="h-9 w-24 text-base bg-white"
                          />
                        </div>
                      )}
                      {metric === "rate" && (
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-brand-muted whitespace-nowrap">
                            % {cadenceLbl}:
                          </Label>
                          <div className="relative">
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={100}
                              value={achievedVal}
                              onChange={(e) =>
                                setStoneAchieved((prev) => ({ ...prev, [s.text]: e.target.value }))
                              }
                              placeholder="0"
                              className="h-9 w-24 text-base bg-white pr-7"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-brand-muted pointer-events-none">%</span>
                          </div>
                        </div>
                      )}
                      {metric === "habit" && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setTap(s.text, true)}
                            className={`flex-1 h-9 rounded-md text-xs font-medium border transition-colors ${
                              tap === true
                                ? "bg-brand-green text-white border-brand-green"
                                : "bg-white text-brand-muted border-border hover:text-brand-text"
                            }`}
                          >
                            Worked on it
                          </button>
                          <button
                            type="button"
                            onClick={() => setTap(s.text, false)}
                            className={`flex-1 h-9 rounded-md text-xs font-medium border transition-colors ${
                              tap === false
                                ? "bg-brand-red text-white border-brand-red"
                                : "bg-white text-brand-muted border-border hover:text-brand-text"
                            }`}
                          >
                            Didn't
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Check-in form */}
        <section className="rounded-2xl bg-white border border-border p-5">
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-sm text-brand-text">Since your last check-in</Label>
              <Textarea
                rows={2}
                placeholder="What have you been working towards?"
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                className="text-base resize-none border-border focus-visible:ring-brand-orange"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-brand-green">Wins</Label>
              <Textarea
                rows={3}
                placeholder="What went well? Even the small stuff."
                value={wins}
                onChange={(e) => setWins(e.target.value)}
                className="text-base resize-none border-2 border-brand-green/40 focus-visible:border-brand-green focus-visible:ring-0"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-brand-red">Misses / obstacles</Label>
              <Textarea
                rows={3}
                placeholder="What didn't land? What got in the way?"
                value={misses}
                onChange={(e) => setMisses(e.target.value)}
                className="text-base resize-none border-2 border-brand-red/40 focus-visible:border-brand-red focus-visible:ring-0"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-brand-text">How did it go overall?</Label>
              <div className="grid grid-cols-3 gap-2">
                <RatingButton label="Hit it" active={rating === "hit"} colour="green" onClick={() => setRating(rating === "hit" ? "" : "hit")} />
                <RatingButton label="Partly" active={rating === "partly"} colour="orange" onClick={() => setRating(rating === "partly" ? "" : "partly")} />
                <RatingButton label="Missed" active={rating === "missed"} colour="red" onClick={() => setRating(rating === "missed" ? "" : "missed")} />
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-12 text-base bg-brand-orange hover:bg-brand-orange/90 text-white font-semibold"
            >
              {submitting ? "John is writing back…" : (
                <span className="inline-flex items-center gap-2">Talk to John <ArrowRight className="h-4 w-4" /></span>
              )}
            </Button>
          </form>
        </section>
          </div>

          <div className="space-y-5 lg:min-w-0">
        {/* Chat-style reply */}
        {reply && submittedSummary && (
          <section className="space-y-3">
            {/* User bubble */}
            <div className="rounded-2xl bg-brand-blue p-4 text-sm text-brand-text leading-relaxed space-y-2 ml-6">
              {submittedSummary.goals && <p><span className="font-semibold">Since last:</span> {submittedSummary.goals}</p>}
              {submittedSummary.wins && <p><span className="font-semibold text-brand-green">Wins:</span> {submittedSummary.wins}</p>}
              {submittedSummary.misses && <p><span className="font-semibold text-brand-red">Misses:</span> {submittedSummary.misses}</p>}
            </div>

            {/* John card */}
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 h-10 w-10 rounded-full bg-brand-orange text-white inline-flex items-center justify-center text-sm font-bold">
                JM
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <div className="text-sm font-semibold text-brand-navy">John Maclean</div>
                  <div className="text-xs text-brand-muted">Just now · AI Coach</div>
                </div>
                <div className="mt-2 rounded-2xl bg-brand-cream border-l-4 border-brand-orange p-4">
                  <div className="text-[15px] leading-relaxed text-brand-text whitespace-pre-wrap">
                    {reply}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* History */}
        <section>
          <h3 className="text-sm font-semibold text-brand-navy mb-3 px-1">Your history</h3>
          {loadingHistory ? (
            <p className="text-sm text-brand-muted px-1">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-brand-muted px-1">No check-ins yet. Your first one is above.</p>
          ) : (
            <ul className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="rounded-2xl bg-white border border-border p-4">
                  <div className="text-xs text-brand-muted">
                    {new Date(h.created_at).toLocaleDateString("en-AU", {
                      weekday: "short", day: "numeric", month: "short",
                    })}
                  </div>
                  <HistoryLine label="Goals" value={h.goals} />
                  <HistoryLine label="Wins" value={h.wins} valueClass="text-brand-green" />
                  <HistoryLine label="Misses" value={h.misses} valueClass="text-brand-red" />
                  {h.reply && (
                    <div className="mt-3 border-t border-border pt-3">
                      <div className="text-xs font-semibold text-brand-orange mb-1">John</div>
                      <p className="text-sm text-brand-text whitespace-pre-wrap">{h.reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function RatingButton({
  label, active, colour, onClick,
}: { label: string; active: boolean; colour: "green" | "orange" | "red"; onClick: () => void }) {
  const activeMap: Record<string, string> = {
    green: "bg-brand-green text-white border-brand-green",
    orange: "bg-brand-orange text-white border-brand-orange",
    red: "bg-brand-red text-white border-brand-red",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-md text-sm font-semibold border-2 transition-colors ${
        active ? activeMap[colour] : "bg-white text-brand-text border-border hover:border-brand-muted"
      }`}
    >
      {label}
    </button>
  );
}

function HistoryLine({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="mt-2 text-sm">
      <span className="font-semibold text-brand-navy">{label}: </span>
      <span className={`whitespace-pre-wrap ${valueClass ?? "text-brand-text"}`}>{value}</span>
    </div>
  );
}
