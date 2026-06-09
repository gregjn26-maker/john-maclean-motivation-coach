import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyGoal, saveMyGoal } from "@/lib/goals.functions";
import { getMyProfile, saveMyName } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Play, Plus, X } from "lucide-react";
import { AppHeader } from "@/components/app-header";

export const Route = createFileRoute("/_authenticated/goals")({
  head: () => ({
    meta: [
      { title: "My Goals — John Maclean" },
      { name: "description", content: "Set your big goal and the stones that get you there." },
    ],
  }),
  component: GoalsPage,
});

function JMAvatar() {
  return (
    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-[#0A2540] inline-flex items-center justify-center text-white font-bold text-sm">
      JM
    </div>
  );
}

type Cadence = "day" | "week" | "month" | "quarter";
type Metric = "count" | "rate" | "habit";

type StoneForm = {
  text: string;
  metric: Metric;
  target: string;
  unit: string;
  cadence: Cadence;
  numerator_label: string;
  denominator_label: string;
};

function emptyStone(): StoneForm {
  return {
    text: "",
    metric: "habit",
    target: "",
    unit: "",
    cadence: "day",
    numerator_label: "",
    denominator_label: "",
  };
}

function GoalsPage() {
  const navigate = useNavigate();
  const fetchGoal = useServerFn(getMyGoal);
  const save = useServerFn(saveMyGoal);
  const fetchProfile = useServerFn(getMyProfile);
  const persistName = useServerFn(saveMyName);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bigGoal, setBigGoal] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [stones, setStones] = useState<StoneForm[]>([emptyStone()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchGoal({}).then((res) => {
        if (res.goal) {
          setBigGoal(res.goal.big_goal ?? "");
          setTargetDate(res.goal.target_date ?? "");
          const s = Array.isArray(res.goal.stones)
            ? (res.goal.stones as Array<{
                text: string;
                target?: number | null;
                unit?: string;
                cadence?: string;
                metric?: string;
                numerator_label?: string;
                denominator_label?: string;
              }>)
            : [];
          setStones(
            s.length
              ? s.map((x) => {
                  const hasTarget = typeof x.target === "number" && x.target > 0;
                  const cadence: Cadence =
                    x.cadence === "week" ? "week"
                    : x.cadence === "month" ? "month"
                    : x.cadence === "quarter" ? "quarter"
                    : "day";
                  const metric: Metric =
                    x.metric === "count" || x.metric === "rate" || x.metric === "habit"
                      ? x.metric
                      : (hasTarget ? "count" : "habit");
                  return {
                    text: x.text ?? "",
                    metric,
                    target: hasTarget ? String(x.target) : "",
                    unit: x.unit ?? "",
                    cadence,
                    numerator_label: x.numerator_label ?? "",
                    denominator_label: x.denominator_label ?? "",
                  } satisfies StoneForm;
                })
              : [emptyStone()],
          );
        }
      }),
      fetchProfile({}).then((res) => {
        setFirstName(res.profile?.first_name ?? "");
        setLastName(res.profile?.last_name ?? "");
      }),
    ])
      .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load your details."))
      .finally(() => setLoading(false));
  }, [fetchGoal, fetchProfile]);

  function updateStone(i: number, patch: Partial<StoneForm>) {
    setStones((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addStone() {
    setStones((prev) => [...prev, emptyStone()]);
  }
  function removeStone(i: number) {
    setStones((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    type CleanedStone = {
      text: string;
      target: number | null;
      unit: string;
      cadence: Cadence | "";
      metric: Metric;
      numerator_label: string;
      denominator_label: string;
    };
    const cleanedStones: CleanedStone[] = stones
      .map((s): CleanedStone | null => {
        const text = s.text.trim();
        if (!text) return null;
        if (s.metric === "count") {
          const n = Number(s.target);
          const hasTarget = Number.isFinite(n) && n > 0;
          return {
            text,
            metric: "count",
            target: hasTarget ? n : null,
            unit: s.unit.trim().slice(0, 40),
            cadence: hasTarget ? s.cadence : "",
            numerator_label: "",
            denominator_label: "",
          };
        }
        if (s.metric === "rate") {
          const n = Number(s.target);
          const hasTarget = Number.isFinite(n) && n > 0 && n <= 100;
          return {
            text,
            metric: "rate",
            target: hasTarget ? n : null,
            unit: "",
            cadence: s.cadence,
            numerator_label: s.numerator_label.trim().slice(0, 80),
            denominator_label: s.denominator_label.trim().slice(0, 80),
          };
        }
        return {
          text,
          metric: "habit",
          target: null,
          unit: "",
          cadence: "",
          numerator_label: "",
          denominator_label: "",
        };
      })
      .filter((x): x is CleanedStone => x !== null);
    if (!firstName.trim()) return toast.error("Please add your first name before saving.", { duration: 6000 });
    setSaving(true);
    try {
      await persistName({ data: { first_name: firstName.trim(), last_name: lastName.trim() } });
      await save({
        data: {
          big_goal: bigGoal.trim(),
          target_date: targetDate || null,
          stones: cleanedStones,
        },
      });
      toast.success("Saved.");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-brand-bg pb-24">
      <AppHeader back={{ to: "/" }} />

      {/* Coloured page banner */}
      <section className="px-5 py-6 sm:py-8" style={{ backgroundColor: "#0A2540" }}>
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#F4B400" }} />
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "#F4B400" }}>
              My Goals
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white leading-tight">
            Your big goal &amp; the stones that get you there
          </h1>
          <p className="text-sm text-white/70 mt-1">
            Edit any time — your check-ins are built around this.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-5 pt-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6 text-left">

            {/* Coaching intro */}
            <section className="rounded-xl p-5 space-y-3 shadow-sm" style={{ backgroundColor: "#FFF4E8", borderLeft: "4px solid #F4B400" }}>
              <div className="flex items-start gap-3">
                <JMAvatar />
                <div className="space-y-2 text-sm text-coach-panel-foreground leading-relaxed">
                  <p>
                    Here's something I learned the hard way. When I was learning to walk again, my neighbour Mr Brown would come out each afternoon and ask, "What's our goal today?" The goal was a power pole up the street — and I couldn't reach it. So we'd put a stone down where I got to that day, and the next day move it a little further. Slowly that stone walked its way up to the pole. That's how every big goal actually gets done — not in one leap, but one stone further than yesterday.
                  </p>
                  <p>
                    So set your big goal — that's your pole. Then break it into as many small, achievable stones as you can: the daily and weekly wins you can actually tick off. Hit enough of them, and one day you'll look up and the pole will be right there. Where's your pole — and where will you put your first stone today?
                  </p>
                </div>
              </div>
            </section>

            {/* <<-- REPLACE WITH JOHN'S PERSONAL VIMEO LINK WHEN READY -->> */}
            <section className="rounded-xl p-5 space-y-3 shadow-sm" style={{ backgroundColor: "#0A2540" }}>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 h-10 w-10 rounded-full bg-white/10 inline-flex items-center justify-center text-white">
                  <Play className="h-5 w-5 fill-white" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white leading-relaxed">
                    A personal message from John — coming soon.
                  </p>
                  <p className="text-xs text-white/70 leading-relaxed">
                    John will talk you through turning your big goal into stones you can actually move.
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
              <div className="border-l-4 pl-3" style={{ borderColor: "#F4B400" }}>
                <h2 className="text-base font-semibold text-brand-navy">Your name</h2>
                <p className="text-xs text-brand-muted mt-0.5">What should John call you?</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">First name</Label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Greg"
                    className="text-base h-11"
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Last name <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder=""
                    className="text-base h-11"
                    maxLength={60}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
              <div className="border-l-4 pl-3" style={{ borderColor: "#FF6B35" }}>
                <h2 className="text-base font-semibold text-brand-navy">Your big goal</h2>
                <p className="text-xs text-brand-muted mt-0.5">The pole up the street — what are you aiming at?</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Your big goal / dream</Label>
                <Textarea
                  rows={2}
                  value={bigGoal}
                  onChange={(e) => setBigGoal(e.target.value)}
                  placeholder="e.g. Hit $1.2M in new business this quarter"
                  className="text-base resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Target date (optional)</Label>
                <Input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="text-base h-11"
                />
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
              <div className="border-l-4 pl-3" style={{ borderColor: "#F4B400" }}>
                <h2 className="text-base font-semibold text-brand-navy">Your stones</h2>
                <p className="text-xs text-brand-muted mt-0.5">
                  Small, measurable steps that get you there — add as many as you need. e.g. "20 calls a day", "5 meetings a week".
                </p>
              </div>
              <div className="space-y-4">
                {stones.map((s, i) => (
                  <div key={i} className="rounded-lg border border-border bg-brand-bg p-3 space-y-3">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1">
                        <Input
                          value={s.text}
                          onChange={(e) => updateStone(i, { text: e.target.value })}
                          placeholder={`Stone ${i + 1} (e.g. Calls, Meetings)`}
                          className="text-base h-11 bg-white"
                        />
                      </div>
                      {stones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeStone(i)}
                          className="h-11 w-11 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                          aria-label="Remove stone"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => updateStone(i, { metric: "habit" })}
                        className={`h-9 rounded-md text-xs font-medium border transition-colors ${
                          s.metric === "habit"
                            ? "bg-brand-navy text-white border-brand-navy"
                            : "bg-white text-brand-muted border-border hover:text-brand-text"
                        }`}
                      >
                        Yes/no habit
                      </button>
                      <button
                        type="button"
                        onClick={() => updateStone(i, { metric: "count" })}
                        className={`h-9 rounded-md text-xs font-medium border transition-colors ${
                          s.metric === "count"
                            ? "bg-brand-orange text-white border-brand-orange"
                            : "bg-white text-brand-muted border-border hover:text-brand-text"
                        }`}
                      >
                        Count / amount
                      </button>
                      <button
                        type="button"
                        onClick={() => updateStone(i, { metric: "rate" })}
                        className={`h-9 rounded-md text-xs font-medium border transition-colors ${
                          s.metric === "rate"
                            ? "bg-brand-orange text-white border-brand-orange"
                            : "bg-white text-brand-muted border-border hover:text-brand-text"
                        }`}
                      >
                        Percentage / rate
                      </button>
                    </div>

                    {s.metric === "count" && (
                      <div className="grid grid-cols-[80px_1fr_110px] gap-2">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={s.target}
                          onChange={(e) => updateStone(i, { target: e.target.value })}
                          placeholder="20"
                          className="text-base h-11 bg-white"
                        />
                        <Input
                          value={s.unit}
                          onChange={(e) => updateStone(i, { unit: e.target.value })}
                          placeholder="calls / kg / mins"
                          className="text-base h-11 bg-white"
                          maxLength={40}
                        />
                        <select
                          value={s.cadence}
                          onChange={(e) => updateStone(i, { cadence: e.target.value as Cadence })}
                          className="h-11 rounded-md border border-input bg-white px-2 text-sm"
                        >
                          <option value="day">per day</option>
                          <option value="week">per week</option>
                          <option value="month">per month</option>
                          <option value="quarter">per quarter</option>
                        </select>
                      </div>
                    )}

                    {s.metric === "rate" && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
                          <div className="relative">
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={100}
                              value={s.target}
                              onChange={(e) => updateStone(i, { target: e.target.value })}
                              placeholder="30"
                              className="text-base h-11 bg-white pr-7"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-brand-muted pointer-events-none">%</span>
                          </div>
                          <select
                            value={s.cadence}
                            onChange={(e) => updateStone(i, { cadence: e.target.value as Cadence })}
                            className="h-11 rounded-md border border-input bg-white px-2 text-sm"
                          >
                            <option value="day">per day</option>
                            <option value="week">per week</option>
                            <option value="month">per month</option>
                            <option value="quarter">per quarter</option>
                          </select>
                        </div>
                        <p className="text-[11px] text-brand-muted leading-snug">
                          At each check-in you'll enter the percentage you hit.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" onClick={addStone} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Add stone
              </Button>
            </section>

            <Button
              type="submit"
              disabled={saving}
              className="w-full h-12 text-base font-semibold text-white hover:opacity-90"
              style={{ backgroundColor: "#FF6B35" }}
            >
              {saving ? "Saving…" : "Save goal"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
