import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createAccount, getMetaConnectUrl, getMyAccount } from "@/lib/adspro.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
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

function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { meta_connect?: string; reason?: string };
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

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
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ad account</span>
                <span className="font-mono">{account.meta_ad_account_id ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dataset</span>
                <span className="font-mono">{account.meta_dataset_id ?? "—"}</span>
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
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["my-account"] })}
              >
                Refresh
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
