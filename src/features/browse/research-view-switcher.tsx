import { Link, useLocation } from "@tanstack/react-router";

export function ResearchViewSwitcher() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <nav
      aria-label="Research view"
      className="flex items-center gap-1 rounded-full border p-1 text-sm"
    >
      {(
        [
          ["/browse", "Browse"],
          ["/deck", "Decks"],
        ] as const
      ).map(([to, label]) => (
        <Link
          key={to}
          to={to}
          search={(previous) => previous}
          aria-current={pathname === to ? "page" : undefined}
          className={`rounded-full px-3 py-1.5 whitespace-nowrap transition-colors ${pathname === to ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
