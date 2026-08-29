import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listMetaPixels,
  saveAdAccountSelection,
} from "@/lib/adspro.functions";
import { validateAndSaveAdAccount } from "@/lib/connection.functions";
import { metaErrorCopy } from "@/lib/meta-error-copy";
import { adAccountLabel } from "@/lib/ad-account-label";
import { AdAccountList, type MetaAdAccountOption } from "@/components/ad-account-list";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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
  const search = useSearch({ strict: false }) as { account?: string; only?: string };
  const accountId = search.account ?? "";
  // "only=adaccount" is the deep-link form of the Integration dialog: swap the ad
  // account and leave the existing dataset untouched.
  const adAccountOnly = search.only === "adaccount";
  const [savingAdAccountId, setSavingAdAccountId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MetaAdAccountOption | null>(null);
  const [savingDatasetId, setSavingDatasetId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dismissedPixelError, setDismissedPixelError] = useState(false);

  const listPixels = useServerFn(listMetaPixels);
  const saveSelection = useServerFn(saveAdAccountSelection);
  const saveAdAccountOnly = useServerFn(validateAndSaveAdAccount);

  const adAccountId = selected?.id ?? null;

  const pixelsQuery = useQuery({
    queryKey: ["meta-pixels", accountId, adAccountId, selected?.business?.id],
    queryFn: () => {
      if (!adAccountId) throw new Error("Select an ad account first");
      const businessId = selected?.business?.id;
      return listPixels({
        data: businessId ? { accountId, adAccountId, businessId } : { accountId, adAccountId },
      });
    },
    enabled: Boolean(accountId && adAccountId) && !adAccountOnly,
    retry: false,
  });

  useEffect(() => {
    setDismissedPixelError(false);
    setSaveError(null);
  }, [adAccountId, pixelsQuery.dataUpdatedAt]);

  const pixelError = pixelsQuery.data && !pixelsQuery.data.ok
    ? pixelsQuery.data.error
    : pixelsQuery.isError ? plainError(pixelsQuery.error) : null;
  const pixels = pixelsQuery.data?.ok ? pixelsQuery.data.data : [];

  const saveAdAccount = async (option: MetaAdAccountOption) => {
    setSavingAdAccountId(option.id);
    setSaveError(null);
    try {
      const result = await saveAdAccountOnly({ data: { accountId, adAccountId: option.id } });
      if (!result.ok) {
        setSaveError(metaErrorCopy(result.error));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["my-account"] });
      await queryClient.invalidateQueries({ queryKey: ["my-accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["integration-account"] });
      toast.success(
        `Ad account saved: ${adAccountLabel({
          id: result.account.meta_ad_account_id,
          name: result.account.meta_ad_account_name,
        })}`,
      );
      navigate({ to: "/dashboard/integration" });
    } catch (error) {
      setSaveError(plainError(error).message);
    } finally {
      setSavingAdAccountId(null);
    }
  };

  const save = async (datasetId: string) => {
    if (!adAccountId) return;
    setSavingDatasetId(datasetId);
    setSaveError(null);
    try {
      const result = await saveSelection({
        data: {
          accountId,
          adAccountId,
          datasetId,
          adAccountName: selected?.name ?? null,
          datasetName: pixels.find((p) => p.id === datasetId)?.name ?? null,
        },
      });
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["my-account"] });
      await queryClient.invalidateQueries({ queryKey: ["my-accounts"] });
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
        {/* No dead ends: there is always a way back out of this page. */}
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dashboard/integration">← Back to Integration</Link>
        </Button>

        <div>
          <h1 className="text-2xl font-bold">Select ad account</h1>
          <p className="text-sm text-muted-foreground">
            {adAccountOnly
              ? "Spend and performance data will now come from the new ad account. Your leads are unaffected — those arrive from your connected Facebook Page."
              : "Choose which Meta ad account and dataset this connection uses."}
          </p>
        </div>

        {!accountId ? (
          <ErrorPanel title="Missing account parameter" error={plainError("Open this page from the dashboard’s Choose ad account & dataset button.")} />
        ) : (
          <>
            {saveError ? (
              <ErrorPanel
                title={adAccountOnly ? "Could not switch ad account" : "Could not save this selection"}
                error={plainError(saveError)}
                onDismiss={() => setSaveError(null)}
              />
            ) : null}

            <AdAccountList
              accountId={accountId}
              selectedId={adAccountOnly ? null : adAccountId}
              actionSlot={(option) =>
                adAccountOnly ? (
                  <Button
                    size="sm"
                    disabled={savingAdAccountId !== null}
                    onClick={() => saveAdAccount(option)}
                  >
                    {savingAdAccountId === option.id ? "Checking…" : "Use this ad account"}
                  </Button>
                ) : (
                  <Button
                    variant={adAccountId === option.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelected(option)}
                  >
                    {adAccountId === option.id ? "Selected" : "Select"}
                  </Button>
                )
              }
              expandedSlot={() => (
                <>
                  <p className="text-sm font-medium">Pick a pixel (dataset):</p>
                  {pixelsQuery.isPending ? (
                    <p className="text-sm text-muted-foreground">Loading datasets…</p>
                  ) : pixelError && !dismissedPixelError ? (
                    <div className="space-y-2">
                      <ErrorPanel title="Meta rejected the datasets request" error={pixelError} onDismiss={() => setDismissedPixelError(true)} />
                      <Button variant="outline" size="sm" onClick={() => pixelsQuery.refetch()}>Retry</Button>
                    </div>
                  ) : pixels.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No datasets or pixels were found for this ad account or its Business portfolio.
                    </p>
                  ) : (
                    <div className="space-y-2">
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
                </>
              )}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
