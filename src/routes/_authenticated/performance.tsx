import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMyAccounts } from "@/lib/adspro.functions";
import { AppShell } from "@/components/app-shell";
import { AdAccountIdentityLines } from "@/components/ad-account-identity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { adAccountPrimary } from "@/lib/ad-account-label";
import {
  aggregateRows,
  daysAgo,
  formatMoney,
  formatNumber,
  formatPercent,
  relativeTime,
  toDateInput,
  totalsFromAggregates,
  type PerfAggregate,
  type PerfLevel,
  type PerfRow,
} from "@/lib/performance";

const DESCRIPTION =
  "See what each campaign, ad set and ad actually produced — cost per qualified lead, per booking and per purchase.";

export const Route = createFileRoute("/_authenticated/performance")({
  head: () => ({
    meta: [
      { title: "Ad performance — AdsPro" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Ad performance — AdsPro" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PerformancePage,
});

type SortKey =
  | "name"
  | "spend"
  | "qualified"
  | "costPerLead"
  | "costPerQualifiedLead"
  | "qualificationRate"
  | "purchased"
  | "costPerPurchase";

/** An entity the user has drilled into. */
type DrillNode = { level: "campaign" | "adset"; id: string; name: string };

/** Anything not in one of these is not currently putting money in front of people. */
const DELIVERING = new Set(["ACTIVE", "IN_PROCESS", "PENDING_REVIEW", "PREAPPROVED"]);
const isDelivering = (status: string | null) =>
  !status || DELIVERING.has(status.toUpperCase());

const LEVEL_LABEL: Record<PerfLevel, string> = {
  campaign: "Campaigns",
  adset: "Ad sets",
  ad: "Ads",
};

function PerformancePage() {
  const [preset, setPreset] = useState<"7" | "28" | "custom">("7");
  const [customFrom, setCustomFrom] = useState(toDateInput(daysAgo(7)));
  const [customTo, setCustomTo] = useState(toDateInput(new Date()));
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDesc, setSortDesc] = useState(true);
  const [chosenAdAccount, setChosenAdAccount] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillNode[]>([]);

  const { from, to } = useMemo(() => {
    if (preset === "custom") return { from: customFrom, to: customTo };
    const days = preset === "7" ? 7 : 28;
    return { from: toDateInput(daysAgo(days)), to: toDateInput(new Date()) };
  }, [preset, customFrom, customTo]);

  // Every AdsPro account this user owns — a user may own more than one.
  const listAccountsFn = useServerFn(listMyAccounts);
  const accountsQuery = useQuery({
    queryKey: ["my-accounts"],
    queryFn: () => listAccountsFn(),
  });

  // Which Meta ad accounts actually appear in the warehouse (spend side).
  const adAccountsQuery = useQuery({
    queryKey: ["perf-ad-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_performance_daily")
        .select("meta_ad_account_id, meta_ad_account_name")
        .limit(5000);
      if (error) throw error;
      const seen = new Map<string, { id: string; name: string | null }>();
      for (const row of data ?? []) {
        if (!row.meta_ad_account_id) continue;
        const existing = seen.get(row.meta_ad_account_id);
        if (!existing || (!existing.name && row.meta_ad_account_name)) {
          seen.set(row.meta_ad_account_id, {
            id: row.meta_ad_account_id,
            name: row.meta_ad_account_name ?? null,
          });
        }
      }
      return [...seen.values()].sort((a, b) =>
        (adAccountPrimary(a) ?? "").localeCompare(adAccountPrimary(b) ?? ""),
      );
    },
  });

  const adAccounts = adAccountsQuery.data ?? [];
  // With one ad account there is nothing to choose; it is a label, not a control.
  const activeAdAccountId =
    adAccounts.length === 0
      ? null
      : adAccounts.length === 1
        ? adAccounts[0]!.id
        : (chosenAdAccount ?? adAccounts[0]!.id);
  const activeAdAccount = adAccounts.find((a) => a.id === activeAdAccountId) ?? null;

  // Switching ad account invalidates any drill path built inside the previous one.
  useEffect(() => setDrill([]), [activeAdAccountId]);

  const level: PerfLevel =
    drill.length === 0 ? "campaign" : drill.length === 1 ? "adset" : "ad";
  const parentId = drill.length > 0 ? drill[drill.length - 1]!.id : null;

  // Per-account sync status is defined below, once we know which AdsPro account
  // rows belong to the ad account selected on this screen.


  // One row per entity per day, for exactly ONE level. Levels are never summed
  // together — campaign, adset and ad rows all count the same leads.
  const perfQuery = useQuery({
    queryKey: ["ad-performance-daily", level, parentId, activeAdAccountId, from, to],
    queryFn: async () => {
      let query = supabase
        .from("ad_performance_daily")
        .select("*")
        .eq("level", level)
        .gte("stat_date", from)
        .lte("stat_date", to);
      if (activeAdAccountId) query = query.eq("meta_ad_account_id", activeAdAccountId);
      if (parentId) query = query.eq("parent_id", parentId);
      const { data, error } = await query.order("stat_date", { ascending: false }).limit(5000);
      if (error) throw error;
      return (data ?? []) as PerfRow[];
    },
  });

  const anyInsightsQuery = useQuery({
    queryKey: ["ad-insights-any"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_insights_current")
        .select("entity_id, attribution_window, snapshot_at")
        .order("snapshot_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  // AdsPro account rows wired to the selected Meta ad account — used to scope the
  // funnel, which is counted from leads/status_events rather than the warehouse.
  const scopedAccountIds = useMemo(() => {
    if (!activeAdAccountId) return null;
    const ids = (accountsQuery.data ?? [])
      .filter((a) => a.meta_ad_account_id === activeAdAccountId)
      .map((a) => a.id);
    return ids.length > 0 ? ids : null;
  }, [accountsQuery.data, activeAdAccountId]);

  // Sync health for the AdsPro account behind the selected ad account, not the
  // latest run across every account the user owns.
  const scopedAccountId = scopedAccountIds?.[0] ?? null;
  const getSyncStatusFn = useServerFn(getSyncStatus);
  const syncQuery = useQuery({
    queryKey: ["insights-sync-status", scopedAccountId],
    queryFn: () => getSyncStatusFn({ data: { accountId: scopedAccountId! } }),
    enabled: Boolean(scopedAccountId),
  });

  const funnelQuery = useQuery({
    queryKey: ["funnel", from, to, scopedAccountIds?.join(","), drill.map((d) => d.id).join(">")],
    queryFn: async () => {
      const toExclusive = new Date(`${to}T00:00:00.000Z`);
      toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
      // lead_attribution resolves adset/campaign by walking ad_id up the synced
      // hierarchy in SQL — leads.campaign_id / leads.adset_id are almost always
      // NULL because Meta's webhook never sends them.
      let leadsQuery = supabase
        .from("lead_attribution")
        .select("id, ad_id")
        .gte("created_at", `${from}T00:00:00.000Z`)
        .lt("created_at", toExclusive.toISOString());
      if (scopedAccountIds) leadsQuery = leadsQuery.in("account_id", scopedAccountIds);
      const deepest = drill[drill.length - 1];
      if (deepest) {
        leadsQuery =
          deepest.level === "campaign"
            ? leadsQuery.eq("campaign_id", deepest.id)
            : leadsQuery.eq("adset_id", deepest.id);
      }
      const { data: leads, error: leadsError } = await leadsQuery.limit(5000);
      if (leadsError) throw leadsError;


      const ids = (leads ?? []).map((l) => l.id).filter((id): id is string => Boolean(id));
      const reached = new Map<string, Set<string>>();
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data: events, error: eventsError } = await supabase
          .from("status_events")
          .select("lead_id, status")
          .in("lead_id", chunk);
        if (eventsError) throw eventsError;
        for (const ev of events ?? []) {
          if (!reached.has(ev.status)) reached.set(ev.status, new Set());
          reached.get(ev.status)!.add(ev.lead_id);
        }
      }

      return {
        total: ids.length,
        unlinked: (leads ?? []).filter((l) => !l.ad_id).length,
        // "ever reached" counting — a lead that reached purchased counts in
        // every earlier step it passed through.
        contacted: reached.get("contacted")?.size ?? 0,
        qualified: reached.get("qualified")?.size ?? 0,
        booked: reached.get("booked")?.size ?? 0,
        purchased: reached.get("purchased")?.size ?? 0,
      };
    },
  });

  // Sum the ingredients across the range, then divide once. low_sample is
  // recomputed on the aggregate, never inherited from a single day.
  const aggregates = useMemo(() => aggregateRows(perfQuery.data ?? []), [perfQuery.data]);
  const totals = useMemo(() => totalsFromAggregates(aggregates), [aggregates]);

  const sorted = useMemo(() => {
    const rows = [...aggregates];
    rows.sort((a, b) => {
      if (sortKey === "name") {
        return sortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
      }
      const av = a[sortKey] as number | null;
      const bv = b[sortKey] as number | null;
      // NULLs always last, whichever direction.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sortDesc ? bv - av : av - bv;
    });
    return rows;
  }, [aggregates, sortKey, sortDesc]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(key !== "name");
    }
  };

  const drillInto = (row: PerfAggregate) => {
    if (level === "ad") return;
    setDrill((path) => [...path, { level, id: row.entityId, name: row.name }]);
  };

  const sync = syncQuery.data;
  const provenance = perfQuery.data?.[0] ?? null;
  const attributionWindow =
    provenance?.attribution_window ?? anyInsightsQuery.data?.attribution_window ?? null;
  const newestSnapshot =
    (perfQuery.data ?? []).reduce<string | null>((newest, row) => {
      if (!row.snapshot_at) return newest;
      return !newest || row.snapshot_at > newest ? row.snapshot_at : newest;
    }, null) ?? anyInsightsQuery.data?.snapshot_at ?? null;

  const hasAnyInsights = Boolean(anyInsightsQuery.data);
  const rangeHasRows = aggregates.length > 0;
  const spendWithoutLinkedLeads = rangeHasRows && totals.spend > 0 && totals.leads === 0;
  const syncFailing = sync?.status === "failed" || sync?.status === "partial";

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ad performance</h1>
          <p className="text-sm text-muted-foreground">
            Not what a lead cost — what it was worth.
          </p>
        </div>

        {/* Sync health strip */}
        {syncQuery.isLoading ? (
          <p className="text-xs text-muted-foreground">Checking ad data sync…</p>
        ) : syncFailing ? (
          <div role="alert" className="rounded-md border border-destructive bg-destructive/10 p-4">
            <p className="font-semibold text-destructive">
              Ad data sync {sync?.status === "partial" ? "partially failed" : "failed"}
              {relativeTime(sync?.started_at) ? ` — started ${relativeTime(sync?.started_at)}` : ""}.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Numbers below may be stale. Meta reported:
            </p>
            <p className="mt-2 font-mono text-xs break-words text-foreground">
              {sync?.error ?? "(no error text returned)"}
            </p>
          </div>
        ) : !sync ? (
          <p className="text-xs text-muted-foreground">Ad data has not synced yet.</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Ad data last updated {relativeTime(sync.finished_at ?? sync.started_at) ?? "recently"}.
          </p>
        )}

        {/* Ad account: a label when there is one, a real selector when there are many */}
        {adAccounts.length > 0 && (
          <div className="rounded-md border p-4">
            <p className="text-xs text-muted-foreground">Ad account</p>
            {adAccounts.length === 1 ? (
              <AdAccountIdentityLines
                className="mt-1"
                id={activeAdAccount?.id}
                name={activeAdAccount?.name}
              />
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {adAccounts.map((option) => (
                  <Button
                    key={option.id}
                    size="sm"
                    variant={option.id === activeAdAccountId ? "default" : "outline"}
                    onClick={() => setChosenAdAccount(option.id)}
                    className="h-auto flex-col items-start py-2"
                  >
                    <span className="text-sm font-medium">{adAccountPrimary(option)}</span>
                    {option.name ? (
                      <span className="font-mono text-[10px] opacity-70">{option.id}</span>
                    ) : null}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Date range */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={preset === "7" ? "default" : "outline"}
            onClick={() => setPreset("7")}
          >
            Last 7 days
          </Button>
          <Button
            size="sm"
            variant={preset === "28" ? "default" : "outline"}
            onClick={() => setPreset("28")}
          >
            Last 28 days
          </Button>
          <Button
            size="sm"
            variant={preset === "custom" ? "default" : "outline"}
            onClick={() => setPreset("custom")}
          >
            Custom
          </Button>
          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-40"
                aria-label="From date"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                value={customTo}
                min={customFrom}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-40"
                aria-label="To date"
              />
            </div>
          )}
        </div>

        {/* Summary tiles */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Spend" value={formatMoney(totals.spend || null, totals.currency)} />
          <Tile label="Leads" value={formatNumber(funnelQuery.data?.total ?? null)} />
          <Tile label="Cost per lead" value={formatMoney(totals.costPerLead, totals.currency)} />
          <Tile
            label="Cost per qualified lead"
            value={formatMoney(totals.costPerQualifiedLead, totals.currency)}
          />
        </div>

        {/* Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead funnel</CardTitle>
            <CardDescription>
              Counted as “ever reached” — a lead that later purchased still counts as contacted and
              qualified.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {funnelQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !funnelQuery.data?.total ? (
              <p className="text-sm text-muted-foreground">
                No leads arrived in this date range.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <FunnelStep label="Leads" value={funnelQuery.data.total} />
                  <FunnelStep
                    label="Contacted"
                    value={funnelQuery.data.contacted}
                    total={funnelQuery.data.total}
                  />
                  <FunnelStep
                    label="Qualified"
                    value={funnelQuery.data.qualified}
                    total={funnelQuery.data.total}
                  />
                  <FunnelStep
                    label="Booked"
                    value={funnelQuery.data.booked}
                    total={funnelQuery.data.total}
                  />
                  <FunnelStep
                    label="Purchased"
                    value={funnelQuery.data.purchased}
                    total={funnelQuery.data.total}
                  />
                </div>
                {funnelQuery.data.unlinked > 0 && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    {funnelQuery.data.unlinked} of {funnelQuery.data.total} leads are not yet linked
                    to an ad, so they appear here but not in the table below.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Drill-down */}
        <div className="space-y-3">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => setDrill([])}
              className={cn(
                "rounded px-1 hover:text-foreground",
                drill.length === 0 ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              All campaigns
            </button>
            {drill.map((node, i) => (
              <span key={node.id} className="flex items-center gap-1">
                <span aria-hidden className="text-muted-foreground">
                  /
                </span>
                <button
                  type="button"
                  onClick={() => setDrill((path) => path.slice(0, i + 1))}
                  className={cn(
                    "max-w-[220px] truncate rounded px-1 hover:text-foreground",
                    i === drill.length - 1
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {node.name}
                </button>
              </span>
            ))}
            {drill.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-2"
                onClick={() => setDrill((path) => path.slice(0, -1))}
              >
                ← Up one level
              </Button>
            )}
          </nav>

          <p className="text-xs text-muted-foreground">
            Showing {LEVEL_LABEL[level].toLowerCase()}
            {level !== "ad" ? " — click a row to drill in." : "."}
          </p>

          {perfQuery.isLoading || anyInsightsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading ad data…</p>
          ) : perfQuery.isError ? (
            <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm">
              <p className="font-medium text-destructive">Could not load ad performance.</p>
              <p className="mt-1 font-mono text-xs break-words text-muted-foreground">
                {perfQuery.error instanceof Error ? perfQuery.error.message : "Unknown error"}
              </p>
            </div>
          ) : !hasAnyInsights ? (
            <div className="rounded-md border p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No ad data yet</p>
              <p className="mt-1">
                Once an ad starts spending, AdsPro begins collecting automatically and this fills in
                within an hour.
              </p>
            </div>
          ) : !rangeHasRows ? (
            <div className="rounded-md border p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                No spend recorded for the selected period
              </p>
              <p className="mt-1">
                Performance rows only exist where Meta reported spend
                {activeAdAccount
                  ? ` for ${adAccountPrimary(activeAdAccount)}`
                  : ""}
                {drill.length > 0 ? ` under ${drill[drill.length - 1]!.name}` : ""}. Widen the date
                range, or check that these ads are delivering.
              </p>
            </div>
          ) : (
            <>
              {spendWithoutLinkedLeads && (
                <p className="text-sm text-muted-foreground">
                  Spend is being tracked, but no leads are linked to an ad yet.
                </p>
              )}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHeader
                        label={LEVEL_LABEL[level]}
                        col="name"
                        sortKey={sortKey}
                        sortDesc={sortDesc}
                        onSort={sortBy}
                      />
                      <TableHead>Status</TableHead>
                      <SortHeader
                        label="Spend"
                        col="spend"
                        numeric
                        sortKey={sortKey}
                        sortDesc={sortDesc}
                        onSort={sortBy}
                      />
                      {/* Sample size: always shown, never sortable-away. */}
                      <TableHead className="text-right">Leads</TableHead>
                      <SortHeader
                        label="Qualified"
                        col="qualified"
                        numeric
                        sortKey={sortKey}
                        sortDesc={sortDesc}
                        onSort={sortBy}
                      />
                      <SortHeader
                        label="Cost / lead"
                        col="costPerLead"
                        numeric
                        sortKey={sortKey}
                        sortDesc={sortDesc}
                        onSort={sortBy}
                      />
                      <SortHeader
                        label="Cost / qualified"
                        col="costPerQualifiedLead"
                        numeric
                        sortKey={sortKey}
                        sortDesc={sortDesc}
                        onSort={sortBy}
                      />
                      <SortHeader
                        label="Qual. rate"
                        col="qualificationRate"
                        numeric
                        sortKey={sortKey}
                        sortDesc={sortDesc}
                        onSort={sortBy}
                      />
                      <SortHeader
                        label="Purchased"
                        col="purchased"
                        numeric
                        sortKey={sortKey}
                        sortDesc={sortDesc}
                        onSort={sortBy}
                      />
                      <SortHeader
                        label="Cost / purchase"
                        col="costPerPurchase"
                        numeric
                        sortKey={sortKey}
                        sortDesc={sortDesc}
                        onSort={sortBy}
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((row) => (
                      <PerfTableRow
                        key={row.entityId}
                        row={row}
                        level={level}
                        onDrill={level === "ad" ? undefined : () => drillInto(row)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        {/* Provenance footer */}
        {hasAnyInsights && (
          <p className="border-t pt-4 text-xs text-muted-foreground">
            Attribution: {attributionWindow ?? "—"} · Meta revises these figures for up to 28 days ·
            Last updated {newestSnapshot ? new Date(newestSnapshot).toLocaleString() : "—"}.
          </p>
        )}
      </div>
    </AppShell>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function FunnelStep({ label, value, total }: { label: string; value: number; total?: number }) {
  const pct = total && total > 0 ? `${Math.round((value / total) * 100)}%` : null;
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(value)}</p>
      {total !== undefined && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {pct ? `${pct} of leads` : "—"}
        </p>
      )}
    </div>
  );
}

function SortHeader({
  label,
  col,
  numeric,
  sortKey,
  sortDesc,
  onSort,
}: {
  label: string;
  col: SortKey;
  numeric?: boolean;
  sortKey: SortKey;
  sortDesc: boolean;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <TableHead className={numeric ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "font-semibold text-foreground",
        )}
      >
        {label}
        {active ? <span aria-hidden>{sortDesc ? "↓" : "↑"}</span> : null}
      </button>
    </TableHead>
  );
}

function PerfTableRow({
  row,
  level,
  onDrill,
}: {
  row: PerfAggregate;
  level: PerfLevel;
  onDrill?: (() => void) | undefined;
}) {
  const delivering = isDelivering(row.effectiveStatus);
  return (
    <TableRow className={cn(!delivering && "opacity-60", onDrill && "cursor-pointer")}>
      <TableCell className="max-w-[260px]">
        <div className="flex items-center gap-2">
          {level === "ad" && row.thumbnailUrl ? (
            <img
              src={row.thumbnailUrl}
              alt={`Creative thumbnail for ${row.name}`}
              className="size-10 shrink-0 rounded object-cover"
              loading="lazy"
            />
          ) : null}
          {onDrill ? (
            <button
              type="button"
              onClick={onDrill}
              className="truncate text-left text-sm hover:underline"
            >
              {row.name}
            </button>
          ) : (
            <span className="truncate text-sm">{row.name}</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <span
          className={cn(
            "text-xs",
            delivering ? "text-muted-foreground" : "font-medium text-muted-foreground",
          )}
        >
          {row.effectiveStatus ?? "—"}
        </span>
        {!delivering && row.effectiveStatus ? (
          <span className="ml-1 text-xs text-muted-foreground">(not delivering)</span>
        ) : null}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatMoney(row.spend || null, row.currency)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <div className="flex items-center justify-end gap-2">
          <span>{formatNumber(row.leads)}</span>
          {row.lowSample ? (
            <Badge variant="secondary" className="font-normal">
              low sample
            </Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatNumber(row.qualified)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {formatMoney(row.costPerLead, row.currency)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatMoney(row.costPerQualifiedLead, row.currency)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatPercent(row.qualificationRate)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatNumber(row.purchased)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {formatMoney(row.costPerPurchase, row.currency)}
      </TableCell>
    </TableRow>
  );
}
