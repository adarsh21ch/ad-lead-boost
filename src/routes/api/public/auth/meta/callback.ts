import { createFileRoute } from "@tanstack/react-router";

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

// Completes the "Connect Meta" OAuth flow: exchanges the code for a
// short-lived token, upgrades to a long-lived token, and stores it on the
// account row identified by `state`.
export const Route = createFileRoute("/api/public/auth/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return redirect("/dashboard?meta_connect=error");

        const appId = process.env["META_APP_ID"];
        const appSecret = process.env["META_APP_SECRET"];
        const { getMetaRedirectUri, parseMetaOAuthState } = await import("@/lib/meta.server");
        const redirectUri = getMetaRedirectUri(request.url);
        const accountId = parseMetaOAuthState(state);
        if (!accountId) return redirect("/dashboard?meta_connect=error");
        if (!appId || !appSecret || !redirectUri) return redirect("/dashboard?meta_connect=error");

        try {
          // 1. code -> short-lived token
          const shortRes = await fetch(
            `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${encodeURIComponent(appId)}` +
              `&redirect_uri=${encodeURIComponent(redirectUri)}` +
              `&client_secret=${encodeURIComponent(appSecret)}` +
              `&code=${encodeURIComponent(code)}`,
          );
          const shortJson = await shortRes.json();
          if (!shortRes.ok || !shortJson.access_token) return redirect("/dashboard?meta_connect=error");

          // 2. short-lived -> long-lived token (~60 days)
          const longRes = await fetch(
            `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token` +
              `&client_id=${encodeURIComponent(appId)}` +
              `&client_secret=${encodeURIComponent(appSecret)}` +
              `&fb_exchange_token=${encodeURIComponent(shortJson.access_token)}`,
          );
          const longJson = await longRes.json();
          if (!longRes.ok || !longJson.access_token) return redirect("/dashboard?meta_connect=error");

          const expiresAt = longJson.expires_in
            ? new Date(Date.now() + Number(longJson.expires_in) * 1000).toISOString()
            : null;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // TODO(production): encrypt the token with pgcrypto before storing.
          const { error } = await supabaseAdmin
            .from("accounts")
            .update({
              meta_access_token_encrypted: longJson.access_token,
              meta_token_expires_at: expiresAt,
              status: "active",
            })
            .eq("id", accountId);
          if (error) return redirect("/dashboard?meta_connect=error");

          return redirect(`/dashboard/select-ad-account?account=${encodeURIComponent(accountId)}`);
        } catch {
          return redirect("/dashboard?meta_connect=error");
        }
      },
    },
  },
});
