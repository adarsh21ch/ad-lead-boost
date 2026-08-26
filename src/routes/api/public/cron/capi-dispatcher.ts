import { createFileRoute } from "@tanstack/react-router";

// Scheduled dispatcher — runs every 2 minutes (Supabase pg_cron + pg_net).
// Delivers queued status_events to Meta's Conversions API.
// Auth: `Authorization: Bearer <CAPI_CRON_SECRET>` (legacy LOVABLE_CRON_SECRET
// is also accepted).
export const Route = createFileRoute("/api/public/cron/capi-dispatcher")({
  server: {
    handlers: {
      POST: async ({ request }) => runDispatcher(request),
      GET: async ({ request }) => runDispatcher(request),
    },
  },
});

async function runDispatcher(request: Request) {
  const accepted = [process.env["CAPI_CRON_SECRET"], process.env["LOVABLE_CRON_SECRET"]].filter(
    (v): v is string => Boolean(v),
  );
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !accepted.includes(token)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { deliverStatusEvent } = await import("@/lib/meta.server");

  // Overlap guard: claim due events atomically with FOR UPDATE SKIP LOCKED and
  // push next_attempt_at forward, so a second concurrent run picks up a
  // disjoint batch and can never double-send the same event.
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_due_status_events", {
    p_limit: 50,
  });
  if (claimError) {
    console.error("[capi-dispatcher] claim failed", claimError);
    return new Response(JSON.stringify({ processed: 0, error: "claim_failed" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const due = (claimed ?? []) as Array<{
    id: string;
    account_id: string;
    lead_id: string;
    status: string;
    created_at: string;
  }>;

  const results: Array<{
    id: string;
    ok: boolean;
    httpStatus: number | null;
    attempt: number;
    dispatchStatus: string;
  }> = [];
  for (const event of due) {
    const result = await deliverStatusEvent(supabaseAdmin, event);
    results.push({
      id: event.id,
      ok: result.ok,
      httpStatus: result.httpStatus,
      attempt: result.attempt,
      dispatchStatus: result.dispatchStatus,
    });
  }

  return new Response(
    JSON.stringify({
      processed: results.length,
      abandoned: results.filter((r) => r.dispatchStatus === "abandoned").length,
      results,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
