import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/leads", label: "Leads" },
  { to: "/deliveries", label: "Deliveries" },
  { to: "/dashboard/integration", label: "Integration" },
  { to: "/dashboard/settings", label: "Settings" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-56 shrink-0 flex-col border-r">
        <div className="flex h-14 items-center border-b px-4">
          <Link to="/dashboard">
            <BrandLogo />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
                (item.to === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.to)) && "bg-accent text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t p-3">
          <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
