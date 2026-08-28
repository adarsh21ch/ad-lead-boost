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

export type MetaGraphErrorDetails = {
  message: string;
  code: number | null;
  errorSubcode: number | null;
  fbtraceId: string | null;
  httpStatus: number | null;
  rawResponse: string | null;
};

export class MetaGraphError extends Error {
  readonly details: MetaGraphErrorDetails;

  constructor(details: MetaGraphErrorDetails) {
    super(details.message);
    this.name = "MetaGraphError";
    this.details = details;
  }
}

export function getMetaGraphErrorDetails(error: unknown): MetaGraphErrorDetails {
  if (error instanceof MetaGraphError) return error.details;
  return {
    message: error instanceof Error ? error.message : String(error ?? "Unknown error"),
    code: null,
    errorSubcode: null,
    fbtraceId: null,
    httpStatus: null,
    rawResponse: null,
  };
}

/**
 * GETs a Graph endpoint with the token in the Authorization header, logs the
 * full response server-side, and throws an Error whose message carries Meta's
 * message, code and fbtrace_id so the UI can display it.
 */
export async function graphGet(
  url: string,
  accessToken: string,
  label: string,
): Promise<{ data?: unknown[]; [k: string]: unknown }> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch (err) {
    console.error(`[select-ad-account] [${label}] network failure`, err);
    throw new MetaGraphError({
      message: `Could not reach Meta (${label}).`,
      code: null,
      errorSubcode: null,
      fbtraceId: null,
      httpStatus: null,
      rawResponse: null,
    });
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  if (!res.ok || json?.error) {
    console.error(`[select-ad-account] [${label}] status=${res.status} body=${text}`);
    const e = json?.error ?? {};
    throw new MetaGraphError({
      message: e.message ?? `Meta returned HTTP ${res.status} for ${label}`,
      code: typeof e.code === "number" ? e.code : null,
      errorSubcode: typeof e.error_subcode === "number" ? e.error_subcode : null,
      fbtraceId: typeof e.fbtrace_id === "string" ? e.fbtrace_id : null,
      httpStatus: res.status,
      rawResponse: text,
    });
  }
  return json ?? {};
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

/** Retry backoff per failed attempt: 1min, 5min, 30min, 2hr, 6hr, 24hr. */
export const RETRY_BACKOFF_MINUTES = [1, 5, 30, 120, 360, 1440] as const;
export const MAX_DELIVERY_ATTEMPTS = RETRY_BACKOFF_MINUTES.length;

/**
 * Sends one status_events row to Meta's Conversions API, records the attempt in
 * capi_delivery_logs (one row per attempt, never overwritten), and advances the
 * event's dispatch_status / next_attempt_at with capped exponential backoff.
 * After MAX_DELIVERY_ATTEMPTS failures the event becomes 'abandoned'.
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
): Promise<{
  ok: boolean;
  httpStatus: number | null;
  error?: string;
  attempt: number;
  dispatchStatus: "delivered" | "pending" | "abandoned";
}> {
  const eventName = STATUS_TO_META_EVENT[statusEvent.status as LeadStatus] ?? "Lead";
  const attempt = (await getAttemptCount(admin, statusEvent.id)) + 1;

  const [{ data: lead }, { data: account }] = await Promise.all([
    admin.from("leads").select("*").eq("id", statusEvent.lead_id).maybeSingle(),
    admin.from("accounts").select("*").eq("id", statusEvent.account_id).maybeSingle(),
  ]);

  const logAttempt = async (
    httpStatus: number | null,
    metaResponse: unknown,
    delivered: boolean,
  ) => {
    await admin.from("capi_delivery_logs").insert({
      status_event_id: statusEvent.id,
      meta_event_name: eventName,
      http_status: httpStatus,
      meta_response: metaResponse,
      // retry_count is the 0-based attempt index for this log row.
      retry_count: attempt - 1,
      delivered_at: delivered ? new Date().toISOString() : null,
      is_test: Boolean((lead as { is_test?: boolean } | null)?.is_test),
    });
  };

  const succeed = async (httpStatus: number, metaResponse: unknown) => {
    await logAttempt(httpStatus, metaResponse, true);
    await admin
      .from("status_events")
      .update({ dispatch_status: "delivered" })
      .eq("id", statusEvent.id);
    return { ok: true as const, httpStatus, attempt, dispatchStatus: "delivered" as const };
  };

  const fail = async (
    error: string,
    httpStatus: number | null = null,
    metaResponse: unknown = null,
  ) => {
    await logAttempt(httpStatus, metaResponse ?? { error }, false);
    const abandoned = attempt >= MAX_DELIVERY_ATTEMPTS;
    const delayMinutes =
      RETRY_BACKOFF_MINUTES[Math.min(attempt, MAX_DELIVERY_ATTEMPTS) - 1] ?? 1440;
    await admin
      .from("status_events")
      .update(
        abandoned
          ? { dispatch_status: "abandoned" }
          : {
              dispatch_status: "pending",
              next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
            },
      )
      .eq("id", statusEvent.id);
    if (abandoned) {
      console.error(
        `[capi-dispatcher] event ${statusEvent.id} abandoned after ${attempt} attempts: ${error}`,
      );
    }
    return {
      ok: false as const,
      httpStatus,
      error,
      attempt,
      dispatchStatus: (abandoned ? "abandoned" : "pending") as "abandoned" | "pending",
    };
  };

  if (!account) return fail("account_not_found");
  if (!account.meta_dataset_id || !account.meta_access_token_encrypted) {
    return fail("account_missing_dataset_or_token");
  }

  let accessToken: string;
  try {
    accessToken = await decryptToken(admin, account.meta_access_token_encrypted);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "token_decrypt_failed");
  }

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

  const { reportTokenHealth, reportMetaError } = await import("./token-health.server");

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
    const metaError = (json as { error?: Record<string, unknown> } | null)?.error;
    if (!res.ok || metaError) {
      console.error(
        `[capi-dispatcher] event ${statusEvent.id} attempt ${attempt} failed status=${res.status} body=${JSON.stringify(json)}`,
      );
      await reportMetaError(statusEvent.account_id, "dispatcher", {
        code: typeof metaError?.["code"] === "number" ? (metaError["code"] as number) : null,
        errorSubcode:
          typeof metaError?.["error_subcode"] === "number"
            ? (metaError["error_subcode"] as number)
            : null,
        httpStatus: res.status,
        message: typeof metaError?.["message"] === "string" ? (metaError["message"] as string) : null,
      });
      return fail("meta_error", res.status, json);
    }
    await reportTokenHealth(statusEvent.account_id, "ok", "dispatcher");
    return succeed(res.status, json);
  } catch (err) {
    // Network/transport failure: Meta being flaky is never a token verdict.
    return fail(err instanceof Error ? err.message : "network_error");
  }

}

async function getAttemptCount(admin: AdminClient, statusEventId: string) {
  const { data } = await admin
    .from("capi_delivery_logs")
    .select("id")
    .eq("status_event_id", statusEventId);
  return data?.length ?? 0;
}

/**
 * Candidates for delivery: pending events whose next_attempt_at has come due,
 * oldest first. 'delivered' and 'abandoned' events are never re-sent.
 */
export async function findDueStatusEvents(admin: AdminClient, limit = 50) {
  const { data, error } = await admin
    .from("status_events")
    .select("id, account_id, lead_id, status, created_at")
    .eq("dispatch_status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[capi-dispatcher] failed to load due events", error);
    return [];
  }
  return data ?? [];
}

/** Encrypts a token with pgcrypto for at-rest storage. Server-only; never call from the client. */
export async function encryptToken(admin: AdminClient, token: string): Promise<string> {
  const key = process.env["TOKEN_ENCRYPTION_KEY"];
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  const { data, error } = await admin.rpc("encrypt_token", { p_token: token, p_key: key });
  if (error || !data) throw error ?? new Error("token_encryption_failed");
  return data as string;
}

/** Decrypts a stored token. Explicitly recognizes legacy Meta plaintext tokens. */
export async function decryptToken(admin: AdminClient, stored: string): Promise<string> {
  const key = process.env["TOKEN_ENCRYPTION_KEY"];
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  const { data, error } = await admin.rpc("decrypt_token", { p_encrypted: stored, p_key: key });
  if (error) throw new Error(`Meta token decryption failed: ${error.message}`);
  if (data == null) {
    if (stored.startsWith("EAA")) return stored;
    throw new Error("Meta token decryption failed: stored value is not valid encrypted token data");
  }
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
    .select("id, owner_user_id, status, meta_access_token_encrypted")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.owner_user_id !== userId) throw new Error("Account not found");
  if (data.status !== "active") throw new Error("This Meta connection is not active");
  if (!data.meta_access_token_encrypted) throw new Error("Meta is not connected for this account");
  return decryptToken(admin, data.meta_access_token_encrypted);
}
