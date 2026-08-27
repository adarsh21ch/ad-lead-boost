import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type MetaPage = { id: string; name?: string; access_token?: string };

/**
 * Unsubscribes AdsPro from the `leadgen` field on one Facebook Page the caller
 * owns. Page access tokens are fetched in-request and NEVER persisted, and the
 * client can never supply a token.
 */
export const Route = createFileRoute("/api/public/pages/disconnect")({
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
          .select("id, meta_page_id")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (accErr) return json({ ok: false, error: "db_read_failed" }, 500);
        if (!account) return json({ ok: false, error: "no_account" }, 404);

        const { data: owned } = await supabaseAdmin
          .from("meta_pages")
          .select("page_id")
          .eq("account_id", account.id)
          .eq("page_id", pageId)
          .maybeSingle();
        if (!owned) return json({ ok: false, error: "page_not_in_account" }, 403);

        const { getOwnedAccountToken, graphUrl, graphGet, getMetaGraphErrorDetails } =
          await import("@/lib/meta.server");

        let pageToken: string | undefined;
        try {
          const token = await getOwnedAccountToken(supabaseAdmin, account.id, user.id);
          const res = await graphGet(
            `${graphUrl("me/accounts")}?fields=id,name,access_token&limit=100`,
            token,
            "me/accounts",
          );
          pageToken = ((res.data ?? []) as MetaPage[]).find((p) => p.id === pageId)?.access_token;
        } catch (error) {
          const details = getMetaGraphErrorDetails(error);
          console.error("[pages:disconnect] token lookup failed", details);
          return json({ ok: false, error: "scope_missing", message: details.message }, 200);
        }

        if (!pageToken) {
          const message =
            "Meta did not return a Page access token for this Page. Reconnect Meta and make sure you grant Page access.";
          return json({ ok: false, error: "no_page_token", message }, 200);
        }

        let httpStatus: number | null = null;
        let metaResponse: unknown = null;
        try {
          const res = await fetch(
            `${graphUrl(`${pageId}/subscribed_apps`)}?access_token=${encodeURIComponent(pageToken)}`,
            { method: "DELETE" },
          );
          httpStatus = res.status;
          const text = await res.text();
          try {
            metaResponse = JSON.parse(text);
          } catch {
            metaResponse = { raw: text };
          }
          console.error(
            `[pages:disconnect] page=${pageId} status=${res.status} body=${text.slice(0, 2000)}`,
          );
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
            "Meta rejected the Page unsubscribe.";
          // Deliberately leaving accounts state untouched on failure.
          return json(
            {
              ok: false,
              error: "unsubscribe_failed",
              message: metaMessage,
              meta_message: metaMessage,
              http_status: httpStatus,
              meta_response: metaResponse,
            },
            200,
          );
        }

        await supabaseAdmin
          .from("meta_pages")
          .update({ subscribe_status: "not_attempted", subscribed_at: null, subscribe_error: null })
          .eq("account_id", account.id)
          .eq("page_id", pageId);

        if (account.meta_page_id === pageId) {
          await supabaseAdmin
            .from("accounts")
            .update({
              meta_page_id: null,
              page_subscribe_status: "not_attempted",
              page_subscribed_at: null,
              page_subscribe_error: null,
            })
            .eq("id", account.id);
        }

        return json({
          ok: true,
          page_id: pageId,
          http_status: httpStatus,
          meta_response: metaResponse,
        });
      },
    },
  },
});
