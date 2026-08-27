import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Revokes AdsPro's Meta access for the signed-in owner's account. Cookie-session
 * authed; the account is resolved server-side and never accepted from the client.
 */
export const Route = createFileRoute("/api/public/account/disconnect-meta")({
  server: {
    handlers: {
      POST: async () => {
        const { getServerAuthUser } = await import("@/integrations/supabase/session.server");
        const user = await getServerAuthUser();
        if (!user) return json({ ok: false, error: "not_authenticated" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: account, error } = await supabaseAdmin
          .from("accounts")
          .select("id")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error) return json({ ok: false, error: "db_read_failed" }, 500);
        if (!account) return json({ ok: false, error: "no_account" }, 404);

        const { disconnectMetaForAccount } = await import("@/lib/account-teardown.server");
        const { calls } = await disconnectMetaForAccount(supabaseAdmin, account.id, user.id);

        const dbFailure = calls.find((c) => c.step === "db_clear" && !c.ok);
        if (dbFailure) {
          return json({ ok: false, error: "db_write_failed", meta_calls: calls }, 500);
        }
        return json({ ok: true, meta_calls: calls });
      },
    },
  },
});
