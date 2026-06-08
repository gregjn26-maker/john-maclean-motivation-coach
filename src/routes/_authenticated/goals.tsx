import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyGoal, saveMyGoal } from "@/lib/goals.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Plus, X } from "lucide-react";

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

function GoalsPage() {
  const navigate = useNavigate();
  const fetchGoal = useServerFn(getMyGoal);
  const save = useServerFn(saveMyGoal);

  const [bigGoal, setBigGoal] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [stones, setStones] = useState<string[]>([""]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchGoal({})
      .then((res) => {
        if (res.goal) {
          setBigGoal(res.goal.big_goal ?? "");
          setTargetDate(res.goal.target_date ?? "");
          const s = Array.isArray(res.goal.stones) ? (res.goal.stones as Array<{ text: string }>) : [];
          setStones(s.length ? s.map((x) => x.text) : [""]);
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load your goal."))
      .finally(() => setLoading(false));
  }, [fetchGoal]);

  function updateStone(i: number, val: string) {
    setStones((prev) => prev.map((s, idx) => (idx === i ? val : s)));
  }
  function addStone() {
    if (stones.length >= 5) return;
    setStones((prev) => [...prev, ""]);
  }
  function removeStone(i: number) {
    setStones((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanedStones = stones.map((s) => s.trim()).filter(Boolean);
    if (!bigGoal.trim()) return toast.error("Add your big goal.");
    if (cleanedStones.length < 1) return toast.error("Add at least 1 stone.");
    setSaving(true);
    try {
      await save({
        data: {
          big_goal: bigGoal.trim(),
          target_date: targetDate || null,
          stones: cleanedStones.map((text) => ({ text })),
        },
      });
      toast.success("Goal saved.");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-5 py-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-base font-semibold text-foreground leading-tight">My Goals</h1>
            <p className="text-xs text-muted-foreground leading-tight">Your big goal and the stones that get you there</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-5 pt-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6">
            {/* Coaching intro */}
            <section className="rounded-xl bg-coach-panel p-5 space-y-3">
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

            <section className="rounded-xl border border-border bg-card p-5 space-y-4">
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

            <section className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Your stones — the small steps that get you there</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  1–5 smaller, measurable steps. e.g. "20 calls a day", "5 meetings a week"
                </p>
              </div>
              <div className="space-y-3">
                {stones.map((s, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <Input
                        value={s}
                        onChange={(e) => updateStone(i, e.target.value)}
                        placeholder={`Stone ${i + 1}`}
                        className="text-base h-11"
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
                ))}
              </div>
              {stones.length < 5 && (
                <Button type="button" variant="outline" onClick={addStone} className="w-full">
                  <Plus className="h-4 w-4 mr-1" /> Add stone
                </Button>
              )}
            </section>

            <Button type="submit" disabled={saving} className="w-full h-12 text-base">
              {saving ? "Saving…" : "Save goal"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
