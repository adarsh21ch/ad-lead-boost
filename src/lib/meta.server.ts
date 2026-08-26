// Server-only helpers for Meta Graph API + CAPI delivery. Never import from client code.
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const GRAPH_VERSION = "v21.0";

export const LEAD_STATUSES = [
  "contacted",
  "qualified",
  "not_qualified",
  "booked",
  "no_show",
  "purchased",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_TO_META_EVENT: Record<LeadStatus, string> = {
  contacted: "Lead_Contacted",
  qualified: "Lead_Qualified",
  not_qualified: "Lead_Disqualified",
  booked: "Schedule",
  no_show: "Lead_NoShow",
  purchased: "Purchase",
};

/** Meta requires lowercase + trimmed values before SHA-256 hashing. */
export function hashForMeta(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function graphUrl(path: string): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
}

type AdminClient = SupabaseClient<any>;

/**
 * Sends one status_events row to Meta's Conversions API and records the
 * outcome in capi_delivery_logs. Returns a small result DTO.
 */
export async function deliverStatusEvent(
  admin: AdminClient,
  statusEvent: {
    id: string;
    account_id: string;
    lead_id: string;
    status: string;
    created_at: string;
  },
): Promise<{ ok: boolean; httpStatus: number | null; error?: string }> {
  const eventName = STATUS_TO_META_EVENT[statusEvent.status as LeadStatus] ?? "Lead";
  const [{ data: lead }, { data: account }] = await Promise.all([
    admin.from("leads").select("*").eq("id", statusEvent.lead_id).maybeSingle(),
    admin.from("accounts").select("*").eq("id", statusEvent.account_id).maybeSingle(),
  ]);

  const fail = async (error: string, httpStatus: number | null = null, metaResponse: unknown = null) => {
    await admin.from("capi_delivery_logs").insert({
      status_event_id: statusEvent.id,
      meta_event_name: eventName,
      http_status: httpStatus,
      meta_response: metaResponse ?? { error },
      delivered_at: null,
    });
    return { ok: false, httpStatus, error };
  };

  if (!account) return fail("account_not_found");
  if (!account.meta_dataset_id || !account.meta_access_token_encrypted) {
    return fail("account_missing_dataset_or_token");
  }

  const userData: Record<string, unknown> = {};
  if (lead?.phone_hash) userData.ph = [lead.phone_hash];
  if (lead?.email_hash) userData.em = [lead.email_hash];
  if (lead?.fbc) userData.fbc = lead.fbc;
  if (lead?.fbp) userData.fbp = lead.fbp;
  if (lead?.client_ip) userData.client_ip_address = lead.client_ip;
  if (lead?.client_user_agent) userData.client_user_agent = lead.client_user_agent;
  if (lead?.meta_leadgen_id) userData.lead_id = lead.meta_leadgen_id;

  const body = {
    data: [
      {
        event_name: eventName,
        // event_id is the lead's shared event id, for Meta-side dedup against
        // any client-side pixel event for the same lead.
        event_id: lead?.event_id ?? statusEvent.id,
        event_time: Math.floor(new Date(statusEvent.created_at).getTime() / 1000),
        action_source: "system_generated",
        user_data: userData,
      },
    ],
  };

  try {
    const res = await fetch(
      `${graphUrl(`${account.meta_dataset_id}/events`)}?access_token=${encodeURIComponent(account.meta_access_token_encrypted)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = await res.json().catch(() => null);
    await admin.from("capi_delivery_logs").insert({
      status_event_id: statusEvent.id,
      meta_event_name: eventName,
      http_status: res.status,
      meta_response: json,
      delivered_at: res.ok ? new Date().toISOString() : null,
    });
    return res.ok
      ? { ok: true, httpStatus: res.status }
      : { ok: false, httpStatus: res.status, error: "meta_error" };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "network_error");
  }
}

/** Finds status_events rows with no capi_delivery_logs row yet. */
export async function findUndeliveredStatusEvents(admin: AdminClient, limit = 100) {
  const { data: events, error } = await admin
    .from("status_events")
    .select("id, account_id, lead_id, status, created_at")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error || !events?.length) return [];
  const ids = events.map((e) => e.id);
  const { data: logs } = await admin
    .from("capi_delivery_logs")
    .select("status_event_id")
    .in("status_event_id", ids);
  const delivered = new Set((logs ?? []).map((l) => l.status_event_id));
  return events.filter((e) => !delivered.has(e.id));
}
