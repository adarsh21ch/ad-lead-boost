import { createFileRoute } from "@tanstack/react-router";

// Error reasons surfaced as /dashboard?meta_connect=error&reason=<reason>.
// Full provider/database details stay server-side in console.error logs.

type ConnectErrorReason =
  | "meta_denied"
  | "no_code"
  | "state_missing"
  | "state_mismatch"
  | "not_authenticated"
  | "missing_app_config"
  | "token_exchange_failed"
  | "token_extend_failed"
  | "db_write_failed"
  | "unknown";

function fail(reason: ConnectErrorReason, detail?: unknown) {
  console.error(
    `[meta-oauth] ${reason}`,
    detail === undefined ? "" : safeStringify(detail),
  );
  return new Response(null, {
    status: 302,
    headers: { Location: `/dashboard?meta_connect=error&reason=${reason}` },
  });
}

function safeStringify(detail: unknown) {
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

function metaErrorDetail(status: number, body: unknown, redirectUri?: string) {
  const metaError =
    body && typeof body === "object" && "error" in body
      ? (body as { error?: Record<string, unknown> }).error
      : undefined;
  return {
    status,
    redirectUri,
    message: metaError?.["message"],
    code: metaError?.["code"],
    error_subcode: metaError?.["error_subcode"],
    fbtrace_id: metaError?.["fbtrace_id"],
    meta: body,
  };
}

// Completes the "Connect Meta" OAuth flow: exchanges the code for a
// short-lived token, upgrades to a long-lived token, encrypts it with
// pgcrypto, and stores it on the account row identified by `state`.
export const Route = createFileRoute("/api/public/auth/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const providerError = url.searchParams.get("error");
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");

          if (providerError) {
            return fail("meta_denied", {
              error: providerError,
              error_reason: url.searchParams.get("error_reason"),
              error_description: url.searchParams.get("error_description"),
            });
          }
          if (!code) return fail("no_code", { reason: "missing code param" });
          if (!state) return fail("state_missing", { reason: "missing state param" });

          const appId = process.env["META_APP_ID"];
          const appSecret = process.env["META_APP_SECRET"];
          if (!appId || !appSecret) {
            return fail("missing_app_config", {
              missing: [
                ...(!appId ? ["META_APP_ID"] : []),
                ...(!appSecret ? ["META_APP_SECRET"] : []),
              ],
            });
          }

          const { getMetaRedirectUri, parseMetaOAuthState, encryptToken } = await import(
            "@/lib/meta.server"
          );
          const accountId = parseMetaOAuthState(state);
          if (!accountId) return fail("state_mismatch", { reason: "state signature mismatch" });
          const redirectUri = getMetaRedirectUri(request.url);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: account, error: accountError } = await supabaseAdmin
            .from("accounts")
            .select("id, owner_user_id")
            .eq("id", accountId)
            .maybeSingle();
          if (accountError) return fail("db_write_failed", accountError);
          if (!account?.owner_user_id) {
            return fail("not_authenticated", { reason: "account owner not found", accountId });
          }

          // 1. code -> short-lived token
          const shortRes = await fetch(
            `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${encodeURIComponent(appId)}` +
              `&redirect_uri=${encodeURIComponent(redirectUri)}` +
              `&client_secret=${encodeURIComponent(appSecret)}` +
              `&code=${encodeURIComponent(code)}`,
          );
          const shortJson = await shortRes.json();
          if (!shortRes.ok || !shortJson.access_token) {
            // redirect_uri mismatch and bad app secret both surface here.
            return fail(
              "token_exchange_failed",
              metaErrorDetail(shortRes.status, shortJson, redirectUri),
            );
          }

          // 2. short-lived -> long-lived token (~60 days)
          const longRes = await fetch(
            `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token` +
              `&client_id=${encodeURIComponent(appId)}` +
              `&client_secret=${encodeURIComponent(appSecret)}` +
              `&fb_exchange_token=${encodeURIComponent(shortJson.access_token)}`,
          );
          const longJson = await longRes.json();
          if (!longRes.ok || !longJson.access_token) {
            return fail("token_extend_failed", metaErrorDetail(longRes.status, longJson));
          }

          // Meta returns expires_in only for tokens that actually expire. If it
          // is absent we store NULL ("unknown") rather than inventing a date.
          const expiresIn = longJson.expires_in;
          const expiresAt =
            expiresIn != null && Number.isFinite(Number(expiresIn)) && Number(expiresIn) > 0
              ? new Date(Date.now() + Number(expiresIn) * 1000).toISOString()
              : null;
          console.log(
            `[meta-oauth] account=${accountId} expires_in=${expiresIn ?? "absent"} stored_expiry=${expiresAt ?? "NULL"}`,
          );

          let encrypted: string;
          try {
            encrypted = await encryptToken(supabaseAdmin, longJson.access_token);
          } catch (err) {
            return fail("unknown", err instanceof Error ? err.message : err);
          }

          const { data: savedAccount, error } = await supabaseAdmin
            .from("accounts")
            .update({
              meta_access_token_encrypted: encrypted,
              meta_token_expires_at: expiresAt,
              status: "active",
            })
            .eq("id", accountId)
            .select("id")
            .maybeSingle();
          if (error || !savedAccount) {
            return fail("db_write_failed", error ?? { reason: "account update returned no row", accountId });
          }

          // A fresh token clears any red banner immediately.
          const { reportTokenHealth } = await import("@/lib/token-health.server");
          await reportTokenHealth(accountId, "reconnected", "oauth");

          return redirect(`/dashboard/select-ad-account?account=${encodeURIComponent(accountId)}`);

        } catch (err) {
          return fail("unknown", err instanceof Error ? err.message : err);
        }
      },
    },
  },
});

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}
