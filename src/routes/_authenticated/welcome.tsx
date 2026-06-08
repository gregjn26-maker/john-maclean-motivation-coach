import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import logoAsset from "@/assets/jm-logo.webp.asset.json";
import { AppHeader } from "@/components/app-header";

export const Route = createFileRoute("/_authenticated/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome — John Maclean Daily Coach" },
      { name: "description", content: "Meet your daily coach in the voice of John Maclean OAM." },
    ],
  }),
  component: WelcomePage,
});

function JMAvatar() {
  return (
    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-brand-navy inline-flex items-center justify-center text-white font-bold text-sm">
      JM
    </div>
  );
}

function WelcomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    try { localStorage.setItem("jm_welcome_seen", "1"); } catch {}
  }, []);

  return (
    <main className="min-h-screen bg-brand-bg pb-24">
      <AppHeader back={{ to: "/" }} />

      {/* Hero */}
      <section
        className="px-6 py-12 flex flex-col items-center text-center"
        style={{ backgroundColor: "#0A2540" }}
      >
        <img
          src={logoAsset.url}
          alt="John Maclean"
          className="w-40 sm:w-48 h-auto mb-5"
        />
        <h1
          className="text-3xl sm:text-4xl font-semibold leading-tight"
          style={{ color: "#F4B400" }}
        >
          How far can you go?
        </h1>
      </section>

      {/* Intro */}
      <section className="mx-auto max-w-xl px-6 pt-6 space-y-5">
        <p className="text-base text-foreground leading-relaxed">
          <span className="font-semibold">John Maclean OAM</span> — Paralympic
          medallist, and the first wheelchair athlete to complete the Hawaii
          Ironman and swim the English Channel.
        </p>

        <p className="text-base text-foreground leading-relaxed">
          This is your daily coach. Set a goal that matters to you, check in
          with your wins and the things that got in the way, and John will help
          you take the next step — one stone further than yesterday, using the
          lessons from his own life.
        </p>

        {/* Mr Brown / stone intro */}
        <section className="rounded-xl bg-coach-panel p-5">
          <div className="flex items-start gap-3">
            <JMAvatar />
            <div className="space-y-2 text-sm text-coach-panel-foreground leading-relaxed">
              <p>
                Here's something I learned the hard way. When I was learning to walk again, my neighbour Mr Brown would come out each afternoon and ask, "What's our goal today?" The goal was a power pole up the street — and I couldn't reach it. So we'd put a stone down where I got to that day, and the next day move it a little further. Slowly that stone walked its way up to the pole. That's how every big goal actually gets done — not in one leap, but one stone further than yesterday.
              </p>
              <p>
                So set your big goal — that's your pole. Then break it into as many small, achievable stones as you can: the daily and weekly wins you can actually tick off. Hit enough of them, and one day you'll look up and the pole will be right there.
              </p>
            </div>
          </div>
        </section>

        <p className="text-sm text-muted-foreground leading-relaxed italic">
          John's an AI coach here, built on John Maclean's real stories, voice
          and philosophy.
        </p>

        <Button
          onClick={() => navigate({ to: "/goals" })}
          className="w-full h-14 text-base font-semibold mt-2 text-white hover:opacity-90"
          style={{ backgroundColor: "#FF6B35" }}
        >
          Set my first goal <ArrowRight className="h-5 w-5 ml-1" />
        </Button>
      </section>
    </main>
  );
}
