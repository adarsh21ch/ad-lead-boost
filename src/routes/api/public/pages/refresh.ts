import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type MetaPage = { id: string; name?: string; access_token?: string };

/**
 * Lists the Facebook Pages the connected Meta user administers and mirrors them
 * into public.meta_pages (service-role write). Page access tokens are used
 * in-request only and NEVER persisted.
 */
export const Route = createFileRoute("/api/public/pages/refresh")({
  server: {
    handlers: {
      POST: async () => {
        const { getServerAuthUser } = await import("@/integrations/supabase/session.server");
        const user = await getServerAuthUser();
        if (!user) return json({ ok: false, error: "not_authenticated" }, 401);

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

        const { getOwnedAccountToken, graphUrl, graphGet, getMetaGraphErrorDetails } = await import(
          "@/lib/meta.server"
        );
        const { reportTokenHealth, reportMetaError } = await import("@/lib/token-health.server");

        let pages: MetaPage[];
        try {
          const token = await getOwnedAccountToken(supabaseAdmin, account.id, user.id);
          const res = await graphGet(
            `${graphUrl("me/accounts")}?fields=id,name,access_token&limit=100`,
            token,
            "me/accounts",
          );
          pages = ((res.data ?? []) as MetaPage[]).filter((p) => Boolean(p?.id));
          await reportTokenHealth(account.id, "ok", "pages");
        } catch (error) {
          const details = getMetaGraphErrorDetails(error);
          console.error("[pages:refresh] graph failure", details);
          await reportMetaError(account.id, "pages", details);
          const missingScope =
            details.code === 200 ||
            details.code === 190 ||
            /permission|pages_show_list|OAuthException/i.test(details.message);
          return json(
            {
              ok: false,
              error: missingScope ? "scope_missing" : "graph_failed",
              message: details.message,
              meta_response: details.rawResponse,
            },
            200,
          );
        }


        // Upsert without clobbering an existing subscribe_status/subscribed_at.
        const { data: existing } = await supabaseAdmin
          .from("meta_pages")
          .select("id, page_id")
          .eq("account_id", account.id);
        const existingIds = new Set((existing ?? []).map((r) => r.page_id));
        const nowIso = new Date().toISOString();

        for (const page of pages) {
          if (existingIds.has(page.id)) {
            await supabaseAdmin
              .from("meta_pages")
              .update({ page_name: page.name ?? null, discovered_at: nowIso })
              .eq("account_id", account.id)
              .eq("page_id", page.id);
          } else {
            const { error } = await supabaseAdmin.from("meta_pages").insert({
              account_id: account.id,
              page_id: page.id,
              page_name: page.name ?? null,
              discovered_at: nowIso,
            });
            if (error && error.code !== "23505") {
              console.error("[pages:refresh] insert failed", page.id, error);
            }
          }
        }

        const { data: rows } = await supabaseAdmin
          .from("meta_pages")
          .select("page_id, page_name, subscribe_status, subscribe_error, subscribed_at")
          .eq("account_id", account.id)
          .order("page_name", { ascending: true });

        return json({ ok: true, pages: rows ?? [] });
      },
    },
  },
});
