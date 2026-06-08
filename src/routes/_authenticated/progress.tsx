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

interface CheckInRow {
  id: string;
  created_at: string;
  overall_rating: string;
  reply: string;
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

  useEffect(() => {
    (async () => {
      const { data, error, count } = await supabase
        .from("check_ins")
        .select("id, created_at, overall_rating, reply", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(200);
      setLoading(false);
      if (error) return;
      setRows((data ?? []) as CheckInRow[]);
      setTotal(count ?? data?.length ?? 0);
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
      <div className="mx-auto max-w-xl px-5 pt-5 space-y-5">
        <h1 className="text-xl font-semibold text-brand-navy">My Progress</h1>

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
    </main>
  );
}
