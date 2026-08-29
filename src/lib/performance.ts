/**
 * Pure helpers for the Ad performance screen.
 *
 * AGGREGATION RULE: the warehouse view gives one row per entity per DAY.
 * To show a date range we sum the ingredients and divide once at the end.
 * Never average a per-day ratio column — that weights a ₹50 day the same
 * as a ₹5000 day.
 */

export type PerfLevel = "campaign" | "adset" | "ad";

export type PerfRow = {
  account_id: string | null;
  level: string | null;
  entity_id: string | null;
  entity_name: string | null;
  parent_id: string | null;
  effective_status: string | null;
  creative_thumbnail_url: string | null;
  stat_date: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  currency: string | null;
  meta_leads: number | null;
  adspro_leads: number | null;
  contacted: number | null;
  qualified: number | null;
  disqualified: number | null;
  booked: number | null;
  no_show: number | null;
  purchased: number | null;
  attribution_window: string | null;
  snapshot_at: string | null;
};

export type PerfAggregate = {
  entityId: string;
  name: string;
  effectiveStatus: string | null;
  thumbnailUrl: string | null;
  currency: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  metaLeads: number;
  contacted: number;
  qualified: number;
  booked: number;
  purchased: number;
  /** sum(spend) / nullif(sum(adspro_leads), 0) */
  costPerLead: number | null;
  /** sum(spend) / nullif(sum(qualified), 0) */
  costPerQualifiedLead: number | null;
  /** sum(spend) / nullif(sum(booked), 0) */
  costPerBooked: number | null;
  /** sum(spend) / nullif(sum(purchased), 0) */
  costPerPurchase: number | null;
  /** sum(qualified) / nullif(sum(adspro_leads), 0) */
  qualificationRate: number | null;
  /** sum(purchased) / nullif(sum(qualified), 0) */
  closeRate: number | null;
  /** recomputed on the aggregate, not inherited from a single day */
  lowSample: boolean;
};

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Divide-by-zero yields null, mirroring nullif() in SQL. Never 0, never Infinity. */
export function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
}

export function aggregateRows(rows: PerfRow[]): PerfAggregate[] {
  const byEntity = new Map<string, PerfAggregate & { _spend: number }>();

  for (const row of rows) {
    const id = row.entity_id;
    if (!id) continue;
    let acc = byEntity.get(id);
    if (!acc) {
      acc = {
        entityId: id,
        name: row.entity_name || id,
        effectiveStatus: row.effective_status ?? null,
        thumbnailUrl: row.creative_thumbnail_url ?? null,
        currency: row.currency ?? null,
        spend: 0,
        impressions: 0,
        clicks: 0,
        leads: 0,
        metaLeads: 0,
        contacted: 0,
        qualified: 0,
        booked: 0,
        purchased: 0,
        costPerLead: null,
        costPerQualifiedLead: null,
        costPerBooked: null,
        costPerPurchase: null,
        qualificationRate: null,
        closeRate: null,
        lowSample: false,
        _spend: 0,
      };
      byEntity.set(id, acc);
    }
    // Prefer the most recent non-empty descriptive values.
    if (row.entity_name) acc.name = row.entity_name;
    if (row.effective_status) acc.effectiveStatus = row.effective_status;
    if (row.creative_thumbnail_url) acc.thumbnailUrl = row.creative_thumbnail_url;
    if (row.currency) acc.currency = row.currency;

    acc.spend += num(row.spend);
    acc.impressions += num(row.impressions);
    acc.clicks += num(row.clicks);
    acc.leads += num(row.adspro_leads);
    acc.metaLeads += num(row.meta_leads);
    acc.contacted += num(row.contacted);
    acc.qualified += num(row.qualified);
    acc.booked += num(row.booked);
    acc.purchased += num(row.purchased);
  }

  return [...byEntity.values()].map((acc) => ({
    ...acc,
    costPerLead: ratio(acc.spend, acc.leads),
    costPerQualifiedLead: ratio(acc.spend, acc.qualified),
    costPerBooked: ratio(acc.spend, acc.booked),
    costPerPurchase: ratio(acc.spend, acc.purchased),
    qualificationRate: ratio(acc.qualified, acc.leads),
    closeRate: ratio(acc.purchased, acc.qualified),
    lowSample: acc.leads < 30,
  }));
}

export type PerfTotals = {
  spend: number;
  leads: number;
  qualified: number;
  booked: number;
  purchased: number;
  costPerLead: number | null;
  costPerQualifiedLead: number | null;
  currency: string | null;
};

export function totalsFromAggregates(aggs: PerfAggregate[]): PerfTotals {
  const spend = aggs.reduce((s, a) => s + a.spend, 0);
  const leads = aggs.reduce((s, a) => s + a.leads, 0);
  const qualified = aggs.reduce((s, a) => s + a.qualified, 0);
  const booked = aggs.reduce((s, a) => s + a.booked, 0);
  const purchased = aggs.reduce((s, a) => s + a.purchased, 0);
  return {
    spend,
    leads,
    qualified,
    booked,
    purchased,
    costPerLead: ratio(spend, leads),
    costPerQualifiedLead: ratio(spend, qualified),
    currency: aggs.find((a) => a.currency)?.currency ?? null,
  };
}

/** Currency comes from the data — never hardcode a symbol. */
export function formatMoney(value: number | null, currency: string | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency ?? ""} ${value.toFixed(2)}`.trim();
  }
}

export function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat().format(value);
}

/** Rates are 0..1 in the view. */
export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(value * 100 < 10 ? 1 : 0)}%`;
}

export function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (seconds < 3600) return plural(Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return plural(Math.floor(seconds / 3600), "hour");
  if (seconds < 2592000) return plural(Math.floor(seconds / 86400), "day");
  return plural(Math.floor(seconds / 2592000), "month");
}

export function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}
