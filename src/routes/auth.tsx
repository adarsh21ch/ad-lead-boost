import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { registerWithEmail } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const AUTH_TIMEOUT_MS = 15_000;

async function withAuthTimeout<T>(promise: Promise<T>, action: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${action} is taking too long. Please check your connection and try again.`));
    }, AUTH_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — AdsPro" },
      { name: "description", content: "Sign in or create your AdsPro account." },
      { property: "og:title", content: "Sign in — AdsPro" },
      { property: "og:description", content: "Sign in or create your AdsPro account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const registerWithEmailFn = useServerFn(registerWithEmail);
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [callbackMessage, setCallbackMessage] = useState("Completing sign in…");

  const isCallback = location.pathname === "/auth/callback";

  useEffect(() => {
    if (!isCallback) return;
    let cancelled = false;

    async function completeAuth() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (!cancelled) setCallbackMessage("This sign-in link is invalid or expired.");
          window.setTimeout(() => navigate({ to: "/auth", replace: true }), 1200);
          return;
        }
      }

      const { data } = await supabase.auth.getUser();
      if (data.user) {
        navigate({ to: "/dashboard", replace: true });
        return;
      }

      if (!cancelled) setCallbackMessage("Please sign in to continue.");
      window.setTimeout(() => navigate({ to: "/auth", replace: true }), 800);
    }

    void completeAuth();
    return () => {
      cancelled = true;
    };
  }, [isCallback, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setFormError("Enter your email and password.");
      return;
    }

    setFormError(null);
    setLoading(true);
    try {
      if (mode === "sign_in") {
        const { data, error } = await withAuthTimeout(
          supabase.auth.signInWithPassword({ email: normalizedEmail, password }),
          "Sign in",
        );
        if (error) throw error;
        if (!data.session) throw new Error("Sign in did not return a session. Please try again.");
        void navigate({ to: "/dashboard", replace: true });
      } else {
        await withAuthTimeout(
          registerWithEmailFn({ data: { email: normalizedEmail, password } }),
          "Sign up",
        );
        const { data, error } = await withAuthTimeout(
          supabase.auth.signInWithPassword({ email: normalizedEmail, password }),
          "Sign in",
        );
        if (error) throw error;
        if (!data.session) throw new Error("Account created, but sign in did not return a session.");
        toast.success("Account created. You're signed in.");
        void navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      setFormError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (isCallback) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>AdsPro</CardTitle>
            <CardDescription>{callbackMessage}</CardDescription>
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">AdsPro</CardTitle>
          <CardDescription>
            {mode === "sign_in" ? "Sign in to your account" : "Create your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFormError(null);
                }}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFormError(null);
                }}
                autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait…" : mode === "sign_in" ? "Sign in" : "Sign up"}
            </Button>
          </form>
          <Button
            type="button"
            variant="ghost"
            className="mt-4 w-full text-muted-foreground"
            onClick={() => setMode(mode === "sign_in" ? "sign_up" : "sign_in")}
          >
            {mode === "sign_in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
