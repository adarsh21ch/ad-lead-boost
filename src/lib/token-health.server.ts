// Server-only: reports what Meta actually said about our token.
//
// The expiry date is NOT the detector — Meta's response is. Every place the app
// talks to Meta calls one of the helpers below, and public.record_token_health
// owns ALL state logic (event insert, token_status flip, token_invalid_since
// preservation, error clearing on recovery). Nothing here re-implements it.
import type { SupabaseClient } from "@supabase/supabase-js";

export type TokenHealthEvent = "ok" | "invalid" | "reconnected" | "expiring_soon";
export type TokenHealthSource = "dispatcher" | "pages" | "enrichment" | "adaccounts" | "oauth";

export type MetaErrorLike = {
  code?: number | null;
  errorSubcode?: number | null;
  httpStatus?: number | null;
  message?: string | null;
};

/** Meta codes that mean "the token is dead, reconnect". Any subcode of 190 counts. */
const TOKEN_INVALID_CODES = [190, 102];
/** Permission/scope problems — a missing scope is not a dead token. */
const PERMISSION_CODES = [200, 10];
/** Rate limits — marking the token dead here would be a false alarm. */
const RATE_LIMIT_CODES = [4, 17, 80004];

/**
 * Returns 'invalid' only when Meta clearly says the token is no longer usable.
 * Permission errors, rate limits, 5xx and network failures return null, which
 * means "report nothing, leave token_status untouched".
 */
export function classifyMetaTokenError(error: MetaErrorLike | null | undefined): "invalid" | null {
  if (!error) return null;
  const code = typeof error.code === "number" ? error.code : null;
  if (code != null) {
    if (RATE_LIMIT_CODES.includes(code)) return null;
    if (PERMISSION_CODES.includes(code)) return null;
    if (TOKEN_INVALID_CODES.includes(code)) return "invalid";
    return null;
  }
  // No Meta error code: transport/HTTP-level failure. Never blame the token.
  return null;
}

type AdminClient = SupabaseClient<any>;

async function getAdmin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as AdminClient;
}

/**
 * Thin wrapper around the record_token_health RPC. NEVER throws — a failed
 * health report must not break a dispatch, a webhook or a page subscribe.
 */
export async function reportTokenHealth(
  accountId: string | null | undefined,
  event: TokenHealthEvent,
  source: TokenHealthSource,
  metaError?: MetaErrorLike | null,
): Promise<void> {
  if (!accountId) return;
  try {
    const admin = await getAdmin();
    const { error } = await admin.rpc("record_token_health", {
      p_account_id: accountId,
      p_event: event,
      p_source: source,
      p_code: metaError?.code ?? null,
      p_subcode: metaError?.errorSubcode ?? null,
      // Meta's message, verbatim.
      p_message: metaError?.message ?? null,
    });
    if (error) console.error(`[token-health] rpc failed (${source}/${event})`, error.message);
  } catch (err) {
    console.error(`[token-health] report threw (${source}/${event})`, err);
  }
}

/**
 * Classifies a Meta error and reports 'invalid' only when it really is a token
 * problem. Rate limits, scope errors and flaky Meta responses report nothing.
 */
export async function reportMetaError(
  accountId: string | null | undefined,
  source: TokenHealthSource,
  error: MetaErrorLike | null | undefined,
): Promise<void> {
  if (classifyMetaTokenError(error) !== "invalid") return;
  await reportTokenHealth(accountId, "invalid", source, error);
}
