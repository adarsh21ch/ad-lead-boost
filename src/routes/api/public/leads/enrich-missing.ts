import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Backfills lead names / ad hierarchy for leads that arrived before enrichment
 * shipped. Cookie-session authed; the account is resolved server-side and never
 * accepted from the client. Max 25 leads per call, sequential, stops on Meta
 * rate-limit codes.
 */
export const Route = createFileRoute("/api/public/leads/enrich-missing")({
  server: {
    handlers: {
      POST: async () => {
        const { isLeadEnrichmentEnabled, enrichMissingForAccount } = await import(
          "@/lib/lead-enrichment.server"
        );
        if (!isLeadEnrichmentEnabled()) return json({ ok: false, error: "disabled" }, 404);

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

        try {
          const result = await enrichMissingForAccount(supabaseAdmin, account.id);
          if (result.rate_limited) {
            return json({ ok: false, error: "rate_limited", processed: result.processed });
          }
          if (result.scope_missing && result.enriched === 0) {
            return json({ ok: false, error: "scope_missing", processed: result.processed });
          }
          return json({ ok: true, ...result });
        } catch (err) {
          console.error("[lead-enrichment] backfill failed", err);
          return json({ ok: false, error: "backfill_failed" }, 500);
        }
      },
    },
  },
});
