import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Validates the chosen ad account against Meta BEFORE persisting it, then writes
 * ONLY meta_ad_account_id (+ nulls meta_ad_account_timezone so the fetcher re-reads
 * it). meta_dataset_id is never touched here.
 */
export const validateAndSaveAdAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; adAccountId: string }) => {
    if (!data?.accountId || !data?.adAccountId) {
      throw new Error("accountId and adAccountId are required");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { graphUrl, getOwnedAccountToken, graphGet, getMetaGraphErrorDetails } = await import(
      "./meta.server"
    );
    const { reportTokenHealth, reportMetaError } = await import("./token-health.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const adAccountId = data.adAccountId.startsWith("act_")
      ? data.adAccountId
      : `act_${data.adAccountId}`;

    // Current wiring, read as the signed-in user (RLS is the ownership boundary).
    const { data: current, error: readError } = await context.supabase
      .from("accounts")
      .select("id, meta_ad_account_id, meta_dataset_id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (readError) return { ok: false as const, error: { message: readError.message, code: null } };
    if (!current) return { ok: false as const, error: { message: "Account not found", code: null } };

    // The validation call already returns the human name — keep it instead of
    // discarding it, so no screen has to show a bare act_ number.
    let adAccountName: string | null = null;
    try {
      const token = await getOwnedAccountToken(supabaseAdmin, data.accountId, context.userId);
      const json = await graphGet(
        `${graphUrl(adAccountId)}?fields=id,name,account_status,currency`,
        token,
        adAccountId,
      );
      const name = (json as { name?: unknown }).name;
      adAccountName = typeof name === "string" && name.trim() ? name.trim() : null;
      await reportTokenHealth(data.accountId, "ok", "adaccounts");
    } catch (error) {
      const details = getMetaGraphErrorDetails(error);
      console.error("[connection] ad account validation failed", details);
      await reportMetaError(data.accountId, "adaccounts", details);
      return { ok: false as const, error: details };
    }

    const changed = current.meta_ad_account_id !== adAccountId;
    // Meta reports insights in the ad account's timezone; force a genuine re-fetch.
    // meta_dataset_id is deliberately absent from this patch — changing the ad
    // account must never clobber the CAPI destination.
    const patch = changed
      ? {
          meta_ad_account_id: adAccountId,
          meta_ad_account_name: adAccountName,
          meta_ad_account_timezone: null,
        }
      : { meta_ad_account_id: adAccountId, meta_ad_account_name: adAccountName };

    const { data: saved, error } = await context.supabase
      .from("accounts")
      .update(patch)
      .eq("id", data.accountId)
      .select(
        "id, meta_ad_account_id, meta_ad_account_name, meta_dataset_id, meta_ad_account_timezone",
      )
      .maybeSingle();
    if (error) return { ok: false as const, error: { message: error.message, code: null } };
    if (!saved) {
      return { ok: false as const, error: { message: "No owned account was updated.", code: null } };
    }
    return { ok: true as const, account: saved };
  });


/**
 * Validates the chosen dataset against Meta BEFORE persisting it, then writes ONLY
 * meta_dataset_id.
 */
export const validateAndSaveDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; datasetId: string }) => {
    if (!data?.accountId || !data?.datasetId) {
      throw new Error("accountId and datasetId are required");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { graphUrl, getOwnedAccountToken, graphGet, getMetaGraphErrorDetails } = await import(
      "./meta.server"
    );
    const { reportTokenHealth, reportMetaError } = await import("./token-health.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let datasetName: string | null = null;
    try {
      const token = await getOwnedAccountToken(supabaseAdmin, data.accountId, context.userId);
      const res = await graphGet(`${graphUrl(data.datasetId)}?fields=id,name`, token, data.datasetId);
      datasetName = (res as { name?: string | null }).name ?? null;
      await reportTokenHealth(data.accountId, "ok", "adaccounts");
    } catch (error) {
      const details = getMetaGraphErrorDetails(error);
      console.error("[connection] dataset validation failed", details);
      await reportMetaError(data.accountId, "adaccounts", details);
      return { ok: false as const, error: details };
    }

    const { data: saved, error } = await context.supabase
      .from("accounts")
      .update({ meta_dataset_id: data.datasetId, meta_dataset_name: datasetName })
      .eq("id", data.accountId)
      .select("id, meta_ad_account_id, meta_dataset_id, meta_dataset_name")
      .maybeSingle();
    if (error) return { ok: false as const, error: { message: error.message, code: null } };
    if (!saved) {
      return { ok: false as const, error: { message: "No owned account was updated.", code: null } };
    }
    return { ok: true as const, account: saved };

  });

/** One row per owned account from public.insights_sync_status (security_invoker view). */
export const getSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string }) => {
    if (!data?.accountId) throw new Error("accountId is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("insights_sync_status")
      .select("account_id, status, started_at, finished_at, rows_written, meta_code, verdict, error")
      .eq("account_id", data.accountId)
      .maybeSingle();
    if (error) throw error;
    return (row ?? null) as null | {
      account_id: string;
      status: string | null;
      started_at: string | null;
      finished_at: string | null;
      rows_written: number | null;
      meta_code: number | null;
      verdict: string | null;
      error: string | null;
    };
  });

/** Queues an insights sync via the existing RPC. Returns its jsonb verbatim. */
export const requestSyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; days?: number }) => {
    if (!data?.accountId) throw new Error("accountId is required");
    return { accountId: data.accountId, days: data.days ?? 7 };
  })
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("request_insights_sync", {
      p_account_id: data.accountId,
      p_days: data.days,
    });
    if (error) throw error;
    return result as {
      ok: boolean;
      queued?: boolean;
      reason?: string;
      retry_after_seconds?: number;
    };
  });
