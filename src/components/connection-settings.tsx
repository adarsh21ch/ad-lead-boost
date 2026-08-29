import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMetaPixels } from "@/lib/adspro.functions";
import {
  getSyncStatus,
  requestSyncNow,
  validateAndSaveAdAccount,
  validateAndSaveDataset,
} from "@/lib/connection.functions";
import { metaErrorCopy } from "@/lib/meta-error-copy";
import { adAccountLabel, adAccountPrimary } from "@/lib/ad-account-label";
import { AdAccountIdentityLines } from "@/components/ad-account-identity";
import { AdAccountList } from "@/components/ad-account-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export type ConnectionAccount = {
  id: string;
  meta_ad_account_id?: string | null;
  meta_ad_account_name?: string | null;
  meta_dataset_id?: string | null;
  meta_dataset_name?: string | null;
};

function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return plural(Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return plural(Math.floor(seconds / 3600), "hour");
  return plural(Math.floor(seconds / 86400), "day");
}

function plural(n: number, unit: string) {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/**
 * Ad account — name first, id second, and the chooser opens as a dialog so the
 * user never leaves Integration. The list itself is the shared AdAccountList,
 * the same component the /dashboard/select-ad-account route renders.
 */
export function AdAccountCard({ account }: { account: ConnectionAccount }) {
  const queryClient = useQueryClient();
  const saveAdAccountFn = useServerFn(validateAndSaveAdAccount);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (adAccountId: string) => {
    setSaving(adAccountId);
    setError(null);
    try {
      const result = await saveAdAccountFn({ data: { accountId: account.id, adAccountId } });
      if (!result.ok) {
        setError(metaErrorCopy(result.error));
        return;
      }
      toast.success(
        `Ad account saved: ${adAccountLabel({
          id: result.account.meta_ad_account_id,
          name: result.account.meta_ad_account_name,
        })}`,
      );
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["integration-account"] });
      await queryClient.invalidateQueries({ queryKey: ["my-account"] });
      await queryClient.invalidateQueries({ queryKey: ["my-accounts"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch the ad account");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ad account</CardTitle>
        <CardDescription>Where spend and performance data are read from.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <AdAccountIdentityLines
          id={account.meta_ad_account_id}
          name={account.meta_ad_account_name}
        />
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Change ad account
        </Button>
        <p className="text-xs text-muted-foreground">
          Spend and performance data will now come from the new ad account. Your leads are
          unaffected — those arrive from your connected Facebook Page, and your dataset stays as it
          is.
        </p>

        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setError(null);
          }}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Change ad account</DialogTitle>
              <DialogDescription>
                Your dataset and Facebook Page are left untouched.
              </DialogDescription>
            </DialogHeader>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <AdAccountList
              accountId={account.id}
              actionSlot={(option) => (
                <Button
                  size="sm"
                  disabled={saving !== null || option.id === account.meta_ad_account_id}
                  onClick={() => save(option.id)}
                >
                  {saving === option.id
                    ? "Checking…"
                    : option.id === account.meta_ad_account_id
                      ? "In use"
                      : "Use this ad account"}
                </Button>
              )}
            />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}


const EVENTS_MANAGER_URL = "https://business.facebook.com/events_manager2/";

/**
 * Pixel (dataset) — always states what is currently connected, and when the stored
 * dataset is not among the datasets available on this ad account's business, says so
 * plainly instead of implying nothing is connected. The stored selection is never
 * auto-cleared: delivery keeps working through the connected pixel.
 */
function DatasetCard({ account }: { account: ConnectionAccount }) {
  const queryClient = useQueryClient();
  const listPixelsFn = useServerFn(listMetaPixels);
  const saveDatasetFn = useServerFn(validateAndSaveDataset);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pixelsQuery = useQuery({
    queryKey: ["connection-datasets", account.id, account.meta_ad_account_id],
    queryFn: () =>
      listPixelsFn({
        data: { accountId: account.id, adAccountId: account.meta_ad_account_id! },
      }),
    enabled: Boolean(account.meta_ad_account_id),
    retry: false,
  });

  const datasets = pixelsQuery.data?.ok ? pixelsQuery.data.data : [];
  const listError = pixelsQuery.data && !pixelsQuery.data.ok ? pixelsQuery.data.error : null;

  const connectedName = account.meta_dataset_name?.trim() || null;
  const connectedId = account.meta_dataset_id?.trim() || null;
  const adAccountName =
    adAccountPrimary({ id: account.meta_ad_account_id, name: account.meta_ad_account_name }) ??
    "this ad account";

  // Mismatch: something is connected, the list loaded cleanly, and the stored id is
  // not offered by this ad account's business.
  const listLoaded = Boolean(pixelsQuery.data?.ok);
  const mismatch =
    Boolean(connectedId) && listLoaded && !datasets.some((d) => d.id === connectedId);

  const save = async (datasetId: string) => {
    setSaving(datasetId);
    setError(null);
    try {
      const result = await saveDatasetFn({ data: { accountId: account.id, datasetId } });
      if (!result.ok) {
        setError(metaErrorCopy(result.error));
        return;
      }
      toast.success(`Pixel saved: ${result.account.meta_dataset_name ?? result.account.meta_dataset_id}`);
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["integration-account"] });
      await queryClient.invalidateQueries({ queryKey: ["my-account"] });
      await queryClient.invalidateQueries({ queryKey: ["my-accounts"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the dataset");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pixel (dataset)</CardTitle>
        <CardDescription>Where Conversions API events are delivered.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Always show what is connected — name first, id second, never a bare "Selected". */}
        {connectedName || connectedId ? (
          <div>
            <p className="text-sm font-medium">{connectedName ?? connectedId}</p>
            {connectedName && connectedId ? (
              <p className="font-mono text-xs text-muted-foreground">{connectedId}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm font-medium">Not set</p>
        )}

        {mismatch ? (
          <div className="rounded-md border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
            <p className="font-semibold">
              This pixel belongs to a different business than your ad account.
            </p>
            <p className="mt-1 text-muted-foreground">
              Events are still being delivered to {connectedName ?? connectedId}, so your data is
              not lost. But Meta will not use them to optimise ads in {adAccountName}, because a
              pixel only influences ad accounts in its own business.
            </p>
            <p className="mt-2 text-muted-foreground">
              <span className="font-semibold text-foreground">To fix:</span> create a dataset in
              this ad account's Business portfolio in{" "}
              <a
                className="underline"
                href={EVENTS_MANAGER_URL}
                target="_blank"
                rel="noreferrer"
              >
                Events Manager
              </a>
              , or share the existing one with it — then select it here.
            </p>
          </div>
        ) : null}

        {!open ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Change dataset
          </Button>
        ) : (
          <div className="space-y-2">
            {pixelsQuery.isPending ? (
              <p className="text-sm text-muted-foreground">Loading datasets…</p>
            ) : listError ? (
              <p className="text-sm text-destructive">{metaErrorCopy(listError)}</p>
            ) : datasets.length === 0 ? (
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  No datasets are available on {adAccountName} or its Business portfolio, so there
                  is nothing to choose from here yet.
                </p>
                <p>
                  Create one in{" "}
                  <a
                    className="underline"
                    href={EVENTS_MANAGER_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Events Manager
                  </a>{" "}
                  (or share an existing dataset with this ad account's business), then come back
                  and select it.
                </p>
              </div>
            ) : (
              datasets.map((dataset) => (
                <div
                  key={dataset.id}
                  className="flex items-center justify-between gap-4 rounded-md border px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{dataset.name ?? dataset.id}</p>
                    <p className="font-mono text-xs text-muted-foreground">{dataset.id}</p>
                  </div>
                  <Button
                    size="sm"
                    disabled={saving !== null || dataset.id === account.meta_dataset_id}
                    onClick={() => save(dataset.id)}
                  >
                    {saving === dataset.id
                      ? "Checking…"
                      : dataset.id === account.meta_dataset_id
                        ? "In use"
                        : "Use this dataset"}
                  </Button>
                </div>
              ))
            )}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


/** Sync health — verdict straight from the view, "Sync now" through the RPC. */
function SyncHealthCard({ account }: { account: ConnectionAccount }) {
  const getStatusFn = useServerFn(getSyncStatus);
  const requestSyncFn = useServerFn(requestSyncNow);
  const [polling, setPolling] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["insights-sync-status", account.id],
    queryFn: () => getStatusFn({ data: { accountId: account.id } }),
    refetchInterval: polling ? 3_000 : 60_000,
  });

  const status = statusQuery.data;

  useEffect(() => {
    if (!polling) return;
    const stop = setTimeout(() => setPolling(false), 30_000);
    return () => clearTimeout(stop);
  }, [polling]);

  const syncNow = async () => {
    setNote(null);
    try {
      const result = await requestSyncFn({ data: { accountId: account.id, days: 7 } });
      if (result?.ok && result.queued) {
        setNote("Sync started — waiting for the result…");
        setPolling(true);
        return;
      }
      if (result?.reason === "cooldown") {
        setNote(`Just synced, try again in ${result.retry_after_seconds ?? 60} seconds`);
        return;
      }
      setNote("Could not start a sync right now. Please try again.");
    } catch {
      setNote("Could not start a sync right now. Please try again.");
    }
  };

  const last = relativeTime(status?.finished_at ?? status?.started_at ?? null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Data collection</CardTitle>
        <CardDescription>Whether AdsPro is still pulling spend from Meta.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {statusQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !status ? (
          <p className="text-sm text-muted-foreground">
            No sync has run yet for this account.
          </p>
        ) : (
          <>
            <p className="text-sm font-medium">{status.verdict ?? "Unknown"}</p>
            <p className="text-sm text-muted-foreground">
              Last sync {last ?? "—"}
              {status.rows_written != null ? ` · ${status.rows_written} rows written` : ""}
            </p>
          </>
        )}
        <div className="flex items-center gap-3 pt-1">
          <Button size="sm" variant="outline" onClick={syncNow} disabled={polling}>
            {polling ? "Syncing…" : "Sync now"}
          </Button>
          {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function ConnectionSettings({ account }: { account: ConnectionAccount }) {
  return (
    <div className="space-y-4">
      <AdAccountCard account={account} />
      <DatasetCard account={account} />
      <SyncHealthCard account={account} />
    </div>
  );
}
