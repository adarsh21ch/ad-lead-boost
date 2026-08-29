// AdsPro — Meta Ads Insights sync (PHASE A fetcher, build-order item 4)
//
// Triggered by pg_cron via public.run_insights_sync(days) -> net.http_post, authenticated
// with the same CAPI_CRON_SECRET the dispatcher uses.
//
// WHY THIS IS AN EDGE FUNCTION AND NOT SQL
// Postgres cannot make this call by itself. decrypt_token(p_encrypted, p_key) takes the
// encryption key as an ARGUMENT, and that key is deliberately not stored in the database —
// so that a database compromise does not also hand over every customer's Meta token. Some
// worker outside Postgres has to hold the key. This is that worker. It is intentionally
// NOT a Lovable app route: Lovable has published unasked before (Session 7), and the data
// pipeline should not be exposed to that.
//
// This function is a dumb HTTP client on purpose. Every piece of state logic —
// deduplication, snapshotting, run bookkeeping — lives in SQL behind these four RPCs:
//   start_insights_sync_run / upsert_ad_entities / upsert_ad_insights / finish_insights_sync_run
//
// Env required:
//   CAPI_CRON_SECRET      shared with vault, authenticates the cron caller
//   TOKEN_ENCRYPTION_KEY  same value the app uses for encrypt_token/decrypt_token
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (injected by the platform)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Two rows fetched under different attribution windows are NOT comparable, so the window
// is stored on every row and shown in the UI. Changing this constant starts a new series.
const ATTRIBUTION = ["7d_click", "1d_view"];
const ATTRIBUTION_LABEL = ATTRIBUTION.join(",");

const LEVELS = ["campaign", "adset", "ad"] as const;
type Level = (typeof LEVELS)[number];

const MAX_PAGES = 25;          // pagination guard; 25 * 500 rows is far beyond any real account
const PAGE_LIMIT = 500;

// --- Meta error classification -------------------------------------------------------
// Order matters, and it mirrors src/lib/token-health.server.ts: rate limits and permission
// errors are checked FIRST and can never mark a token invalid. The 2026-08-28 incident was
// a real 190; a false 190 would be just as damaging in the other direction.
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80003, 80004, 80005, 80006, 80008]);
const PERMISSION_CODES = new Set([200, 10, 3, 803]);
const TOKEN_INVALID_CODES = new Set([190, 102]);

type Classification = "rate_limited" | "permission" | "token_invalid" | "other";

function classify(code: number | null): Classification {
  if (code === null) return "other";              // HTTP 5xx / timeout never blames the token
  if (RATE_LIMIT_CODES.has(code)) return "rate_limited";
  if (PERMISSION_CODES.has(code)) return "permission";
  if (TOKEN_INVALID_CODES.has(code)) return "token_invalid";
  return "other";
}

class MetaError extends Error {
  code: number | null;
  subcode: number | null;
  classification: Classification;
  constructor(message: string, code: number | null, subcode: number | null) {
    super(message);
    this.code = code;
    this.subcode = subcode;
    this.classification = classify(code);
  }
}

async function graphGet(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    const err = body?.error ?? {};
    throw new MetaError(
      // Meta's message VERBATIM. Never a friendly rewrite — house rule.
      err.message ?? `HTTP ${res.status}`,
      typeof err.code === "number" ? err.code : null,
      typeof err.error_subcode === "number" ? err.error_subcode : null,
    );
  }
  return body;
}

async function graphGetAll(firstUrl: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let url: string | null = firstUrl;
  let pages = 0;
  while (url && pages < MAX_PAGES) {
    const body = await graphGet(url);
    const data = (body.data as Record<string, unknown>[]) ?? [];
    out.push(...data);
    const paging = body.paging as { next?: string } | undefined;
    url = paging?.next ?? null;
    pages++;
  }
  return out;
}

// --- field sets ----------------------------------------------------------------------
const COMMON_METRICS =
  "spend,impressions,clicks,cpc,cpm,ctr,reach,frequency,actions,account_currency,date_start,date_stop";

function insightsFields(level: Level): string {
  if (level === "campaign") return `campaign_id,campaign_name,${COMMON_METRICS}`;
  if (level === "adset") return `adset_id,adset_name,campaign_id,campaign_name,${COMMON_METRICS}`;
  return `ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${COMMON_METRICS}`;
}

function insightsUrl(adAccountId: string, level: Level, since: string, until: string, token: string) {
  const params = new URLSearchParams({
    level,
    fields: insightsFields(level),
    time_range: JSON.stringify({ since, until }),
    time_increment: "1",                                  // one row per entity PER DAY
    action_attribution_windows: JSON.stringify(ATTRIBUTION),
    limit: String(PAGE_LIMIT),
    access_token: token,
  });
  return `${GRAPH}/${adAccountId}/insights?${params}`;
}

function entityIdFor(level: Level, row: Record<string, any>): string | null {
  if (level === "campaign") return row.campaign_id ?? null;
  if (level === "adset") return row.adset_id ?? null;
  return row.ad_id ?? null;
}

// Names and hierarchy come free with every insights row, so ad_entities stays populated
// without spending a single extra Meta call.
function entityFromInsight(level: Level, row: Record<string, any>) {
  const entity_id = entityIdFor(level, row);
  if (!entity_id) return null;
  if (level === "campaign") return { entity_id, level, name: row.campaign_name ?? null };
  if (level === "adset") {
    return { entity_id, level, parent_id: row.campaign_id ?? null, name: row.adset_name ?? null };
  }
  return { entity_id, level, parent_id: row.adset_id ?? null, name: row.ad_name ?? null };
}

function insightFromRow(level: Level, row: Record<string, any>) {
  const entity_id = entityIdFor(level, row);
  if (!entity_id || !row.date_start) return null;
  return {
    entity_id,
    stat_date: row.date_start,
    spend: row.spend ?? null,
    impressions: row.impressions ?? null,
    clicks: row.clicks ?? null,
    cpc: row.cpc ?? null,
    cpm: row.cpm ?? null,
    ctr: row.ctr ?? null,
    reach: row.reach ?? null,
    frequency: row.frequency ?? null,
    actions: Array.isArray(row.actions) ? row.actions : null,
  };
}

// Status, budgets and creative thumbnails are NOT in insights. Fetched only on the daily
// backfill run, because they change rarely and the ad account's rate-limit ceiling is
// roughly 60 calls/hour until a live ad lifts it.
async function fetchEntityMetadata(adAccountId: string, token: string) {
  const rows: Record<string, unknown>[] = [];
  let calls = 0;

  const campaigns = await graphGetAll(
    `${GRAPH}/${adAccountId}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget&limit=200&access_token=${token}`,
  );
  calls++;
  for (const c of campaigns as Record<string, any>[]) {
    rows.push({
      entity_id: c.id, level: "campaign", name: c.name, status: c.status,
      effective_status: c.effective_status, objective: c.objective,
      daily_budget: c.daily_budget ?? null, lifetime_budget: c.lifetime_budget ?? null,
    });
  }

  const adsets = await graphGetAll(
    `${GRAPH}/${adAccountId}/adsets?fields=id,name,status,effective_status,campaign_id,optimization_goal,daily_budget,lifetime_budget&limit=200&access_token=${token}`,
  );
  calls++;
  for (const a of adsets as Record<string, any>[]) {
    rows.push({
      entity_id: a.id, level: "adset", parent_id: a.campaign_id, name: a.name,
      status: a.status, effective_status: a.effective_status,
      optimization_goal: a.optimization_goal,
      daily_budget: a.daily_budget ?? null, lifetime_budget: a.lifetime_budget ?? null,
    });
  }

  const ads = await graphGetAll(
    `${GRAPH}/${adAccountId}/ads?fields=id,name,status,effective_status,adset_id,creative{id,thumbnail_url}&limit=200&access_token=${token}`,
  );
  calls++;
  for (const a of ads as Record<string, any>[]) {
    rows.push({
      entity_id: a.id, level: "ad", parent_id: a.adset_id, name: a.name,
      status: a.status, effective_status: a.effective_status,
      creative_id: a.creative?.id ?? null,
      creative_thumbnail_url: a.creative?.thumbnail_url ?? null,
    });
  }

  return { rows, calls };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CAPI_CRON_SECRET");
  const encryptionKey = Deno.env.get("TOKEN_ENCRYPTION_KEY");

  const auth = req.headers.get("authorization") ?? "";
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  if (!encryptionKey) {
    // Loud and specific: this is the one thing only Adarsh can supply.
    return new Response(
      JSON.stringify({ error: "TOKEN_ENCRYPTION_KEY not set on this function" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const days = Math.min(Math.max(Number(body?.days ?? 3), 1), 90);
  // Entity metadata (status, budgets, thumbnails) only on the wider daily run.
  const syncEntities = body?.syncEntities ?? days >= 7;

  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * 86400000);
  const sinceStr = isoDate(since);
  const untilStr = isoDate(until);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: accounts, error: accErr } = await supabase
    .from("accounts")
    .select("id, name, meta_ad_account_id, meta_access_token_encrypted, status, token_status, meta_ad_account_timezone");

  if (accErr) {
    return new Response(JSON.stringify({ error: accErr.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }

  const summary: Record<string, unknown>[] = [];
  let rateLimited = false;

  for (const account of accounts ?? []) {
    // Skip rather than burn a call: a known-invalid token cannot succeed, and every
    // wasted call comes out of the same hourly ceiling.
    if (
      rateLimited ||
      account.status !== "active" ||
      !account.meta_ad_account_id ||
      !account.meta_access_token_encrypted ||
      account.token_status === "invalid"
    ) {
      summary.push({ account: account.name, skipped: true, reason: rateLimited ? "rate_limited_earlier" : "not_eligible" });
      continue;
    }

    let runId: string | null = null;
    let metaCalls = 0;
    let entitiesUpserted = 0;
    let written = 0;
    let unchanged = 0;

    try {
      const { data: token, error: decErr } = await supabase.rpc("decrypt_token", {
        p_encrypted: account.meta_access_token_encrypted,
        p_key: encryptionKey,
      });
      if (decErr || !token) throw new Error(`token decrypt failed: ${decErr?.message ?? "empty result"}`);

      const { data: startedRun, error: runErr } = await supabase.rpc("start_insights_sync_run", {
        p_account_id: account.id,
        p_days: days,
        p_date_from: sinceStr,
        p_date_to: untilStr,
        p_levels: [...LEVELS],
      });
      if (runErr) throw new Error(`start_insights_sync_run failed: ${runErr.message}`);
      runId = startedRun as string;

      let currency: string | null = null;

      // Meta reports insights in the AD ACCOUNT's timezone, and lead timestamps are UTC.
      // Without this, every lead arriving before the UTC offset each day is attributed to
      // the wrong day's spend. Fetched when unknown, and refreshed on the daily run.
      if (syncEntities || !account.meta_ad_account_timezone) {
        const acct = await graphGet(
          `${GRAPH}/${account.meta_ad_account_id}?fields=timezone_name,currency&access_token=${token}`,
        ) as Record<string, any>;
        metaCalls++;
        if (acct.currency) currency = acct.currency;
        if (acct.timezone_name && acct.timezone_name !== account.meta_ad_account_timezone) {
          const { error } = await supabase
            .from("accounts")
            .update({ meta_ad_account_timezone: acct.timezone_name })
            .eq("id", account.id);
          if (error) throw new Error(`timezone update failed: ${error.message}`);
        }
      }

      for (const level of LEVELS) {
        const rows = await graphGetAll(
          insightsUrl(account.meta_ad_account_id, level, sinceStr, untilStr, token as string),
        );
        metaCalls++;

        if (!currency && rows.length > 0) {
          currency = (rows[0] as Record<string, any>).account_currency ?? null;
        }

        const entityRows = rows.map((r) => entityFromInsight(level, r as Record<string, any>)).filter(Boolean);
        const insightRows = rows.map((r) => insightFromRow(level, r as Record<string, any>)).filter(Boolean);

        if (entityRows.length > 0) {
          const { data: n, error } = await supabase.rpc("upsert_ad_entities", {
            p_account_id: account.id, p_rows: entityRows,
          });
          if (error) throw new Error(`upsert_ad_entities failed: ${error.message}`);
          entitiesUpserted += (n as number) ?? 0;
        }

        if (insightRows.length > 0) {
          const { data: res, error } = await supabase.rpc("upsert_ad_insights", {
            p_account_id: account.id,
            p_sync_run_id: runId,
            p_level: level,
            p_attribution_window: ATTRIBUTION_LABEL,
            p_currency: currency,
            p_rows: insightRows,
          });
          if (error) throw new Error(`upsert_ad_insights failed: ${error.message}`);
          written += (res as Record<string, number>)?.written ?? 0;
          unchanged += (res as Record<string, number>)?.unchanged ?? 0;
        }
      }

      if (syncEntities) {
        const meta = await fetchEntityMetadata(account.meta_ad_account_id, token as string);
        metaCalls += meta.calls;
        if (meta.rows.length > 0) {
          const { data: n, error } = await supabase.rpc("upsert_ad_entities", {
            p_account_id: account.id, p_rows: meta.rows,
          });
          if (error) throw new Error(`upsert_ad_entities (metadata) failed: ${error.message}`);
          entitiesUpserted += (n as number) ?? 0;
        }
      }

      // The token demonstrably works. Same evidence trail the dispatcher writes.
      await supabase.rpc("record_token_health", {
        p_account_id: account.id, p_event: "ok", p_source: "insights",
      });

      await supabase.rpc("finish_insights_sync_run", {
        p_run_id: runId, p_status: "ok", p_meta_calls: metaCalls,
        p_entities: entitiesUpserted, p_written: written, p_unchanged: unchanged,
      });

      summary.push({
        account: account.name, status: "ok", meta_calls: metaCalls,
        entities: entitiesUpserted, written, unchanged,
      });
    } catch (e) {
      const isMeta = e instanceof MetaError;
      const code = isMeta ? (e as MetaError).code : null;
      const subcode = isMeta ? (e as MetaError).subcode : null;
      const cls = isMeta ? (e as MetaError).classification : "other";
      const message = (e as Error).message;

      if (cls === "token_invalid") {
        await supabase.rpc("record_token_health", {
          p_account_id: account.id, p_event: "invalid", p_source: "insights",
          p_code: code, p_subcode: subcode, p_message: message,
        });
      }

      if (cls === "rate_limited") {
        // Stop the whole run. Burning the ceiling also blocks Marketing API tier review.
        rateLimited = true;
      }

      if (runId) {
        await supabase.rpc("finish_insights_sync_run", {
          p_run_id: runId,
          p_status: cls === "rate_limited" ? "partial" : "failed",
          p_meta_calls: metaCalls, p_entities: entitiesUpserted,
          p_written: written, p_unchanged: unchanged,
          p_error: message, p_code: code, p_subcode: subcode,
        });
      }

      summary.push({
        account: account.name, status: cls === "rate_limited" ? "partial" : "failed",
        classification: cls, meta_code: code, meta_subcode: subcode, error: message,
      });
    }
  }

  return new Response(
    JSON.stringify({ days, since: sinceStr, until: untilStr, syncEntities, accounts: summary }),
    { headers: { "content-type": "application/json" } },
  );
});
