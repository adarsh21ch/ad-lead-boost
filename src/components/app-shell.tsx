import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { countLeadsAwaitingDecision } from "@/lib/adspro.functions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/performance", label: "Ad performance" },
  { to: "/leads", label: "Leads" },

  { to: "/deliveries", label: "Events sent" },
  { to: "/dashboard/integration", label: "Integration" },
  { to: "/dashboard/settings", label: "Settings" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const countAwaitingFn = useServerFn(countLeadsAwaitingDecision);

  // Fetched on mount and whenever the route changes — no interval, no polling.
  const { data: awaiting } = useQuery({
    queryKey: ["leads-awaiting-decision", pathname],
    queryFn: () => countAwaitingFn(),
    staleTime: 0,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });
  const awaitingCount = awaiting?.count ?? 0;

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const isActive = (to: string) =>
    to === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(to);

  const badgeFor = (to: string) =>
    to === "/leads" && awaitingCount > 0 ? awaitingCount : null;


  return (
    <div className="min-h-screen bg-background">
      {/* Desktop: pinned sidebar, full viewport height, only its own list scrolls. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r bg-background md:flex">
        <div className="flex h-14 shrink-0 items-center border-b px-4">
          <Link to="/dashboard">
            <BrandLogo />
          </Link>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
                isActive(item.to) && "bg-accent text-foreground",
              )}
            >
              <span>{item.label}</span>
              {badgeFor(item.to) ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {badgeFor(item.to)}
                </span>
              ) : null}
            </Link>

          ))}
        </nav>
        {/* Sign out pinned to the bottom — never drifts with page scroll. */}
        <div className="shrink-0 border-t p-3">
          <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile: collapsed to a sticky top bar with a scrolling nav row. */}
      <div className="sticky top-0 z-40 border-b bg-background md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link to="/dashboard">
            <BrandLogo />
          </Link>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-3 pb-2">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground",
                isActive(item.to) && "bg-accent text-foreground",
              )}
            >
              <span>{item.label}</span>
              {badgeFor(item.to) ? (
                <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {badgeFor(item.to)}
                </span>
              ) : null}
            </Link>

          ))}
        </nav>
      </div>

      <main className="p-6 md:pl-6 md:ml-56">{children}</main>
    </div>
  );
}
