import { useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listMetaAdAccounts,
  listMetaPixels,
  saveAdAccountSelection,
} from "@/lib/adspro.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/select-ad-account")({
  head: () => ({
    meta: [
      { title: "Select Meta Account — AdsPro" },
      { name: "description", content: "Choose the Meta ad account and dataset AdsPro will sync outcomes to." },
      { property: "og:title", content: "Select Meta Account — AdsPro" },
      { property: "og:description", content: "Choose the Meta ad account and dataset AdsPro will sync outcomes to." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SelectAdAccountPage,
  errorComponent: SelectAdAccountError,
});

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err ?? "Unknown error");
}

function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <p className="text-sm font-semibold text-destructive">{title}</p>
      <p className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-destructive/90">
        {message}
      </p>
    </div>
  );
}

function SelectAdAccountError({ error }: { error: unknown }) {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Select ad account</h1>
        <ErrorPanel title="This page failed to load" message={errorText(error)} />
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    </AppShell>
  );
}

function SelectAdAccountPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { account?: string };
  const accountId = search.account ?? "";
  const [adAccountId, setAdAccountId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const listMetaAdAccountsFn = useServerFn(listMetaAdAccounts);
  const listMetaPixelsFn = useServerFn(listMetaPixels);
  const saveFn = useServerFn(saveAdAccountSelection);

  const adAccountsQuery = useQuery({
    queryKey: ["meta-ad-accounts", accountId],
    queryFn: () => listMetaAdAccountsFn({ data: { accountId } }),
    enabled: !!accountId,
    retry: false,
  });

  const pixelsQuery = useQuery({
    queryKey: ["meta-pixels", accountId, adAccountId],
    queryFn: () => {
      if (!adAccountId) throw new Error("Select an ad account first");
      return listMetaPixelsFn({ data: { accountId, adAccountId } });
    },
    enabled: !!accountId && !!adAccountId,
    retry: false,
  });

  const save = async (datasetId: string) => {
    if (!adAccountId) return;
    setSaving(true);
    try {
      await saveFn({ data: { accountId, adAccountId, datasetId } });
      toast.success("Ad account and dataset saved");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const adAccounts = adAccountsQuery.data ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Select ad account</h1>
          <p className="text-sm text-muted-foreground">
            Choose which Meta ad account and dataset this connection uses.
          </p>
        </div>

        {!accountId ? (
          <ErrorPanel
            title="Missing account parameter"
            message="Open this page from the dashboard's “Choose ad account & dataset” button."
          />
        ) : adAccountsQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Loading ad accounts…</p>
        ) : adAccountsQuery.isError ? (
          <div className="space-y-3">
            <ErrorPanel
              title="Meta rejected the ad-accounts request"
              message={errorText(adAccountsQuery.error)}
            />
            <Button variant="outline" onClick={() => adAccountsQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : adAccounts.length === 0 ? (
          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium">No ad accounts found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The Facebook account you connected must be an admin of at least one ad account.
              Check permissions in Meta Business Settings, then reconnect.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {adAccounts.map((aa) => (
              <Card key={aa.id} className={adAccountId === aa.id ? "border-primary" : undefined}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">{aa.name}</CardTitle>
                      <CardDescription className="font-mono">{aa.id}</CardDescription>
                    </div>
                    <Button
                      variant={adAccountId === aa.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAdAccountId(aa.id)}
                    >
                      {adAccountId === aa.id ? "Selected" : "Select"}
                    </Button>
                  </div>
                </CardHeader>
                {adAccountId === aa.id && (
                  <CardContent className="space-y-2 border-t pt-4">
                    <p className="text-sm font-medium">Pick a dataset (pixel):</p>
                    {pixelsQuery.isPending ? (
                      <p className="text-sm text-muted-foreground">Loading datasets…</p>
                    ) : pixelsQuery.isError ? (
                      <div className="space-y-2">
                        <ErrorPanel
                          title="Meta rejected the datasets request"
                          message={errorText(pixelsQuery.error)}
                        />
                        <Button variant="outline" size="sm" onClick={() => pixelsQuery.refetch()}>
                          Retry
                        </Button>
                      </div>
                    ) : (pixelsQuery.data ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No datasets (pixels) found for this ad account. Create one in Meta Events
                        Manager, then retry.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {(pixelsQuery.data ?? []).map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between rounded-md border px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium">{p.name}</p>
                              <p className="font-mono text-xs text-muted-foreground">{p.id}</p>
                            </div>
                            <Button size="sm" disabled={saving} onClick={() => save(p.id)}>
                              Use this dataset
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
