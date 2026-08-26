// Server-only helpers for Meta Graph API + CAPI delivery. Never import from client code.
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STATUS_TO_META_EVENT, type LeadStatus } from "./adspro.constants";

export const GRAPH_VERSION = "v21.0";

/** Meta requires lowercase + trimmed values before SHA-256 hashing. */
export function hashForMeta(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function graphUrl(path: string): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
}

export function getMetaRedirectUri(requestUrl?: string): string {
  const configured = process.env["META_OAUTH_REDIRECT_URI"];
  if (configured) return configured;
  const appUrl = process.env["APP_URL"];
  if (appUrl) return new URL("/api/public/auth/meta/callback", appUrl).toString();
  if (requestUrl) return new URL("/api/public/auth/meta/callback", requestUrl).toString();
  throw new Error("Meta OAuth redirect URI is not configured");
}

export function makeMetaOAuthState(accountId: string): string {
  const secret = process.env["META_APP_SECRET"];
  if (!secret) throw new Error("Meta OAuth is not configured");
  const signature = createHash("sha256").update(`${accountId}.${secret}`).digest("hex");
  return `${accountId}.${signature}`;
}

export function parseMetaOAuthState(state: string): string | null {
  const secret = process.env["META_APP_SECRET"];
  if (!secret) return null;
  const [accountId, signature] = state.split(".");
  if (!accountId || !signature) return null;
  const expected = createHash("sha256").update(`${accountId}.${secret}`).digest("hex");
  return signature === expected ? accountId : null;
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
    const retryCount = await getRetryCount(admin, statusEvent.id);
    await admin.from("capi_delivery_logs").insert({
      status_event_id: statusEvent.id,
      meta_event_name: eventName,
      http_status: httpStatus,
      meta_response: metaResponse ?? { error },
      retry_count: retryCount,
      delivered_at: null,
    });
    return { ok: false, httpStatus, error };
  };

  if (!account) return fail("account_not_found");
  if (!account.meta_dataset_id || !account.meta_access_token_encrypted) {
    return fail("account_missing_dataset_or_token");
  }
  const accessToken = await decryptToken(admin, account.meta_access_token_encrypted);

  const userData: Record<string, unknown> = {};
  if (lead?.phone_hash) userData["ph"] = [lead.phone_hash];
  if (lead?.email_hash) userData["em"] = [lead.email_hash];
  if (lead?.fbc) userData["fbc"] = lead.fbc;
  if (lead?.fbp) userData["fbp"] = lead.fbp;
  if (lead?.client_ip) userData["client_ip_address"] = String(lead.client_ip);
  if (lead?.client_user_agent) userData["client_user_agent"] = lead.client_user_agent;
  if (lead?.meta_leadgen_id) userData["lead_id"] = lead.meta_leadgen_id;

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
      `${graphUrl(`${account.meta_dataset_id}/events`)}?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = await res.json().catch(() => null);
    const retryCount = await getRetryCount(admin, statusEvent.id);
    await admin.from("capi_delivery_logs").insert({
      status_event_id: statusEvent.id,
      meta_event_name: eventName,
      http_status: res.status,
      meta_response: json,
      retry_count: retryCount,
      delivered_at: res.ok ? new Date().toISOString() : null,
    });
    return res.ok
      ? { ok: true, httpStatus: res.status }
      : { ok: false, httpStatus: res.status, error: "meta_error" };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "network_error");
  }
}

async function getRetryCount(admin: AdminClient, statusEventId: string) {
  const { data } = await admin
    .from("capi_delivery_logs")
    .select("id")
    .eq("status_event_id", statusEventId);
  return data?.length ?? 0;
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
    .select("status_event_id, delivered_at, retry_count")
    .in("status_event_id", ids);
  const logState = new Map<string, { delivered: boolean; attempts: number }>();
  for (const log of logs ?? []) {
    const current = logState.get(log.status_event_id) ?? { delivered: false, attempts: 0 };
    logState.set(log.status_event_id, {
      delivered: current.delivered || Boolean(log.delivered_at),
      attempts: Math.max(current.attempts, (log.retry_count ?? 0) + 1),
    });
  }
  return events.filter((event) => {
    const state = logState.get(event.id);
    return !state?.delivered && (state?.attempts ?? 0) < 3;
  });
}

/** Encrypts a token with pgcrypto for at-rest storage. Server-only; never call from the client. */
export async function encryptToken(admin: AdminClient, token: string): Promise<string> {
  const key = process.env["TOKEN_ENCRYPTION_KEY"];
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  const { data, error } = await admin.rpc("encrypt_token", { p_token: token, p_key: key });
  if (error || !data) throw error ?? new Error("token_encryption_failed");
  return data as string;
}

/** Decrypts a stored token. Legacy plaintext rows are returned as-is (decrypt_token returns null). */
export async function decryptToken(admin: AdminClient, stored: string): Promise<string> {
  const key = process.env["TOKEN_ENCRYPTION_KEY"];
  if (!key) return stored;
  const { data, error } = await admin.rpc("decrypt_token", { p_encrypted: stored, p_key: key });
  if (error || data == null) return stored;
  return data as string;
}

/** Verifies the user owns the account, then returns the DECRYPTED Meta token. Server-only. */
export async function getOwnedAccountToken(
  admin: AdminClient,
  accountId: string,
  userId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("accounts")
    .select("id, owner_user_id, meta_access_token_encrypted")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.owner_user_id !== userId) throw new Error("Account not found");
  if (!data.meta_access_token_encrypted) throw new Error("Meta is not connected for this account");
  return decryptToken(admin, data.meta_access_token_encrypted);
}
