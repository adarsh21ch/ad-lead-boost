import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createAccount, getMetaConnectUrl, getMyAccount } from "@/lib/adspro.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getTokenHealth } from "@/lib/token-health";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({
    meta: [
      { title: "Dashboard — AdsPro" },
      { name: "description", content: "Monitor Meta Lead Ads account setup and lead-outcome sync status in AdsPro." },
      { property: "og:title", content: "Dashboard — AdsPro" },
      { property: "og:description", content: "Monitor Meta Lead Ads account setup and lead-outcome sync status in AdsPro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function getMetaConnectErrorMessage(reason: string) {
  if (reason === "meta_denied") {
    return "You cancelled the Meta connection. Try again and press Continue.";
  }
  if (reason === "no_code" || reason === "state_missing" || reason === "state_mismatch") {
    return "The connection link expired or was tampered with. Please start Connect Meta again.";
  }
  if (reason === "not_authenticated") return "Your session expired. Log in and try again.";
  if (reason === "missing_app_config") {
    return "Server configuration problem — Meta app credentials missing.";
  }
  if (reason === "token_exchange_failed" || reason === "token_extend_failed") {
    return "Meta rejected the connection. This is usually a Redirect URI mismatch in the Meta app settings.";
  }
  if (reason === "db_write_failed") {
    return "Connected to Meta but could not save the account. Please retry.";
  }
  return `Connection failed (code: ${reason}).`;
}

/** "2 days ago" / "3 hours ago" — no date math for the reader to do. */
function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return plural(Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return plural(Math.floor(seconds / 3600), "hour");
  if (seconds < 2592000) return plural(Math.floor(seconds / 86400), "day");
  return plural(Math.floor(seconds / 2592000), "month");
}


function plural(n: number, unit: string) {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { meta_connect?: string; reason?: string };
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [expiringDismissed, setExpiringDismissed] = useState(false);


  const getMyAccountFn = useServerFn(getMyAccount);
  const createAccountFn = useServerFn(createAccount);
  const getMetaConnectUrlFn = useServerFn(getMetaConnectUrl);

  useEffect(() => {
    if (search.meta_connect !== "error") return;
    const reason = search.reason ?? "unknown";
    toast.error(getMetaConnectErrorMessage(reason));
    navigate({ to: "/dashboard", replace: true });
  }, [navigate, search.meta_connect, search.reason]);

  const { data: account, isLoading } = useQuery({
    queryKey: ["my-account"],
    queryFn: () => getMyAccountFn(),
  });

  const tokenHealth = getTokenHealth(account ?? {});
  const tokenState = account as
    | {
        token_status?: string | null;
        token_last_ok_at?: string | null;
        token_last_error?: string | null;
        token_invalid_since?: string | null;
      }
    | null
    | undefined;
  const tokenStatus = tokenState?.token_status ?? "unknown";
  const lastOkPhrase = relativeTime(tokenState?.token_last_ok_at);
  const brokenSince = relativeTime(tokenState?.token_invalid_since);
  const pageStatus =
    ((account as { page_subscribe_status?: string | null } | null | undefined)
      ?.page_subscribe_status ?? null) as string | null;


  const connectMeta = async () => {
    setBusy(true);
    try {
      let accountId = account?.id as string | undefined;
      if (!accountId) {
        const created = await createAccountFn({ data: { name: name.trim() || "My ad account" } });
        accountId = created.id;
      }
      const url = await getMetaConnectUrlFn({ data: { accountId } });
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start Meta connect");
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Connect Meta and monitor your lead-outcome sync.
          </p>
        </div>

        {account && tokenStatus === "invalid" && (
          <div
            role="alert"
            data-testid="token-invalid-banner"
            className="rounded-md border border-destructive bg-destructive/10 p-4"
          >
            <p className="font-semibold text-destructive">Lead syncing has stopped.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your Meta connection is no longer valid, so lead outcomes are not reaching Meta.
              Reconnect to resume.
            </p>
            {brokenSince && (
              <p className="mt-1 text-sm text-muted-foreground">Broken since {brokenSince}.</p>
            )}
            <Button onClick={connectMeta} disabled={busy} size="sm" className="mt-3">
              {busy ? "Redirecting…" : "Reconnect Meta"}
            </Button>
            {tokenState?.token_last_error && (
              <p className="mt-3 font-mono text-xs break-words text-muted-foreground">
                {tokenState.token_last_error}
              </p>
            )}
          </div>
        )}

        {account && tokenStatus === "expiring_soon" && !expiringDismissed && (
          <div
            role="status"
            className="rounded-md border border-amber-500/60 bg-amber-500/10 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Your Meta connection expires on{" "}
                {tokenHealth.expiresAt?.toLocaleDateString() ?? "an unknown date"}. Reconnect to
                avoid interruption.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setExpiringDismissed(true)}>
                Dismiss
              </Button>
            </div>
            <Button
              onClick={connectMeta}
              disabled={busy}
              size="sm"
              variant="outline"
              className="mt-3"
            >
              {busy ? "Redirecting…" : "Reconnect Meta"}
            </Button>
          </div>
        )}

        {isLoading ? (

          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !account ? (
          <Card>
            <CardHeader>
              <CardTitle>Connect Meta</CardTitle>
              <CardDescription>
                Create your workspace and connect your Meta ad account to start syncing lead
                outcomes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Workspace name (e.g. Acme Solar)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button onClick={connectMeta} disabled={busy}>
                {busy ? "Redirecting…" : "Connect Meta"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{account.name}</CardTitle>
                <Badge variant={account.status === "active" ? "default" : "secondary"}>
                  {account.status}
                </Badge>
              </div>
              <CardDescription>Your connected Meta workspace</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {tokenStatus === "invalid" ? (
                <p className="text-xs text-destructive">
                  Connection broken{brokenSince ? ` ${brokenSince}` : ""} — reconnect Meta above.
                </p>
              ) : lastOkPhrase ? (
                <p className="text-xs text-muted-foreground">
                  Connection verified {lastOkPhrase}
                  {tokenHealth.expiresAt
                    ? ` · token valid until ${tokenHealth.expiresAt.toLocaleDateString()}`
                    : ""}
                </p>
              ) : tokenHealth.state === "healthy" ? (
                <p className="text-xs text-muted-foreground">
                  Token valid until {tokenHealth.expiresAt?.toLocaleDateString()} (
                  {tokenHealth.daysRemaining} days)
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Connection not verified yet — reconnect Meta if lead-sync stops.
                </p>
              )}

              <div className="flex justify-between">
                <span className="text-muted-foreground">Ad account</span>
                <span className="font-mono">{account.meta_ad_account_id ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dataset</span>
                <span className="font-mono">{account.meta_dataset_id ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Page</span>
                {pageStatus === "subscribed" ? (
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Connected ✓
                  </span>
                ) : pageStatus === "failed" ? (
                  <Link
                    to="/dashboard/integration"
                    className="font-medium text-destructive underline"
                  >
                    Connection failed — fix it
                  </Link>
                ) : (
                  <Link
                    to="/dashboard/integration"
                    className="font-medium text-amber-600 underline dark:text-amber-400"
                  >
                    Not connected
                  </Link>
                )}
              </div>
              {account.status !== "active" && (
                <Button onClick={connectMeta} disabled={busy} className="mt-2">
                  {busy ? "Redirecting…" : "Connect Meta"}
                </Button>
              )}
              {account.status === "active" && !account.meta_dataset_id && (
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    navigate({ to: "/dashboard/select-ad-account", search: { account: account.id } });
                  }}
                >
                  Choose ad account & dataset
                </Button>
              )}
              <div className="mt-3 flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/dashboard/integration">Manage integration</Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["my-account"] })}
                >
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
