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
}

interface CheckInRow {
  id: string;
  created_at: string;
  overall_rating: string;
  reply: string;
  stone_statuses: StoneStatus[];
}

interface GoalData {
  big_goal: string;
  stones: Array<{ text: string }>;
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

function ratingScore(r: string): number {
  if (r === "hit") return 1;
  if (r === "partly") return 0.5;
  return 0;
}

function lastLine(text: string): string {
  if (!text) return "";
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return paras[paras.length - 1] ?? "";
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
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
        supabase.from("goals").select("big_goal, stones").maybeSingle(),
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
          stones: Array.isArray(goalData.stones) ? (goalData.stones as Array<{ text: string }>) : [],
        });
      }
    })();
  }, []);

  // % goals hit (treat partly as half)
  const rated = rows.filter((r) => r.overall_rating === "hit" || r.overall_rating === "partly" || r.overall_rating === "missed");
  const pctGoalsHit = rated.length === 0
    ? 0
    : Math.round((rated.reduce((acc, r) => acc + ratingScore(r.overall_rating), 0) / rated.length) * 100);

  // Last 14 days bar chart — take latest check-in per day
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Array<{ label: string; date: Date; rating: string }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dayKey(d);
    const match = rows.find((r) => dayKey(new Date(r.created_at)) === key);
    days.push({
      label: d.toLocaleDateString("en-AU", { weekday: "short" })[0].toUpperCase(),
      date: d,
      rating: match?.overall_rating ?? "",
    });
  }

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
      <AppHeader />
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
            <div className="text-4xl font-bold leading-none">{loading ? "—" : `${pctGoalsHit}%`}</div>
            <div className="text-xs uppercase tracking-wide mt-2 opacity-90">Goals hit</div>
          </div>
        </div>

        {/* 14-day chart */}
        <section className="rounded-2xl bg-white border border-border p-5">
          <h2 className="text-sm font-semibold text-brand-navy">Last 14 days</h2>
          <p className="text-xs text-brand-muted mt-0.5">One bar per day. Green = hit, orange = partly, red = missed.</p>
          <div className="mt-4 flex items-end gap-1.5 h-32">
            {days.map((d, i) => {
              const h = d.rating === "hit" ? 100 : d.rating === "partly" ? 55 : d.rating === "missed" ? 18 : 0;
              const colour =
                d.rating === "hit" ? "bg-brand-green" :
                d.rating === "partly" ? "bg-brand-orange" :
                d.rating === "missed" ? "bg-brand-red" :
                "bg-brand-bg border border-dashed border-border";
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <div className="w-full flex items-end h-full">
                    <div
                      className={`w-full rounded-md ${colour}`}
                      style={{ height: `${h || 6}%`, opacity: h === 0 ? 0.5 : 1 }}
                    />
                  </div>
                  <div className="text-[10px] text-brand-muted">{d.label}</div>
                </div>
              );
            })}
          </div>
        </section>
          </div>

          <div className="space-y-5 lg:min-w-0">
        {/* Per-stone progress */}
        {goal && goal.stones.length > 0 && (
          <section className="rounded-2xl bg-white border border-border p-5">
            <h2 className="text-sm font-semibold text-brand-navy">Your goal steps</h2>
            <p className="text-xs text-brand-muted mt-0.5 break-words">{goal.big_goal}</p>
            <div className="mt-4 space-y-4">
              {goal.stones.map((stone, i) => {
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
