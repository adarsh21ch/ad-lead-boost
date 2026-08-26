import { createFileRoute } from "@tanstack/react-router";

// Error codes surfaced as /dashboard?meta_connect=error&code=<code>:
// - missing_config:    META_APP_ID / META_APP_SECRET not set
// - bad_state:         OAuth state param missing or failed signature check (possible CSRF)
// - token_exchange:    code -> short-lived token failed (usually redirect_uri mismatch
//                      or wrong app secret — full Meta error is logged server-side)
// - token_upgrade:     short-lived -> long-lived token exchange failed
// - encryption_config: TOKEN_ENCRYPTION_KEY not set
// - db_write:          storing the token on the account row failed

type ConnectErrorCode =
  | "missing_config"
  | "bad_state"
  | "token_exchange"
  | "token_upgrade"
  | "encryption_config"
  | "db_write";

function fail(code: ConnectErrorCode, detail?: unknown) {
  if (detail !== undefined) {
    // Full provider error stays server-side; only the short code reaches the browser.
    console.error(`[meta-oauth] ${code}:`, JSON.stringify(detail));
  } else {
    console.error(`[meta-oauth] ${code}`);
  }
  return new Response(null, {
    status: 302,
    headers: { Location: `/dashboard?meta_connect=error&code=${code}` },
  });
}

// Completes the "Connect Meta" OAuth flow: exchanges the code for a
// short-lived token, upgrades to a long-lived token, encrypts it with
// pgcrypto, and stores it on the account row identified by `state`.
export const Route = createFileRoute("/api/public/auth/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return fail("bad_state", { reason: "missing code or state param" });

        const appId = process.env["META_APP_ID"];
        const appSecret = process.env["META_APP_SECRET"];
        if (!appId || !appSecret) return fail("missing_config");

        const { getMetaRedirectUri, parseMetaOAuthState, encryptToken } = await import(
          "@/lib/meta.server"
        );
        const accountId = parseMetaOAuthState(state);
        if (!accountId) return fail("bad_state", { reason: "state signature mismatch" });
        const redirectUri = getMetaRedirectUri(request.url);

        try {
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
            return fail("token_exchange", { status: shortRes.status, meta: shortJson, redirectUri });
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
            return fail("token_upgrade", { status: longRes.status, meta: longJson });
          }

          const expiresAt = longJson.expires_in
            ? new Date(Date.now() + Number(longJson.expires_in) * 1000).toISOString()
            : null;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          let encrypted: string;
          try {
            encrypted = await encryptToken(supabaseAdmin, longJson.access_token);
          } catch (err) {
            return fail("encryption_config", err instanceof Error ? err.message : err);
          }

          const { error } = await supabaseAdmin
            .from("accounts")
            .update({
              meta_access_token_encrypted: encrypted,
              meta_token_expires_at: expiresAt,
              status: "active",
            })
            .eq("id", accountId);
          if (error) return fail("db_write", error);

          return redirect(`/dashboard/select-ad-account?account=${encodeURIComponent(accountId)}`);
        } catch (err) {
          return fail("token_exchange", err instanceof Error ? err.message : err);
        }
      },
    },
  },
});

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}
