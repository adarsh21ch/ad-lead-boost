import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Permanently deletes the signed-in owner's AdsPro account and auth user.
 * Meta access is revoked first, then the accounts row is deleted (cascading to
 * leads, status_events, capi_delivery_logs, meta_pages), then the auth user.
 */
export const Route = createFileRoute("/api/public/account/delete")({
  server: {
    handlers: {
      POST: async () => {
        const { getServerAuthUser } = await import("@/integrations/supabase/session.server");
        const user = await getServerAuthUser();
        if (!user) return json({ ok: false, error: "not_authenticated" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: accounts, error } = await supabaseAdmin
          .from("accounts")
          .select("id")
          .eq("owner_user_id", user.id);
        if (error) return json({ ok: false, error: "db_read_failed" }, 500);

        const { disconnectMetaForAccount } = await import("@/lib/account-teardown.server");
        for (const account of accounts ?? []) {
          try {
            await disconnectMetaForAccount(supabaseAdmin, account.id, user.id);
          } catch (err) {
            console.error(
              "[account:delete] meta revoke failed (continuing with deletion)",
              err instanceof Error ? err.message : err,
            );
          }
        }

        const { error: delErr } = await supabaseAdmin
          .from("accounts")
          .delete()
          .eq("owner_user_id", user.id);
        if (delErr) {
          console.error("[account:delete] accounts delete failed", delErr.message);
          return json({ ok: false, error: "db_delete_failed", message: delErr.message }, 500);
        }

        const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
        if (authErr) {
          // Data is already gone — never leave the user on a dashboard for
          // records that no longer exist. Report, but let the client sign out.
          console.error("[account:delete] auth user delete failed", authErr.message);
          return json({ ok: true, auth_user_deleted: false, message: authErr.message });
        }

        return json({ ok: true, auth_user_deleted: true });
      },
    },
  },
});
