import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import logoAsset from "@/assets/jm-logo.webp.asset.json";
import { AppHeader } from "@/components/app-header";
import { JohnVideos } from "@/components/john-videos";

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
      <section className="mx-auto max-w-3xl px-6 pt-6 space-y-5">
        <JohnVideos heading="Meet John" />

        <div className="space-y-4 text-base text-foreground leading-relaxed">
          <p>
            In 1988, at 22, I was hit by an eight-tonne truck while I was out training on my bike. I woke in a spinal unit, paralysed, and was told all the things I'd never do again. For a long time, I believed them.
          </p>
          <p>
            About a year later, at home — broken and burnt out — my dad sat with me. We both cried. Then he said the words that changed my life: <span className="italic">"Son, look how far you've come… now how far can you go?"</span>
          </p>
          <p>
            That question became my mission. I went on to be the first wheelchair athlete to finish the Hawaii Ironman, the first to swim the English Channel, I won a rowing silver in Beijing — and 25 years after the accident, I relearned to walk and finished the very race I'd been training for the day I was hit.
          </p>
          <p>
            None of it happened in one leap. It happened one goal at a time — one stone further than yesterday. Everything I've done started as something I dared to picture, then broke into steps I could actually take. You're only ever limited by what you dare to dream.
          </p>
          <p>
            So that's what this is. You set the goal. You take the next step. And we find out together — how far can you go?
          </p>
        </div>

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
