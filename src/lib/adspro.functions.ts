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
    const { reportTokenHealth, reportMetaError } = await import("./token-health.server");
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
      const tokenError = errors.find((error) => error.code === 190 || error.code === 102);
      if (tokenError) {
        await reportMetaError(data.accountId, "adaccounts", tokenError);
        const { error: statusError } = await context.supabase
          .from("accounts")
          .update({ status: "token_expired" })
          .eq("id", data.accountId)
          .eq("owner_user_id", context.userId);
        if (statusError) console.error("[select-ad-account] failed to mark token expired", statusError);
        return { ok: false as const, error: tokenError };
      }
      if (pixels.size === 0 && errors.length > 0) {
        await reportMetaError(data.accountId, "adaccounts", errors[0]);
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
      // At least one Graph call came back normally.
      await reportTokenHealth(data.accountId, "ok", "adaccounts");
      return { ok: true as const, data: [...pixels.values()], warnings: errors, rawResponses };
    } catch (error) {
      const details = getMetaGraphErrorDetails(error);
      console.error("[select-ad-account] dataset discovery failed", details);
      await reportMetaError(data.accountId, "adaccounts", details);
      return { ok: false as const, error: details };
    }

  });

export const saveAdAccountSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    accountId: string;
    adAccountId: string;
    datasetId: string;
    adAccountName?: string | null;
    datasetName?: string | null;
  }) => {
    if (!data?.accountId || !data?.adAccountId || !data?.datasetId) {
      throw new Error("accountId, adAccountId and datasetId are required");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const adAccountId = data.adAccountId.startsWith("act_") ? data.adAccountId : `act_${data.adAccountId}`;
    const adAccountName = data.adAccountName?.trim() || null;
    // Meta reports insights in the ad account's timezone; null it so the fetcher re-reads it.
    const { data: saved, error } = await context.supabase
      .from("accounts")
      .update({
        meta_ad_account_id: adAccountId,
        meta_ad_account_name: adAccountName,
        meta_dataset_id: data.datasetId,
        meta_dataset_name: data.datasetName?.trim() || null,
        meta_ad_account_timezone: null,
        status: "active",
      })
      .eq("id", data.accountId)
      .eq("owner_user_id", context.userId)
      .select("id, meta_ad_account_id, meta_ad_account_name, meta_dataset_id, meta_dataset_name")
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

/** Strips characters that carry meaning inside a PostgREST filter string. */
function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()*\\"':]/g, " ").trim().slice(0, 80);
}

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { search?: string; status?: string } | null) => ({
    search: typeof data?.search === "string" ? data.search : "",
    status: typeof data?.status === "string" ? data.status : "all",
  }))
  .handler(async ({ data, context }) => {
    const { isLeadEnrichmentEnabled } = await import("@/lib/lead-enrichment.server");
    const enrichmentEnabled = isLeadEnrichmentEnabled();
    const columns =
      "id, created_at, meta_leadgen_id, campaign_id, campaign_name, ad_id, ad_name, form_id, full_name, enrichment_status, enrichment_error, phone, email, responses, notes";
    let query = context.supabase.from("leads").select(columns);
    const term = sanitizeSearchTerm(data.search ?? "");
    if (term) {
      const like = `%${term}%`;
      query = query.or(
        `full_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`,
      );
    }
    const { data: leads, error } = await query
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
      phone?: string | null;
      email?: string | null;
      responses?: Record<string, string> | null;
      notes?: string | null;
    }>;
    const leadIds = rows.map((l) => l.id);
    // Names + resolved hierarchy come from the security_invoker view, which
    // walks ad_id up the synced hierarchy in SQL. No walk is done here.
    const attribution = new Map<
      string,
      {
        campaign_id: string | null;
        campaign_name: string | null;
        adset_id: string | null;
        adset_name: string | null;
        ad_name: string | null;
      }
    >();
    let events: Array<{ lead_id: string; status: string; created_at: string }> = [];
    if (leadIds.length) {
      const { data: attr } = await context.supabase
        .from("lead_attribution")
        .select("id, campaign_id, campaign_name, adset_id, adset_name, ad_name")
        .in("id", leadIds);
      for (const a of attr ?? []) {
        if (!a.id) continue;
        attribution.set(a.id, {
          campaign_id: a.campaign_id ?? null,
          campaign_name: a.campaign_name ?? null,
          adset_id: a.adset_id ?? null,
          adset_name: a.adset_name ?? null,
          ad_name: a.ad_name ?? null,
        });
      }
      const { data: ev } = await context.supabase
        .from("status_events")
        .select("lead_id, status, created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false });
      events = ev ?? [];
    }
    // The view owns the definition of "awaiting decision" — never re-derived here.
    type Suggestion = {
      suggested_status: string | null;
      confidence: "high" | "needs_human" | "none";
      reason: string;
      matched_key: string | null;
      matched_value: string | null;
    };
    const suggestions = new Map<string, Suggestion>();
    if (leadIds.length) {
      const { data: sug } = await context.supabase
        .from("lead_qualification_suggestions")
        .select("*")
        .in("lead_id", leadIds);
      for (const s of sug ?? []) {
        if (!s.lead_id || !s.awaiting_decision) continue;
        suggestions.set(s.lead_id, {
          suggested_status: s.suggested_status ?? null,
          confidence: (s.confidence ?? "none") as Suggestion["confidence"],
          reason: s.reason ?? "",
          matched_key: s.matched_key ?? null,
          matched_value: s.matched_value ?? null,
        });
      }
    }
    const latest = new Map<string, string>();
    for (const e of events) if (!latest.has(e.lead_id)) latest.set(e.lead_id, e.status);
    const statusFilter = data.status ?? "all";
    const mapped = rows.map((l) => {
      const attr = attribution.get(l.id);
      return {
        ...l,
        responses: (l.responses ?? {}) as Record<string, string>,
        campaign_id: attr?.campaign_id ?? l.campaign_id ?? null,
        campaign_name: attr?.campaign_name ?? l.campaign_name ?? null,
        adset_id: attr?.adset_id ?? null,
        adset_name: attr?.adset_name ?? null,
        ad_name: attr?.ad_name ?? l.ad_name ?? null,
        latest_status: latest.get(l.id) ?? null,
        suggestion: suggestions.get(l.id) ?? null,
      };
    });
    return {
      enrichmentEnabled,
      leads:
        statusFilter === "all"
          ? mapped
          : statusFilter === "new"
            ? mapped.filter((l) => l.latest_status == null)
            : mapped.filter((l) => l.latest_status === statusFilter),
    };
  });

export const countLeadsAwaitingDecision = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("lead_qualification_suggestions")
      .select("lead_id", { count: "exact", head: true })
      .eq("awaiting_decision", true);
    if (error) throw error;
    return { count: count ?? 0 };
  });

/** Timeline for one lead. Read-only: never writes a status_event. */
export const getLeadStatusHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { leadId: string }) => {
    if (!data?.leadId) throw new Error("leadId is required");
    return { leadId: data.leadId };
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("lead_status_history")
      .select(
        "status_event_id, status, source, suggested_status, created_at, dispatch_status, meta_event_name, http_status, delivered_at, retry_count",
      )
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { events: rows ?? [] };
  });



export const reenrichLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { leadId: string }) => {
    if (!data?.leadId) throw new Error("leadId is required");
    return { leadId: data.leadId };
  })
  .handler(async ({ data, context }) => {
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select("id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (error) throw error;
    if (!lead) throw new Error("Lead not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enrichLead } = await import("@/lib/lead-enrichment.server");
    const { error: resetErr } = await supabaseAdmin
      .from("leads")
      .update({ enrichment_status: "not_attempted", enrichment_attempts: 0, enrichment_error: null })
      .eq("id", lead.id);
    if (resetErr) throw resetErr;
    const result = await enrichLead(supabaseAdmin, lead.id);
    return result;
  });


export const setLeadNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { leadId: string; notes: string }) => {
    if (!data?.leadId) throw new Error("leadId is required");
    return { leadId: data.leadId, notes: String(data.notes ?? "").slice(0, 4000) };
  })
  .handler(async ({ data, context }) => {
    // RLS scopes the read to the owner — this doubles as the ownership check.
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select("id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (error) throw error;
    if (!lead) throw new Error("Lead not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin
      .from("leads")
      .update({ notes: data.notes || null })
      .eq("id", lead.id);
    if (upErr) throw upErr;
    return { ok: true as const };
  });




export const setLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { leadId: string; status: string; suggestedStatus?: string | null }) => {
    if (!data?.leadId) throw new Error("leadId is required");
    if (!isLeadStatus(data.status)) throw new Error(`Invalid status: ${data.status}`);
    return {
      leadId: data.leadId,
      status: data.status,
      suggestedStatus:
        typeof data.suggestedStatus === "string" && data.suggestedStatus ? data.suggestedStatus : null,
    };
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
      .insert({
        account_id: lead.account_id,
        lead_id: lead.id,
        status: data.status,
        source: "manual",
        suggested_status: data.suggestedStatus,
      })

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

/**
 * Every AdsPro account this user owns. A user may own more than one (each with
 * its own Page, ad account and dataset), so screens render a list, not a row.
 */
export const listMyAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("accounts")
      .select("id, name, status, meta_ad_account_id, meta_ad_account_name, meta_dataset_id, meta_dataset_name")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

/** Every account this user owns, with the fields the dashboard home renders. */
export const listMyAccountsDetailed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const rows = data ?? [];

    // Human-readable Facebook Page names, resolved from the discovered pages table.
    const { data: pages } = await context.supabase
      .from("meta_pages")
      .select("page_id, page_name");
    const nameByPageId = new Map((pages ?? []).map((p) => [p.page_id, p.page_name]));

    return rows.map((row) => ({
      ...row,
      page_name: row.meta_page_id ? nameByPageId.get(row.meta_page_id) ?? null : null,
    }));
  });



export const getIntegrationAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { accountId?: string | null }) => ({
    accountId: data?.accountId ?? null,
  }))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("accounts")
      .select(
        "id, status, meta_ad_account_id, meta_ad_account_name, meta_dataset_id, meta_dataset_name, meta_ad_account_timezone, meta_page_id, meta_token_expires_at, webhook_api_key, page_subscribe_status, page_subscribe_error, page_subscribed_at, token_status, token_last_error, token_invalid_since",
      );
    if (data.accountId) query = query.eq("id", data.accountId);
    const { data: rows, error } = await query
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw error;
    const account = rows?.[0] ?? null;
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
      // capi_delivery_logs has no own timestamp, so order the PARENT rows by the
      // embedded status_events.created_at (newest first). The previous
      // `referencedTable` form only sorted embedded rows, leaving the log unordered.
      .order("status_events(created_at)", { ascending: false })
      .limit(20);
    if (error) throw error;
    const rows = (data ?? []).map((row) => {
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
    // Belt and braces: guarantee the rendered order is strictly newest first.
    return rows.sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
    );
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
        "id, name, status, meta_ad_account_id, meta_ad_account_name, meta_dataset_id, meta_dataset_name, meta_page_id, meta_token_expires_at, page_subscribe_status, page_subscribed_at",
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
