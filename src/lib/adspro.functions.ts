import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isLeadStatus } from "./adspro.constants";

export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  });

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string }) => {
    if (!data?.name?.trim()) throw new Error("Name is required");
    return { name: data.name.trim() };
  })
  .handler(async ({ data, context }) => {
    const { data: account, error } = await context.supabase
      .from("accounts")
      .insert({ name: data.name, owner_user_id: context.userId })
      .select()
      .single();
    if (error) throw error;
    return account;
  });

export const getMetaConnectUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string }) => {
    if (!data?.accountId) throw new Error("accountId is required");
    return data;
  })
  .handler(async ({ data }) => {
    const { getMetaRedirectUri, makeMetaOAuthState } = await import("./meta.server");
    const appId = process.env["META_APP_ID"];
    if (!appId) throw new Error("Meta OAuth is not configured");
    const redirectUri = getMetaRedirectUri();
    const state = makeMetaOAuthState(data.accountId);
    return (
      `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=ads_management,business_management,pages_show_list,pages_manage_metadata,leads_retrieval`
    );
  });


export const listMetaAdAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string }) => {
    if (!data?.accountId) throw new Error("accountId is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { graphUrl, getOwnedAccountToken, graphGet, getMetaGraphErrorDetails } = await import("./meta.server");
    const { reportTokenHealth, reportMetaError } = await import("./token-health.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const token = await getOwnedAccountToken(supabaseAdmin, data.accountId, context.userId);
      const json = await graphGet(
        `${graphUrl("me/adaccounts")}?fields=id,name,account_status,business&limit=100`,
        token,
        "me/adaccounts",
      );
      await reportTokenHealth(data.accountId, "ok", "adaccounts");
      return {
        ok: true as const,
        data: (json.data ?? []) as Array<{
          id: string;
          name: string;
          account_status?: number;
          business?: { id: string; name?: string };
        }>,
        rawResponse: JSON.stringify(json),
      };
    } catch (error) {
      const details = getMetaGraphErrorDetails(error);
      console.error("[select-ad-account] ad-account discovery failed", details);
      await reportMetaError(data.accountId, "adaccounts", details);
      if (details.code === 190) {
        const { error: statusError } = await context.supabase
          .from("accounts")
          .update({ status: "token_expired" })
          .eq("id", data.accountId)
          .eq("owner_user_id", context.userId);
        if (statusError) console.error("[select-ad-account] failed to mark token expired", statusError);
      }
      return { ok: false as const, error: details };
    }

  });

export const listMetaPixels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; adAccountId: string; businessId?: string }) => {
    if (!data?.accountId || !data?.adAccountId) throw new Error("accountId and adAccountId are required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { graphUrl, getOwnedAccountToken, graphGet, getMetaGraphErrorDetails } = await import("./meta.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const token = await getOwnedAccountToken(supabaseAdmin, data.accountId, context.userId);
      const requests = [
        graphGet(`${graphUrl(`${data.adAccountId}/adspixels`)}?fields=id,name&limit=100`, token, `${data.adAccountId}/adspixels`),
      ];
      if (data.businessId) {
        requests.push(
          graphGet(`${graphUrl(`${data.businessId}/owned_pixels`)}?fields=id,name&limit=100`, token, `${data.businessId}/owned_pixels`),
          graphGet(`${graphUrl(`${data.businessId}/client_pixels`)}?fields=id,name&limit=100`, token, `${data.businessId}/client_pixels`),
        );
      }
      const settled = await Promise.allSettled(requests);
      const errors = settled
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => getMetaGraphErrorDetails(result.reason));
      const pixels = new Map<string, { id: string; name: string }>();
      const rawResponses: string[] = [];
      for (const result of settled) {
        if (result.status !== "fulfilled") continue;
        rawResponses.push(JSON.stringify(result.value));
        for (const pixel of (result.value.data ?? []) as Array<{ id: string; name?: string }>) {
          if (pixel.id) pixels.set(pixel.id, { id: pixel.id, name: pixel.name ?? `Dataset ${pixel.id}` });
        }
      }
      const tokenError = errors.find((error) => error.code === 190);
      if (tokenError) {
        const { error: statusError } = await context.supabase
          .from("accounts")
          .update({ status: "token_expired" })
          .eq("id", data.accountId)
          .eq("owner_user_id", context.userId);
        if (statusError) console.error("[select-ad-account] failed to mark token expired", statusError);
        return { ok: false as const, error: tokenError };
      }
      if (pixels.size === 0 && errors.length > 0) {
        return {
          ok: false as const,
          error: errors[0] ?? {
            message: "Meta dataset discovery failed.",
            code: null,
            errorSubcode: null,
            fbtraceId: null,
            httpStatus: null,
            rawResponse: null,
          },
        };
      }
      return { ok: true as const, data: [...pixels.values()], warnings: errors, rawResponses };
    } catch (error) {
      const details = getMetaGraphErrorDetails(error);
      console.error("[select-ad-account] dataset discovery failed", details);
      return { ok: false as const, error: details };
    }
  });

export const saveAdAccountSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; adAccountId: string; datasetId: string }) => {
    if (!data?.accountId || !data?.adAccountId || !data?.datasetId) {
      throw new Error("accountId, adAccountId and datasetId are required");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const adAccountId = data.adAccountId.startsWith("act_") ? data.adAccountId : `act_${data.adAccountId}`;
    const { data: saved, error } = await context.supabase
      .from("accounts")
      .update({
        meta_ad_account_id: adAccountId,
        meta_dataset_id: data.datasetId,
        status: "active",
      })
      .eq("id", data.accountId)
      .eq("owner_user_id", context.userId)
      .select("id, meta_ad_account_id, meta_dataset_id")
      .maybeSingle();
    if (error) {
      console.error("[select-ad-account] database save failed", error);
      return { ok: false as const, error: error.message };
    }
    if (!saved) {
      console.error("[select-ad-account] database save updated no owned account", { accountId: data.accountId });
      return { ok: false as const, error: "No owned account was updated." };
    }
    console.info("[select-ad-account] selection saved", {
      accountId: saved.id,
      adAccountId: saved.meta_ad_account_id,
      datasetId: saved.meta_dataset_id,
    });
    return { ok: true as const, account: saved };
  });

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isLeadEnrichmentEnabled } = await import("@/lib/lead-enrichment.server");
    const enrichmentEnabled = isLeadEnrichmentEnabled();
    const columns = enrichmentEnabled
      ? "id, created_at, meta_leadgen_id, campaign_id, campaign_name, ad_id, ad_name, form_id, full_name, enrichment_status, enrichment_error"
      : "id, created_at, meta_leadgen_id, campaign_id, ad_id, form_id";
    const { data: leads, error } = await context.supabase
      .from("leads")
      .select(columns)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const rows = (leads ?? []) as unknown as Array<{
      id: string;
      created_at: string;
      meta_leadgen_id: string | null;
      campaign_id: string | null;
      campaign_name?: string | null;
      ad_id: string | null;
      ad_name?: string | null;
      form_id: string | null;
      full_name?: string | null;
      enrichment_status?: string | null;
      enrichment_error?: string | null;
    }>;
    const leadIds = rows.map((l) => l.id);
    let events: Array<{ lead_id: string; status: string; created_at: string }> = [];
    if (leadIds.length) {
      const { data: ev } = await context.supabase
        .from("status_events")
        .select("lead_id, status, created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false });
      events = ev ?? [];
    }
    const latest = new Map<string, string>();
    for (const e of events) if (!latest.has(e.lead_id)) latest.set(e.lead_id, e.status);
    return {
      enrichmentEnabled,
      leads: rows.map((l) => ({ ...l, latest_status: latest.get(l.id) ?? null })),
    };
  });

export const setLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { leadId: string; status: string }) => {
    if (!data?.leadId) throw new Error("leadId is required");
    if (!isLeadStatus(data.status)) throw new Error(`Invalid status: ${data.status}`);
    return data;
  })
  .handler(async ({ data, context }) => {
    // RLS lets the owner read their own leads — this doubles as the ownership check.
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select("id, account_id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (error) throw error;
    if (!lead) throw new Error("Lead not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: event, error: insErr } = await supabaseAdmin
      .from("status_events")
      .insert({ account_id: lead.account_id, lead_id: lead.id, status: data.status, source: "manual" })
      .select()
      .single();
    if (insErr) throw insErr;
    return event;
  });

export const listDeliveryLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("capi_delivery_logs")
      .select("id, status_event_id, meta_event_name, http_status, meta_response, retry_count, delivered_at")
      .order("delivered_at", { ascending: false, nullsFirst: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const sendTestEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: account, error } = await context.supabase
      .from("accounts")
      .select("id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (error) throw error;
    if (!account) throw new Error("Account not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .insert({ account_id: data.accountId, raw_field_data: { test: true } })
      .select()
      .single();
    if (leadErr) throw leadErr;
    const { data: event, error: evErr } = await supabaseAdmin
      .from("status_events")
      .insert({
        account_id: data.accountId,
        lead_id: lead.id,
        status: "qualified",
        source: "manual",
        raw_payload: { test: true },
      })
      .select()
      .single();
    if (evErr) throw evErr;

    // Dispatch immediately so the user can confirm it reaches Meta.
    const { deliverStatusEvent } = await import("./meta.server");
    const result = await deliverStatusEvent(supabaseAdmin, event);
    return { eventId: event.id, ...result };
  });

export const getIntegrationAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("accounts")
      .select(
        "id, status, meta_ad_account_id, meta_dataset_id, meta_page_id, meta_token_expires_at, webhook_api_key, page_subscribe_status, page_subscribe_error, page_subscribed_at",
      )
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw error;
    const account = data?.[0] ?? null;
    if (!account) return null;
    const ready = account.status === "active" && Boolean(account.meta_dataset_id);
    // Never expose the API key until the account is fully connected.
    return ready ? account : { ...account, webhook_api_key: "", ready: false };
  });

export const regenerateWebhookKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string }) => {
    if (!data?.accountId) throw new Error("accountId is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owned, error: ownErr } = await supabaseAdmin
      .from("accounts")
      .select("id, owner_user_id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (ownErr) throw ownErr;
    if (!owned || owned.owner_user_id !== context.userId) throw new Error("Account not found");

    const { randomBytes } = await import("crypto");
    const newKey = randomBytes(24).toString("hex");
    const { error } = await supabaseAdmin
      .from("accounts")
      .update({ webhook_api_key: newKey })
      .eq("id", owned.id);
    if (error) throw error;
    return { webhook_api_key: newKey };
  });

export const listAccountDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("capi_delivery_logs")
      .select(
        "id, meta_event_name, http_status, meta_response, retry_count, delivered_at, is_test, status_event_id, status_events!inner(created_at, status, dispatch_status)",
      )
      .order("created_at", { ascending: false, referencedTable: "status_events" })
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const ev = (
        row as unknown as {
          status_events?: { created_at?: string; status?: string; dispatch_status?: string };
        }
      ).status_events;
      return {
        id: row.id,
        meta_event_name: row.meta_event_name,
        http_status: row.http_status,
        meta_response: row.meta_response,
        delivered_at: row.delivered_at,
        is_test: (row as unknown as { is_test?: boolean }).is_test ?? false,
        created_at: ev?.created_at ?? null,
        status: ev?.status ?? null,
        dispatch_status: ev?.dispatch_status ?? "pending",
        attempt: (row.retry_count ?? 0) + 1,
      };
    });
  });

/** Pages discovered for the caller's account (read-only; writes happen in the API routes). */
export const listMetaPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("meta_pages")
      .select("page_id, page_name, subscribe_status, subscribe_error, subscribed_at")
      .order("page_name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

/** Read-only overview for the Settings page. Never returns token material. */
export const getSettingsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("accounts")
      .select(
        "id, name, status, meta_ad_account_id, meta_dataset_id, meta_page_id, meta_token_expires_at, page_subscribe_status, page_subscribed_at",
      )
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw error;
    const account = data?.[0] ?? null;

    let pageName: string | null = null;
    if (account?.meta_page_id) {
      const { data: page } = await context.supabase
        .from("meta_pages")
        .select("page_name")
        .eq("page_id", account.meta_page_id)
        .maybeSingle();
      pageName = page?.page_name ?? null;
    }

    const { getServerAuthUser } = await import("@/integrations/supabase/session.server");
    const authUser = await getServerAuthUser();

    return {
      email: authUser?.email ?? null,
      account,
      pageName,
    };
  });
