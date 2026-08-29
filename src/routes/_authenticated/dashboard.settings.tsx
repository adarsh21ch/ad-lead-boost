import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSettingsOverview } from "@/lib/adspro.functions";
import { adAccountLabel } from "@/lib/ad-account-label";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { getTokenHealth } from "@/lib/token-health";

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  head: () => ({
    meta: [
      { title: "Settings — AdsPro" },
      {
        name: "description",
        content:
          "Manage your AdsPro account: view your Meta connection, disconnect Meta, or permanently delete your account and all data.",
      },
      { property: "og:title", content: "Settings — AdsPro" },
      {
        property: "og:description",
        content:
          "Manage your AdsPro account: view your Meta connection, disconnect Meta, or delete your account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const overviewFn = useServerFn(getSettingsOverview);

  const { data, isLoading } = useQuery({
    queryKey: ["settings-overview"],
    queryFn: () => overviewFn(),
  });

  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const account = data?.account ?? null;
  const connected = Boolean(account?.meta_ad_account_id || account?.meta_dataset_id);
  const tokenHealth = getTokenHealth(account ?? {});

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const disconnectMeta = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/public/account/disconnect-meta", { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; message?: string; error?: string }
        | null;
      if (!body?.ok) {
        toast.error(body?.message ?? body?.error ?? "Could not disconnect Meta");
        return;
      }
      setDisconnectOpen(false);
      queryClient.clear();
      toast.success("Meta disconnected.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect Meta");
    } finally {
      setDisconnecting(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/public/account/delete", { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; message?: string; error?: string }
        | null;
      if (!body?.ok) {
        toast.error(body?.message ?? body?.error ?? "Could not delete your account");
        setDeleting(false);
        return;
      }
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      toast.success("Your account and all data have been deleted.");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete your account");
      setDeleting(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account, your Meta connection, and permanent deletion.
          </p>
        </div>

        {/* Section 1 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your account</CardTitle>
            <CardDescription>The email and account name AdsPro has on file.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Row label="Email" value={isLoading ? "…" : (data?.email ?? "—")} />
              <Row label="Account name" value={isLoading ? "…" : (account?.name ?? "—")} />
            </div>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </CardContent>
        </Card>

        {/* Section 2 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meta connection</CardTitle>
            <CardDescription>
              Disconnecting is reversible — your lead history is never affected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : connected ? (
              <>
                <div>
                  <Row
                    label="Ad account"
                    value={adAccountLabel({
                      id: account?.meta_ad_account_id,
                      name: (account as { meta_ad_account_name?: string | null } | null | undefined)
                        ?.meta_ad_account_name,
                    })}
                  />

                  <Row label="Dataset" value={account?.meta_dataset_id ?? "—"} />
                  <Row
                    label="Page"
                    value={
                      data?.pageName ??
                      account?.meta_page_id ??
                      "Not connected"
                    }
                  />
                  <Row
                    label="Token valid until"
                    value={
                      tokenHealth.expiresAt ? tokenHealth.expiresAt.toLocaleDateString() : "Unknown"
                    }
                  />
                </div>
                <Button
                  variant="outline"
                  className="border-amber-500/60 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-400"
                  onClick={() => setDisconnectOpen(true)}
                >
                  Disconnect Meta
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No Meta account connected.{" "}
                <Link
                  to="/dashboard/integration"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Go to Integration
                </Link>
              </p>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect Meta?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>New leads will stop arriving and lead outcomes will stop syncing to Meta.</p>
                  <p>Your existing lead history stays in AdsPro.</p>
                  <p>You can reconnect at any time from the Integration page.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void disconnectMeta();
                }}
                disabled={disconnecting}
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Section 3 */}
        <div className="pt-6">
          <Card className="border-destructive/60">
            <CardHeader>
              <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Deleting your account permanently removes your AdsPro account, every lead, every
                status event, and every delivery record. This cannot be undone.
              </p>
              <div className="space-y-2">
                <label
                  htmlFor="delete-confirm"
                  className="block text-sm font-medium text-foreground"
                >
                  Type DELETE to confirm
                </label>
                <Input
                  id="delete-confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="max-w-xs"
                  autoComplete="off"
                />
              </div>
              <Button
                variant="destructive"
                disabled={confirmText.trim() !== "DELETE" || deleting}
                onClick={() => void deleteAccount()}
              >
                {deleting ? "Deleting…" : "Delete my account and all data"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
