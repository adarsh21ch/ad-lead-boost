import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type MetaPage = { id: string; name?: string; access_token?: string };

/**
 * Subscribes AdsPro to the `leadgen` field on one Facebook Page the caller owns.
 * accounts.meta_page_id is only written when Meta confirms success, so a saved
 * page id always means a live subscription.
 */
export const Route = createFileRoute("/api/public/pages/connect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getServerAuthUser } = await import("@/integrations/supabase/session.server");
        const user = await getServerAuthUser();
        if (!user) return json({ ok: false, error: "not_authenticated" }, 401);

        let body: { page_id?: string } = {};
        try {
          body = (await request.json()) ?? {};
        } catch {
          /* handled below */
        }
        const pageId = (body.page_id ?? "").trim();
        if (!/^\d{5,25}$/.test(pageId)) return json({ ok: false, error: "invalid_page_id" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: account, error: accErr } = await supabaseAdmin
          .from("accounts")
          .select("id")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (accErr) return json({ ok: false, error: "db_read_failed" }, 500);
        if (!account) return json({ ok: false, error: "no_account" }, 404);

        // The page must already be discovered for THIS account.
        const { data: owned } = await supabaseAdmin
          .from("meta_pages")
          .select("page_id")
          .eq("account_id", account.id)
          .eq("page_id", pageId)
          .maybeSingle();
        if (!owned) return json({ ok: false, error: "page_not_in_account" }, 403);

        const { getOwnedAccountToken, graphUrl, graphGet, getMetaGraphErrorDetails } = await import(
          "@/lib/meta.server"
        );
        const { reportTokenHealth, reportMetaError } = await import("@/lib/token-health.server");

        const recordFailure = async (message: string) => {
          await supabaseAdmin
            .from("meta_pages")
            .update({ subscribe_status: "failed", subscribe_error: message })
            .eq("account_id", account.id)
            .eq("page_id", pageId);
          await supabaseAdmin
            .from("accounts")
            // Deliberately NOT touching meta_page_id: a saved page id must never
            // exist without a working subscription.
            .update({ page_subscribe_status: "failed", page_subscribe_error: message })
            .eq("id", account.id);
        };

        let pageToken: string | undefined;
        try {
          const token = await getOwnedAccountToken(supabaseAdmin, account.id, user.id);
          const res = await graphGet(
            `${graphUrl("me/accounts")}?fields=id,name,access_token&limit=100`,
            token,
            "me/accounts",
          );
          pageToken = ((res.data ?? []) as MetaPage[]).find((p) => p.id === pageId)?.access_token;
          await reportTokenHealth(account.id, "ok", "pages");
        } catch (error) {
          const details = getMetaGraphErrorDetails(error);
          console.error("[pages:connect] token lookup failed", details);
          await reportMetaError(account.id, "pages", details);
          await recordFailure(details.message);
          return json(
            { ok: false, error: "scope_missing", message: details.message },
            200,
          );
        }


        if (!pageToken) {
          const message =
            "Meta did not return a Page access token for this Page. Reconnect Meta and make sure you grant Page access.";
          await recordFailure(message);
          return json({ ok: false, error: "no_page_token", message }, 200);
        }

        let httpStatus: number | null = null;
        let metaResponse: unknown = null;
        try {
          const res = await fetch(graphUrl(`${pageId}/subscribed_apps`), {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              subscribed_fields: "leadgen",
              access_token: pageToken,
            }).toString(),
          });
          httpStatus = res.status;
          const text = await res.text();
          try {
            metaResponse = JSON.parse(text);
          } catch {
            metaResponse = { raw: text };
          }
          console.error(`[pages:connect] page=${pageId} status=${res.status} body=${text.slice(0, 2000)}`);
        } catch (err) {
          metaResponse = { error: err instanceof Error ? err.message : "network_error" };
        }

        const success =
          httpStatus != null &&
          httpStatus >= 200 &&
          httpStatus < 300 &&
          (metaResponse as { success?: boolean } | null)?.success === true;

        if (!success) {
          const metaMessage =
            (metaResponse as { error?: { message?: string } } | null)?.error?.message ??
            "Meta rejected the Page subscription.";
          const needsScope = /#200|permission/i.test(metaMessage);
          await recordFailure(metaMessage);
          return json(
            {
              ok: false,
              error: needsScope ? "scope_missing" : "subscribe_failed",
              message: needsScope
                ? "Your Meta connection needs to be refreshed — click Reconnect Meta."
                : metaMessage,
              meta_message: metaMessage,
              http_status: httpStatus,
              meta_response: metaResponse,
            },
            200,
          );
        }

        const nowIso = new Date().toISOString();
        await supabaseAdmin
          .from("meta_pages")
          .update({ subscribe_status: "subscribed", subscribed_at: nowIso, subscribe_error: null })
          .eq("account_id", account.id)
          .eq("page_id", pageId);
        await supabaseAdmin
          .from("accounts")
          .update({
            meta_page_id: pageId,
            page_subscribe_status: "subscribed",
            page_subscribed_at: nowIso,
            page_subscribe_error: null,
          })
          .eq("id", account.id);

        return json({
          ok: true,
          page_id: pageId,
          subscribed_at: nowIso,
          http_status: httpStatus,
          meta_response: metaResponse,
        });
      },
    },
  },
});
