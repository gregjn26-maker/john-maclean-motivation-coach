import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export function AppHeader({
  rightExtra,
  back,
}: {
  rightExtra?: React.ReactNode;
  back?: { to?: string; label?: string } | boolean;
}) {
  const router = useRouter();
  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const backConfig = back === true ? {} : back || null;

  function onBack() {
    if (backConfig && "to" in backConfig && backConfig.to) {
      router.navigate({ to: backConfig.to });
    } else {
      router.history.back();
    }
  }

  return (
    <header className="sticky top-0 z-10 bg-brand-navy">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {backConfig && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="-ml-1 mr-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-orange flex-shrink-0" />
            <span className="text-white font-semibold text-sm sm:text-base tracking-tight truncate">
              John Maclean AI Motivation Coach
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {rightExtra}
          <span className="hidden sm:inline text-xs text-white/60">{today}</span>
        </div>
      </div>
    </header>
  );
}
