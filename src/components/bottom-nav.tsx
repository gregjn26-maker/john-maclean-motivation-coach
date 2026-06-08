import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Target, BarChart3, Info } from "lucide-react";

const items = [
  { to: "/", label: "Check-in", icon: Home, exact: true },
  { to: "/goals", label: "My Goals", icon: Target },
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/welcome", label: "Intro", icon: Info },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80"
    >
      <ul className="mx-auto flex max-w-6xl items-stretch justify-around px-2 py-1.5 pb-[max(env(safe-area-inset-bottom),0.375rem)]">
        {items.map((it) => {
          const Icon = it.icon;
          const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
          return (
            <li key={it.to} className="flex-1">
              <Link
                to={it.to}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                  active ? "text-brand-orange" : "text-brand-muted hover:text-brand-navy"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
