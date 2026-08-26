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
      `&scope=ads_management,business_management`
    );
  });


export const listMetaAdAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string }) => data)
  .handler(async ({ data, context }) => {
    const { graphUrl, getOwnedAccountToken, graphGet } = await import("./meta.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = await getOwnedAccountToken(supabaseAdmin, data.accountId, context.userId);
    const json = await graphGet(
      `${graphUrl("me/adaccounts")}?fields=id,name,account_id,account_status&limit=100`,
      token,
      "me/adaccounts",
    );
    return (json.data ?? []) as Array<{
      id: string;
      name: string;
      account_id: string;
      account_status?: number;
    }>;
  });

export const listMetaPixels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; adAccountId: string }) => data)
  .handler(async ({ data, context }) => {
    const { graphUrl, getOwnedAccountToken, graphGet } = await import("./meta.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = await getOwnedAccountToken(supabaseAdmin, data.accountId, context.userId);
    const json = await graphGet(
      `${graphUrl(`${data.adAccountId}/adspixels`)}?fields=id,name&limit=100`,
      token,
      `${data.adAccountId}/adspixels`,
    );
    return (json.data ?? []) as Array<{ id: string; name: string }>;
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
    const { error } = await context.supabase
      .from("accounts")
      .update({
        meta_ad_account_id: data.adAccountId,
        meta_dataset_id: data.datasetId,
        status: "active",
      })
      .eq("id", data.accountId);
    if (error) throw error;
    return { ok: true };
  });

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: leads, error } = await context.supabase
      .from("leads")
      .select("id, created_at, meta_leadgen_id, campaign_id, ad_id, form_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const leadIds = (leads ?? []).map((l) => l.id);
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
    return (leads ?? []).map((l) => ({ ...l, latest_status: latest.get(l.id) ?? null }));
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
      .select("id, status, meta_ad_account_id, meta_dataset_id, meta_token_expires_at, webhook_api_key")
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
        "id, meta_event_name, http_status, meta_response, retry_count, delivered_at, is_test, status_event_id, status_events!inner(created_at, status)",
      )
      .order("id", { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const ev = (row as unknown as { status_events?: { created_at?: string; status?: string } })
        .status_events;
      return {
        id: row.id,
        meta_event_name: row.meta_event_name,
        http_status: row.http_status,
        meta_response: row.meta_response,
        delivered_at: row.delivered_at,
        is_test: (row as unknown as { is_test?: boolean }).is_test ?? false,
        created_at: ev?.created_at ?? null,
        status: ev?.status ?? null,
      };
    });
  });
