import { createFileRoute } from "@tanstack/react-router";

// Scheduled dispatcher — call every 1-2 minutes (Supabase Cron / external
// scheduler). Delivers queued status_events to Meta's Conversions API.
// Auth: `Authorization: Bearer <LOVABLE_CRON_SECRET>`.
export const Route = createFileRoute("/api/public/cron/capi-dispatcher")({
  server: {
    handlers: {
      POST: async ({ request }) => runDispatcher(request),
      GET: async ({ request }) => runDispatcher(request),
    },
  },
});

async function runDispatcher(request: Request) {
  const secret = process.env["LOVABLE_CRON_SECRET"];
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!secret || token !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { deliverStatusEvent, findDueStatusEvents } = await import("@/lib/meta.server");
  const due = await findDueStatusEvents(supabaseAdmin, 50);

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
