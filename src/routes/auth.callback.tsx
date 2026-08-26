import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Completing sign in — AdsPro" },
      { name: "description", content: "Complete your AdsPro sign-in session." },
      { property: "og:title", content: "Completing sign in — AdsPro" },
      { property: "og:description", content: "Complete your AdsPro sign-in session." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Completing sign in…");

  useEffect(() => {
    let cancelled = false;

    async function completeAuth() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (!cancelled) setMessage("This sign-in link is invalid or expired.");
          window.setTimeout(() => navigate({ to: "/auth", replace: true }), 1200);
          return;
        }
      }

      const { data } = await supabase.auth.getUser();
      if (data.user) {
        navigate({ to: "/dashboard", replace: true });
        return;
      }

      if (!cancelled) setMessage("Please sign in to continue.");
      window.setTimeout(() => navigate({ to: "/auth", replace: true }), 800);
    }

    void completeAuth();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>AdsPro</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}