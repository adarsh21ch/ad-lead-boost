import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMetaConnectUrl,
  listMetaAdAccounts,
  listMetaPixels,
  saveAdAccountSelection,
} from "@/lib/adspro.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type MetaError = {
  message: string;
  code: number | null;
  errorSubcode: number | null;
  fbtraceId: string | null;
  httpStatus: number | null;
  rawResponse: string | null;
};

const plainError = (error: unknown): MetaError => ({
  message: error instanceof Error ? error.message : String(error ?? "Unknown error"),
  code: null,
  errorSubcode: null,
  fbtraceId: null,
  httpStatus: null,
  rawResponse: null,
});

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

function ErrorPanel({ title, error, onDismiss }: { title: string; error: MetaError; onDismiss?: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-destructive">{title}</p>
          <p className="mt-1 break-words text-sm text-destructive/90">{error.message}</p>
        </div>
        {onDismiss ? <Button variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-destructive/90">
        {error.code != null ? <span>code: {error.code}</span> : null}
        {error.errorSubcode != null ? <span>subcode: {error.errorSubcode}</span> : null}
        {error.fbtraceId ? <span>fbtrace_id: {error.fbtraceId}</span> : null}
        {error.httpStatus != null ? <span>HTTP: {error.httpStatus}</span> : null}
      </div>
      {error.rawResponse ? (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-medium text-destructive">Raw Meta response</summary>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-foreground">{error.rawResponse}</pre>
        </details>
      ) : null}
    </div>
  );
}

function SelectAdAccountError({ error }: { error: unknown }) {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold">Select ad account</h1>
        <ErrorPanel title="This page failed to load" error={plainError(error)} />
        <Button variant="outline" onClick={() => window.location.reload()}>Try again</Button>
      </div>
    </AppShell>
  );
}

function SelectAdAccountPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { account?: string };
  const accountId = search.account ?? "";
  const [adAccountId, setAdAccountId] = useState<string | null>(null);
  const [savingDatasetId, setSavingDatasetId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dismissedAdError, setDismissedAdError] = useState(false);
  const [dismissedPixelError, setDismissedPixelError] = useState(false);

  const listAdAccounts = useServerFn(listMetaAdAccounts);
  const listPixels = useServerFn(listMetaPixels);
  const saveSelection = useServerFn(saveAdAccountSelection);
  const getConnectUrl = useServerFn(getMetaConnectUrl);

  const adAccountsQuery = useQuery({
    queryKey: ["meta-ad-accounts", accountId],
    queryFn: () => listAdAccounts({ data: { accountId } }),
    enabled: Boolean(accountId),
    retry: false,
  });
  const adAccounts = adAccountsQuery.data?.ok ? adAccountsQuery.data.data : [];
  const selectedAdAccount = adAccounts.find((account) => account.id === adAccountId);

  const pixelsQuery = useQuery({
    queryKey: ["meta-pixels", accountId, adAccountId, selectedAdAccount?.business?.id],
    queryFn: () => {
      if (!adAccountId) throw new Error("Select an ad account first");
      const businessId = selectedAdAccount?.business?.id;
      return listPixels({
        data: businessId ? { accountId, adAccountId, businessId } : { accountId, adAccountId },
      });
    },
    enabled: Boolean(accountId && adAccountId),
    retry: false,
  });

  useEffect(() => setDismissedAdError(false), [adAccountsQuery.dataUpdatedAt]);
  useEffect(() => {
    setDismissedPixelError(false);
    setSaveError(null);
  }, [adAccountId, pixelsQuery.dataUpdatedAt]);

  const adError = adAccountsQuery.data && !adAccountsQuery.data.ok
    ? adAccountsQuery.data.error
    : adAccountsQuery.isError ? plainError(adAccountsQuery.error) : null;
  const pixelError = pixelsQuery.data && !pixelsQuery.data.ok
    ? pixelsQuery.data.error
    : pixelsQuery.isError ? plainError(pixelsQuery.error) : null;
  const pixels = pixelsQuery.data?.ok ? pixelsQuery.data.data : [];

  const reconnectMeta = async () => {
    try {
      const url = await getConnectUrl({ data: { accountId } });
      window.location.href = url;
    } catch (error) {
      setSaveError(plainError(error).message);
    }
  };

  const save = async (datasetId: string) => {
    if (!adAccountId) return;
    setSavingDatasetId(datasetId);
    setSaveError(null);
    try {
      const result = await saveSelection({ data: { accountId, adAccountId, datasetId } });
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["my-account"] });
      toast.success("Ad account and dataset saved");
      navigate({ to: "/dashboard" });
    } catch (error) {
      setSaveError(plainError(error).message);
    } finally {
      setSavingDatasetId(null);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Select ad account</h1>
          <p className="text-sm text-muted-foreground">Choose which Meta ad account and dataset this connection uses.</p>
        </div>

        {!accountId ? (
          <ErrorPanel title="Missing account parameter" error={plainError("Open this page from the dashboard’s Choose ad account & dataset button.")} />
        ) : adAccountsQuery.isPending ? (
          <div className="rounded-lg border p-5"><p className="text-sm font-medium">Loading ad accounts…</p></div>
        ) : adError && !dismissedAdError ? (
          <div className="space-y-3">
            <ErrorPanel title="Meta rejected the ad-accounts request" error={adError} onDismiss={() => setDismissedAdError(true)} />
            <div className="flex gap-2">
              {adError.code === 190 ? <Button onClick={reconnectMeta}>Reconnect Meta</Button> : null}
              <Button variant="outline" onClick={() => adAccountsQuery.refetch()}>Retry</Button>
            </div>
          </div>
        ) : adAccounts.length === 0 ? (
          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium">No ad accounts found for this Meta user.</p>
            <p className="mt-1 text-sm text-muted-foreground">Check that this Facebook account has a Business role on an ad account.</p>
            {adAccountsQuery.data?.ok ? (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer font-medium">Raw Meta response</summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3">{adAccountsQuery.data.rawResponse}</pre>
              </details>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3">
            {adAccounts.map((account) => (
              <Card key={account.id} className={adAccountId === account.id ? "border-primary" : undefined}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">{account.name}</CardTitle>
                      <CardDescription className="font-mono">{account.id}</CardDescription>
                    </div>
                    <Button variant={adAccountId === account.id ? "default" : "outline"} size="sm" onClick={() => setAdAccountId(account.id)}>
                      {adAccountId === account.id ? "Selected" : "Select"}
                    </Button>
                  </div>
                </CardHeader>
                {adAccountId === account.id ? (
                  <CardContent className="space-y-3 border-t pt-4">
                    <p className="text-sm font-medium">Pick a dataset (pixel):</p>
                    {pixelsQuery.isPending ? (
                      <p className="text-sm text-muted-foreground">Loading datasets…</p>
                    ) : pixelError && !dismissedPixelError ? (
                      <div className="space-y-2">
                        <ErrorPanel title="Meta rejected the datasets request" error={pixelError} onDismiss={() => setDismissedPixelError(true)} />
                        <div className="flex gap-2">
                          {pixelError.code === 190 ? <Button size="sm" onClick={reconnectMeta}>Reconnect Meta</Button> : null}
                          <Button variant="outline" size="sm" onClick={() => pixelsQuery.refetch()}>Retry</Button>
                        </div>
                      </div>
                    ) : pixels.length === 0 ? (
                      <div>
                        <p className="text-sm text-muted-foreground">No datasets or pixels were found for this ad account or its Business portfolio.</p>
                        {pixelsQuery.data?.ok ? (
                          <details className="mt-3 text-xs">
                            <summary className="cursor-pointer font-medium">Raw Meta response</summary>
                            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3">{pixelsQuery.data.rawResponses.join("\n\n")}</pre>
                          </details>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pixelsQuery.data?.ok && pixelsQuery.data.warnings.length > 0 && !dismissedPixelError && pixelsQuery.data.warnings[0] ? (
                          <ErrorPanel title="Some Business dataset sources could not be read" error={pixelsQuery.data.warnings[0]} onDismiss={() => setDismissedPixelError(true)} />
                        ) : null}
                        {saveError ? <ErrorPanel title="Could not save this selection" error={plainError(saveError)} onDismiss={() => setSaveError(null)} /> : null}
                        {pixels.map((pixel) => (
                          <div key={pixel.id} className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
                            <div>
                              <p className="text-sm font-medium">{pixel.name}</p>
                              <p className="font-mono text-xs text-muted-foreground">{pixel.id}</p>
                            </div>
                            <Button size="sm" disabled={savingDatasetId !== null} onClick={() => save(pixel.id)}>
                              {savingDatasetId === pixel.id ? "Saving…" : "Use this dataset"}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}