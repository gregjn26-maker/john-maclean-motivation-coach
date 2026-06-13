import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";

export const Route = createFileRoute("/_authenticated/progress")({
  head: () => ({
    meta: [
      { title: "My Progress — John Maclean" },
      { name: "description", content: "Your check-ins, goals hit, and recent encouragement from John." },
    ],
  }),
  component: ProgressPage,
});

interface StoneStatus {
  text: string;
  worked: boolean;
  amount?: number | null;
  achieved?: number | null;
  total?: number | null;
}

interface CheckInRow {
  id: string;
  created_at: string;
  overall_rating: string;
  reply: string;
  stone_statuses: StoneStatus[];
}

interface StoneMeta {
  text: string;
  target?: number | null;
  unit?: string;
  // NEW schema
  type?: "count_up" | "report_level";
  period?: "day" | "week" | "month" | "quarter" | "year" | "";
  direction?: "higher_better" | "lower_better";
  needs_setup?: boolean;
  // Legacy fields (still read for back-compat)
  cadence?: string;
  metric?: "count" | "rate" | "habit";
  numerator_label?: string;
  denominator_label?: string;
}

function stoneMetric(s: StoneMeta): "count" | "rate" | "habit" {
  // NEW schema wins
  if (s.type === "report_level") return "rate";
  if (s.type === "count_up") {
    return typeof s.target === "number" && s.target > 0 ? "count" : "habit";
  }
  // Legacy
  if (s.metric === "count" || s.metric === "rate" || s.metric === "habit") return s.metric;
  return typeof s.target === "number" && s.target > 0 ? "count" : "habit";
}

function stonePeriod(s: StoneMeta): string {
  // report_level NEVER carries a period
  if (s.type === "report_level") return "";
  if (s.period) return s.period;
  return s.cadence ?? "";
}

interface GoalData {
  big_goal: string;
  stones: StoneMeta[];
  target_date: string | null;
  created_at: string | null;
}

function normaliseText(s: string) {
  return (s || "").trim().toLowerCase();
}

function stoneWorkedCount(stoneText: string, past: CheckInRow[]): number {
  const key = normaliseText(stoneText);
  let count = 0;
  for (const p of past.slice(0, 14)) {
    const arr = Array.isArray(p.stone_statuses) ? p.stone_statuses : [];
    const match = arr.find((s) => normaliseText(s.text) === key);
    if (match && match.worked) count++;
  }
  return count;
}

function stoneUntouchedStreak(stoneText: string, past: CheckInRow[]): number {
  const key = normaliseText(stoneText);
  let streak = 0;
  for (const p of past) {
    const arr = Array.isArray(p.stone_statuses) ? p.stone_statuses : [];
    const match = arr.find((s) => normaliseText(s.text) === key);
    if (match && match.worked) break;
    streak++;
  }
  return streak;
}

function attentionColour(streak: number): string {
  if (streak >= 3) return "bg-brand-red";
  if (streak >= 1) return "bg-brand-gold";
  return "bg-brand-green";
}

function attentionLabel(streak: number): string {
  if (streak >= 3) return "Neglected";
  if (streak >= 1) return "Slipping";
  return "On track";
}

function attentionTextColour(streak: number): string {
  if (streak >= 3) return "text-brand-red";
  if (streak >= 1) return "text-brand-gold";
  return "text-brand-green";
}

function lastLine(text: string): string {
  if (!text) return "";
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return paras[paras.length - 1] ?? "";
}

/**
 * On-pace check for a single stone at a moment in time.
 * Returns { applicable: false } when there isn't enough data to judge yet.
 */
function stoneOnPaceAt(
  stone: StoneMeta,
  rows: CheckInRow[],
  goal: GoalData | null,
  asOf: Date,
): { applicable: boolean; onPace: boolean } {
  const key = normaliseText(stone.text);
  const metric = stoneMetric(stone);
  const scoped = rows.filter((r) => new Date(r.created_at).getTime() <= asOf.getTime());

  if (metric === "rate" && typeof stone.target === "number" && stone.target > 0) {
    let latest: number | null = null;
    for (const r of scoped) {
      const arr = Array.isArray(r.stone_statuses) ? r.stone_statuses : [];
      const m = arr.find((x) => normaliseText(x.text) === key);
      if (m && typeof m.achieved === "number") { latest = m.achieved; break; }
    }
    if (latest === null) return { applicable: false, onPace: false };
    let expected = stone.target;
    if (goal?.target_date && goal?.created_at) {
      const start = new Date(goal.created_at).getTime();
      const end = new Date(goal.target_date).getTime();
      if (end > start) {
        const e = Math.min(1, Math.max(0, (asOf.getTime() - start) / (end - start)));
        expected = stone.target * e;
      }
    }
    const ratio = expected > 0 ? latest / expected : (latest >= stone.target ? 1 : 0);
    return { applicable: true, onPace: ratio >= 0.8 };
  }

  if (metric === "count" && typeof stone.target === "number" && stone.target > 0 && stone.cadence) {
    const cadence = stone.cadence;
    let periodStart: Date, periodEnd: Date;
    if (cadence === "month") {
      periodStart = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
      periodEnd = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1);
    } else if (cadence === "quarter") {
      const q = Math.floor(asOf.getMonth() / 3);
      periodStart = new Date(asOf.getFullYear(), q * 3, 1);
      periodEnd = new Date(asOf.getFullYear(), q * 3 + 3, 1);
    } else if (cadence === "week") {
      const d = new Date(asOf); d.setHours(0,0,0,0);
      const dayIdx = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - dayIdx);
      periodStart = d;
      periodEnd = new Date(d); periodEnd.setDate(periodEnd.getDate() + 7);
    } else {
      const d = new Date(asOf); d.setHours(0,0,0,0);
      periodStart = d;
      periodEnd = new Date(d); periodEnd.setDate(periodEnd.getDate() + 1);
    }
    let total = 0;
    let anyEntry = false;
    for (const r of scoped) {
      const t = new Date(r.created_at);
      if (t < periodStart || t >= periodEnd) continue;
      const arr = Array.isArray(r.stone_statuses) ? r.stone_statuses : [];
      const m = arr.find((x) => normaliseText(x.text) === key);
      if (!m) continue;
      anyEntry = true;
      if (typeof m.amount === "number") total += m.amount;
    }
    if (!anyEntry) return { applicable: false, onPace: false };
    const periodMs = periodEnd.getTime() - periodStart.getTime();
    const elapsed = Math.min(1, Math.max(0, (asOf.getTime() - periodStart.getTime()) / periodMs));
    const expected = stone.target * elapsed;
    const ratio = expected > 0 ? total / expected : (total >= stone.target ? 1 : 0);
    return { applicable: true, onPace: ratio >= 0.8 };
  }

  if (metric === "count" && typeof stone.target === "number" && stone.target > 0) {
    const vals: number[] = [];
    for (const r of scoped) {
      const arr = Array.isArray(r.stone_statuses) ? r.stone_statuses : [];
      const m = arr.find((x) => normaliseText(x.text) === key);
      if (!m) continue;
      if (typeof m.amount === "number") vals.push(m.amount);
      else if (!m.worked) vals.push(0);
      if (vals.length >= 5) break;
    }
    if (vals.length === 0) return { applicable: false, onPace: false };
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { applicable: true, onPace: avg / stone.target >= 0.8 };
  }

  // HABIT
  for (const r of scoped) {
    const arr = Array.isArray(r.stone_statuses) ? r.stone_statuses : [];
    const m = arr.find((x) => normaliseText(x.text) === key);
    if (m) return { applicable: true, onPace: !!m.worked };
  }
  return { applicable: false, onPace: false };
}

function ProgressPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CheckInRow[]>([]);
  const [total, setTotal] = useState(0);
  const [goal, setGoal] = useState<GoalData | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data, error, count }, { data: goalData }] = await Promise.all([
        supabase
          .from("check_ins")
          .select("id, created_at, overall_rating, reply, stone_statuses", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("goals").select("big_goal, stones, target_date, created_at").maybeSingle(),
      ]);
      setLoading(false);
      if (error) return;
      const typedRows = (data ?? []).map((r) => ({
        ...r,
        stone_statuses: Array.isArray(r.stone_statuses) ? (r.stone_statuses as unknown as StoneStatus[]) : [],
      }));
      setRows(typedRows as CheckInRow[]);
      setTotal(count ?? data?.length ?? 0);
      if (goalData) {
        setGoal({
          big_goal: goalData.big_goal ?? "",
          stones: Array.isArray(goalData.stones) ? (goalData.stones as unknown as StoneMeta[]) : [],
          target_date: goalData.target_date ?? null,
          created_at: goalData.created_at ?? null,
        });
      }
    })();
  }, []);

  // On-pace NOW — % of applicable stones on-pace, judged this moment
  const now = new Date();
  const stones = goal?.stones ?? [];
  const liveResults = stones.map((s) => stoneOnPaceAt(s, rows, goal, now));
  const liveApplicable = liveResults.filter((r) => r.applicable);
  const livePct = liveApplicable.length === 0
    ? null
    : Math.round((liveApplicable.filter((r) => r.onPace).length / liveApplicable.length) * 100);

  const encouragements = rows
    .filter((r) => r.reply)
    .slice(0, 6)
    .map((r) => ({
      id: r.id,
      day: new Date(r.created_at).toLocaleDateString("en-AU", { weekday: "short" }).toUpperCase(),
      line: lastLine(r.reply),
    }))
    .filter((e) => e.line.length > 0);

  return (
    <main className="min-h-screen bg-brand-bg pb-24">
      <AppHeader back={{ to: "/" }} />
      <div className="mx-auto max-w-xl lg:max-w-6xl px-5 pt-5 space-y-5">
        <h1 className="text-xl lg:text-2xl font-semibold text-brand-navy">My Progress</h1>

        <div className="lg:grid lg:grid-cols-2 lg:gap-5 space-y-5 lg:space-y-0">
          <div className="space-y-5 lg:min-w-0">
        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-brand-orange text-white p-5">
            <div className="text-4xl font-bold leading-none">{loading ? "—" : total}</div>
            <div className="text-xs uppercase tracking-wide mt-2 opacity-90">Check-ins</div>
          </div>
          <div className="rounded-2xl bg-brand-navy text-white p-5">
            <div className="text-4xl font-bold leading-none">
              {loading ? "—" : livePct === null ? "—" : `${livePct}%`}
            </div>
            <div className="text-xs uppercase tracking-wide mt-2 opacity-90">On pace now</div>
          </div>
        </div>
          </div>


          <div className="space-y-5 lg:min-w-0">
        {/* Per-stone progress */}
        {goal && goal.stones.length > 0 && (
          <section className="rounded-2xl bg-white border border-border p-5">
            <h2 className="text-sm font-semibold text-brand-navy">Your goal steps</h2>
            <p className="text-xs text-brand-muted mt-0.5 break-words">{goal.big_goal}</p>
            <div className="mt-4 space-y-4">
              {goal.stones.map((stone, i) => {
                const metric = stoneMetric(stone);
                const measurable = metric === "count";
                const unit = (stone.unit ?? "").trim();
                const cadence = stonePeriod(stone);
                const isPeriod = cadence === "day" || cadence === "week" || cadence === "month" || cadence === "quarter" || cadence === "year";
                const cadenceLbl =
                  cadence === "week" ? "per wk"
                  : cadence === "month" ? "per mo"
                  : cadence === "quarter" ? "per qtr"
                  : cadence === "year" ? "per yr"
                  : "per day";

                // NEEDS SETUP — count_up with no target yet
                if (stone.needs_setup && metric !== "rate") {
                  return (
                    <div key={i}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-brand-text font-medium break-words">{stone.text}</p>
                        <span className="text-[11px] font-semibold uppercase tracking-wide flex-shrink-0 mt-0.5 text-brand-muted">
                          Needs setup
                        </span>
                      </div>
                      <p className="text-[11px] text-brand-muted mt-1">
                        Add a number target {cadence ? `per ${cadence}` : ""} on your goal so we can track this.
                      </p>
                    </div>
                  );
                }

                // RATE metric — cumulative-to-date: show the latest % reading vs the target.
                // If a target date and goal start date are set, also show pacing (expected % by today).
                if (metric === "rate" && typeof stone.target === "number" && stone.target > 0) {
                  const key = normaliseText(stone.text);
                  // rows are ordered desc, so the first match is the latest reading
                  let latest: number | null = null;
                  let latestAt: Date | null = null;
                  let readings = 0;
                  for (const r of rows) {
                    const arr = Array.isArray(r.stone_statuses) ? r.stone_statuses : [];
                    const m = arr.find((x) => normaliseText(x.text) === key);
                    if (m && typeof m.achieved === "number") {
                      readings++;
                      if (latest === null) {
                        latest = m.achieved;
                        latestAt = new Date(r.created_at);
                      }
                    }
                  }
                  const target = stone.target as number;
                  const current = latest ?? 0;

                  // Pacing
                  let expected: number | null = null;
                  let elapsedPct = 0;
                  if (goal?.target_date && goal?.created_at) {
                    const start = new Date(goal.created_at).getTime();
                    const end = new Date(goal.target_date).getTime();
                    const now = Date.now();
                    if (end > start) {
                      const e = Math.min(1, Math.max(0, (now - start) / (end - start)));
                      elapsedPct = e;
                      expected = target * e;
                    }
                  }

                  const ratio = expected !== null && expected > 0
                    ? current / expected
                    : (target > 0 ? current / target : 0);
                  const barColour =
                    ratio >= 1 ? "bg-brand-green" : ratio >= 0.8 ? "bg-brand-gold" : "bg-brand-red";
                  const statusText =
                    ratio >= 1 ? "text-brand-green" : ratio >= 0.8 ? "text-brand-gold" : "text-brand-red";
                  const statusLabel =
                    expected !== null
                      ? (ratio >= 1 ? "On pace" : ratio >= 0.8 ? "Close" : "Behind pace")
                      : (ratio >= 1 ? "On target" : ratio >= 0.8 ? "Close" : "Behind");
                  const pctBar = Math.min(100, Math.round((current / Math.max(target, 1)) * 100));
                  const pctDisplay = latest !== null ? `${Math.round(current)}%` : "—";
                  const latestLbl = latestAt
                    ? latestAt.toLocaleDateString("en-AU", { day: "numeric", month: "short" })
                    : "";
                  return (
                    <div key={i}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-brand-text font-medium break-words">
                          {stone.text}
                          <span className="text-brand-muted font-normal"> — % to date</span>
                        </p>
                        <span className={`text-[11px] font-semibold uppercase tracking-wide flex-shrink-0 mt-0.5 ${statusText}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <div className="flex-1 h-2 bg-brand-bg rounded-full overflow-hidden relative">
                          <div className={`h-full ${barColour} rounded-full`} style={{ width: `${pctBar}%` }} />
                          {expected !== null && (
                            <div
                              className="absolute top-[-2px] bottom-[-2px] w-px bg-brand-navy/60"
                              style={{ left: `${Math.min(100, Math.round((expected / Math.max(target, 1)) * 100))}%` }}
                              title={`Pace marker: ${Math.round(expected)}%`}
                            />
                          )}
                        </div>
                        <span className="text-xs text-brand-muted text-right tabular-nums whitespace-nowrap">
                          {pctDisplay} / {target}%
                        </span>
                      </div>
                      <p className="text-[10px] text-brand-muted mt-1">
                        {latest !== null
                          ? `latest reading ${latestLbl} — ${readings} update${readings === 1 ? "" : "s"} logged`
                          : "no readings yet — enter % at your next check-in"}
                        {expected !== null
                          ? ` · pace ${Math.round(expected)}% (${Math.round(elapsedPct * 100)}% of timeline elapsed)`
                          : (goal?.target_date ? "" : " · set a target date on your goal to see pacing")}
                      </p>
                    </div>
                  );
                }



                if (measurable && isPeriod) {
                  const now = new Date();
                  let periodStart: Date;
                  let periodEnd: Date;
                  let periodLbl: string;
                  if (cadence === "month") {
                    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                    periodLbl = "this month";
                  } else if (cadence === "quarter") {
                    const q = Math.floor(now.getMonth() / 3);
                    periodStart = new Date(now.getFullYear(), q * 3, 1);
                    periodEnd = new Date(now.getFullYear(), q * 3 + 3, 1);
                    periodLbl = "this quarter";
                  } else if (cadence === "week") {
                    const d = new Date(now); d.setHours(0,0,0,0);
                    const dayIdx = (d.getDay() + 6) % 7;
                    d.setDate(d.getDate() - dayIdx);
                    periodStart = d;
                    periodEnd = new Date(d); periodEnd.setDate(periodEnd.getDate() + 7);
                    periodLbl = "this week";
                  } else {
                    const d = new Date(now); d.setHours(0,0,0,0);
                    periodStart = d;
                    periodEnd = new Date(d); periodEnd.setDate(periodEnd.getDate() + 1);
                    periodLbl = "today";
                  }
                  const key = normaliseText(stone.text);
                  let total = 0;
                  for (const r of rows) {
                    const t = new Date(r.created_at);
                    if (t < periodStart || t >= periodEnd) continue;
                    const arr = Array.isArray(r.stone_statuses) ? r.stone_statuses : [];
                    const m = arr.find((x) => normaliseText(x.text) === key);
                    if (m && typeof m.amount === "number") total += m.amount;
                  }
                  const target = stone.target as number;
                  const periodMs = periodEnd.getTime() - periodStart.getTime();
                  const elapsed = Math.min(1, Math.max(0, (now.getTime() - periodStart.getTime()) / periodMs));
                  const expected = target * elapsed;
                  const onTrack = expected > 0 ? total / expected : (total >= target ? 1 : 0);
                  const completionPct = Math.min(100, Math.round((total / target) * 100));
                  const barColour =
                    onTrack >= 1 ? "bg-brand-green" : onTrack >= 0.7 ? "bg-brand-gold" : "bg-brand-red";
                  const statusText =
                    onTrack >= 1 ? "text-brand-green" : onTrack >= 0.7 ? "text-brand-gold" : "text-brand-red";
                  const statusLabel =
                    onTrack >= 1 ? "On track" : onTrack >= 0.7 ? "Close" : "Behind";
                  const totalDisplay = Number.isInteger(total) ? total.toString() : total.toFixed(1);
                  return (
                    <div key={i}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-brand-text font-medium break-words">
                          {stone.text}
                          {unit && <span className="text-brand-muted font-normal"> — {unit}</span>}
                        </p>
                        <span className={`text-[11px] font-semibold uppercase tracking-wide flex-shrink-0 mt-0.5 ${statusText}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <div className="flex-1 h-2 bg-brand-bg rounded-full overflow-hidden">
                          <div className={`h-full ${barColour} rounded-full transition-all`} style={{ width: `${completionPct}%` }} />
                        </div>
                        <span className="text-[11px] font-semibold text-brand-navy tabular-nums flex-shrink-0">
                          {totalDisplay} / {target} {unit || ""} <span className="opacity-70">({completionPct}%)</span>
                        </span>
                      </div>
                      <p className="text-[10px] text-brand-muted mt-1">
                        total {periodLbl} — {Math.round(elapsed * 100)}% of period elapsed
                      </p>
                    </div>
                  );
                }

                if (measurable) {
                  const key = normaliseText(stone.text);
                  const recent = rows.slice(0, 14);
                  const vals: number[] = [];
                  for (const r of recent) {
                    const arr = Array.isArray(r.stone_statuses) ? r.stone_statuses : [];
                    const m = arr.find((x) => normaliseText(x.text) === key);
                    if (!m) continue;
                    if (typeof m.amount === "number") vals.push(m.amount);
                    else if (m.worked) continue; // no number recorded; skip
                    else vals.push(0);
                  }
                  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                  const target = stone.target as number;
                  const ratio = target > 0 ? avg / target : 0;
                  const pct = Math.min(100, Math.round(ratio * 100));
                  const barColour =
                    ratio >= 1 ? "bg-brand-green" : ratio >= 0.7 ? "bg-brand-gold" : "bg-brand-red";
                  const statusText =
                    ratio >= 1 ? "text-brand-green" : ratio >= 0.7 ? "text-brand-gold" : "text-brand-red";
                  const statusLabel =
                    ratio >= 1 ? "On target" : ratio >= 0.7 ? "Close" : "Under";
                  const avgDisplay = Number.isInteger(avg) ? avg.toString() : avg.toFixed(1);
                  return (
                    <div key={i}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-brand-text font-medium break-words">
                          {stone.text}
                          {unit && <span className="text-brand-muted font-normal"> — {unit}</span>}
                        </p>
                        <span className={`text-[11px] font-semibold uppercase tracking-wide flex-shrink-0 mt-0.5 ${statusText}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <div className="flex-1 h-2 bg-brand-bg rounded-full overflow-hidden">
                          <div className={`h-full ${barColour} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-brand-muted text-right tabular-nums whitespace-nowrap">
                          {avgDisplay}/{target}
                        </span>
                      </div>
                      <p className="text-[10px] text-brand-muted mt-1">
                        avg {cadenceLbl}, last {vals.length || 0} of 14 check-ins
                      </p>
                    </div>
                  );
                }

                const streak = stoneUntouchedStreak(stone.text, rows);
                const worked = stoneWorkedCount(stone.text, rows);
                const barColour = attentionColour(streak);
                const statusLabel = attentionLabel(streak);
                const statusText = attentionTextColour(streak);
                const pct = Math.min(100, Math.round((worked / 14) * 100));
                return (
                  <div key={i}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-brand-text font-medium break-words">{stone.text}</p>
                      <span className={`text-[11px] font-semibold uppercase tracking-wide flex-shrink-0 mt-0.5 ${statusText}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <div className="flex-1 h-2 bg-brand-bg rounded-full overflow-hidden">
                        <div className={`h-full ${barColour} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-brand-muted w-12 text-right tabular-nums">{worked} of 14</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* John's recent encouragement */}
        <section>
          <h2 className="text-sm font-semibold text-brand-navy mb-3 px-1">John's recent encouragement</h2>
          {loading ? (
            <p className="text-sm text-brand-muted px-1">Loading…</p>
          ) : encouragements.length === 0 ? (
            <p className="text-sm text-brand-muted px-1">Your closing lines from John will show here.</p>
          ) : (
            <ul className="space-y-2.5">
              {encouragements.map((e) => (
                <li key={e.id} className="rounded-xl bg-brand-cream border-l-4 border-brand-orange p-3.5">
                  <div className="text-[10px] font-semibold tracking-wider text-brand-orange">{e.day}</div>
                  <p className="text-sm text-brand-text mt-1 leading-relaxed">{e.line}</p>
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
