import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import logoAsset from "@/assets/jm-logo.webp.asset.json";

export const Route = createFileRoute("/_authenticated/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome — John Maclean Daily Coach" },
      { name: "description", content: "Meet your daily coach in the voice of John Maclean OAM." },
    ],
  }),
  component: WelcomePage,
});

function WelcomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    try { localStorage.setItem("jm_welcome_seen", "1"); } catch {}
  }, []);

  return (
    <main className="min-h-screen bg-background pb-12">
      {/* Hero */}
      <section
        className="px-6 py-14 flex flex-col items-center text-center"
        style={{ backgroundColor: "#0A2540" }}
      >
        <img
          src={logoAsset.url}
          alt="John Maclean"
          className="w-48 sm:w-56 h-auto mb-6"
        />
        <h1
          className="text-3xl sm:text-4xl font-semibold leading-tight"
          style={{ color: "#F4B400" }}
        >
          How far can you go?
        </h1>
      </section>

      {/* Intro */}
      <section className="mx-auto max-w-xl px-6 pt-8 space-y-5">
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

        <p className="text-sm text-muted-foreground leading-relaxed italic">
          John's an AI coach here, built on John Maclean's real stories, voice
          and philosophy.
        </p>

        <Button
          onClick={() => navigate({ to: "/goals" })}
          className="w-full h-14 text-base font-semibold mt-4 text-white hover:opacity-90"
          style={{ backgroundColor: "#FF6B35" }}
        >
          Set my first goal <ArrowRight className="h-5 w-5 ml-1" />
        </Button>
      </section>
    </main>
  );
}
