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
});

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
  });

  const pixelsQuery = useQuery({
    queryKey: ["meta-pixels", accountId, adAccountId],
    queryFn: () => {
      if (!adAccountId) throw new Error("Select an ad account first");
      return listMetaPixelsFn({ data: { accountId, adAccountId } });
    },
    enabled: !!accountId && !!adAccountId,
  });

  const save = async (datasetId: string) => {
    if (!adAccountId) return;
    setSaving(true);
    try {
      await saveFn({ data: { accountId, adAccountId, datasetId } });
      toast.success("Ad account and dataset saved");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save selection");
    } finally {
      setSaving(false);
    }
  };

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
          <p className="text-sm text-destructive">Missing account parameter.</p>
        ) : adAccountsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading ad accounts…</p>
        ) : adAccountsQuery.error ? (
          <p className="text-sm text-destructive">
            {adAccountsQuery.error instanceof Error
              ? adAccountsQuery.error.message
              : "Failed to load ad accounts"}
          </p>
        ) : (
          <div className="grid gap-3">
            {(adAccountsQuery.data ?? []).map((aa) => (
              <Card
                key={aa.id}
                className={adAccountId === aa.id ? "border-primary" : undefined}
              >
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
                    {pixelsQuery.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading datasets…</p>
                    ) : (pixelsQuery.data ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No datasets found for this ad account.
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
            {(adAccountsQuery.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                No ad accounts available for this Meta login.
              </p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
