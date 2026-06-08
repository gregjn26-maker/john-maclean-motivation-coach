import { Link } from "@tanstack/react-router";

export function AppHeader({ rightExtra }: { rightExtra?: React.ReactNode }) {
  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return (
    <header className="sticky top-0 z-10 bg-brand-navy">
      <div className="mx-auto flex max-w-xl items-center justify-between px-5 py-3">
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-orange flex-shrink-0" />
          <span className="text-white font-semibold text-base tracking-tight truncate">
            John AI Coach
          </span>
        </Link>
        <div className="flex items-center gap-3 flex-shrink-0">
          {rightExtra}
          <span className="text-xs text-white/60">{today}</span>
        </div>
      </div>
    </header>
  );
}
