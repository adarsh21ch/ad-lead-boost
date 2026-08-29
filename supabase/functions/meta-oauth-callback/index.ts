// Meta OAuth callback — completes "Connect Meta" after the user grants permissions.
// Flow: frontend redirects to Meta's OAuth dialog with our app's client_id + redirect_uri
// -> Meta redirects back here with ?code=... -> we exchange code for a long-lived token
// -> store it encrypted on the account row -> redirect user back to the dashboard.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const META_APP_ID = Deno.env.get("META_APP_ID")!;
const META_APP_SECRET = Deno.env.get("META_APP_SECRET")!;
const REDIRECT_URI = Deno.env.get("META_OAUTH_REDIRECT_URI")!; // e.g. https://app.adsproindia.com/auth/meta/callback

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // account_id, set when we sent the user to Meta
  const oauthError = url.searchParams.get("error_description");

  if (oauthError) {
    return Response.redirect(`${redirectBase(url)}/dashboard?meta_connect=denied`, 302);
  }
  if (!code || !state) {
    return new Response("Missing code or state", { status: 400 });
  }

  // Step 1: exchange the short-lived code for a short-lived user access token.
  const tokenRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?` +
      new URLSearchParams({
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
      }),
  );
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    console.error("Meta token exchange failed", tokenJson);
    return Response.redirect(`${redirectBase(url)}/dashboard?meta_connect=error`, 302);
  }

  // Step 2: exchange short-lived token for a long-lived one (~60 days).
  const longLivedRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        fb_exchange_token: tokenJson.access_token,
      }),
  );
  const longLivedJson = await longLivedRes.json();
  if (!longLivedRes.ok || !longLivedJson.access_token) {
    console.error("Meta long-lived token exchange failed", longLivedJson);
    return Response.redirect(`${redirectBase(url)}/dashboard?meta_connect=error`, 302);
  }

  const expiresAt = new Date(Date.now() + (longLivedJson.expires_in ?? 5184000) * 1000);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // TODO: encrypt longLivedJson.access_token with pgcrypto (pgp_sym_encrypt) before
  // storing — never write a Meta access token to the DB in plaintext. Wire this up
  // once the Supabase project + a stored encryption key exist.
  const { error: updateError } = await supabase
    .from("accounts")
    .update({
      meta_access_token_encrypted: longLivedJson.access_token, // PLACEHOLDER — see TODO above
      meta_token_expires_at: expiresAt.toISOString(),
      status: "active",
    })
    .eq("id", state);

  if (updateError) {
    console.error("Failed to save Meta token", updateError);
    return Response.redirect(`${redirectBase(url)}/dashboard?meta_connect=error`, 302);
  }

  // Next step (separate route, not yet built): let the user pick which ad account +
  // dataset/pixel this token should push events to, via GET /me/adaccounts.
  return Response.redirect(`${redirectBase(url)}/dashboard/select-ad-account?account=${state}`, 302);
});

function redirectBase(url: URL): string {
  return Deno.env.get("APP_URL") ?? `${url.protocol}//${url.host}`;
}
