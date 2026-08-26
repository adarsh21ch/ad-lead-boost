import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LEAD_STATUSES, graphUrl, deliverStatusEvent, type LeadStatus } from "./meta.server";

function assertStatus(status: string): asserts status is LeadStatus {
  if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
}

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
    const appId = process.env["META_APP_ID"];
    const redirectUri = process.env["META_OAUTH_REDIRECT_URI"];
    if (!appId || !redirectUri) throw new Error("Meta OAuth is not configured");
    return (
      `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(data.accountId)}` +
      `&scope=ads_management,leads_retrieval`
    );
  });

async function getOwnedAccountToken(supabase: any, accountId: string) {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, meta_access_token_encrypted, status")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Account not found");
  if (!data.meta_access_token_encrypted) throw new Error("Meta is not connected for this account");
  return data.meta_access_token_encrypted as string;
}

export const listMetaAdAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string }) => data)
  .handler(async ({ data, context }) => {
    const token = await getOwnedAccountToken(context.supabase, data.accountId);
    const res = await fetch(
      `${graphUrl("me/adaccounts")}?fields=id,name,account_id&limit=100&access_token=${encodeURIComponent(token)}`,
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? "Failed to list ad accounts");
    return (json.data ?? []) as Array<{ id: string; name: string; account_id: string }>;
  });

export const listMetaPixels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; adAccountId: string }) => data)
  .handler(async ({ data, context }) => {
    const token = await getOwnedAccountToken(context.supabase, data.accountId);
    const res = await fetch(
      `${graphUrl(`${data.adAccountId}/adspixels`)}?fields=id,name&limit=100&access_token=${encodeURIComponent(token)}`,
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? "Failed to list datasets");
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
      .select("*")
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
    assertStatus(data.status);
    return data as { leadId: string; status: LeadStatus };
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
    const result = await deliverStatusEvent(supabaseAdmin, event);
    return { eventId: event.id, ...result };
  });
