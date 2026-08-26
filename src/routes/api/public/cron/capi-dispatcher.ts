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
  const accepted = [process.env["CAPI_CRON_SECRET"], process.env["LOVABLE_CRON_SECRET"]].filter(
    (v): v is string => Boolean(v),
  );
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !accepted.includes(token)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { deliverStatusEvent, findDueStatusEvents } = await import("@/lib/meta.server");

  // Overlap guard: only one dispatcher run at a time. A second concurrent
  // invocation returns immediately instead of re-sending the same events.
  const { data: gotLock, error: lockError } = await supabaseAdmin.rpc("capi_dispatcher_try_lock");
  if (lockError) {
    console.error("[capi-dispatcher] advisory lock rpc failed", lockError);
    return new Response(JSON.stringify({ skipped: true, reason: "lock_error" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (!gotLock) {
    return new Response(JSON.stringify({ skipped: true, reason: "already_running" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    return await dispatchBatch(supabaseAdmin, findDueStatusEvents, deliverStatusEvent);
  } finally {
    const { error: unlockError } = await supabaseAdmin.rpc("capi_dispatcher_unlock");
    if (unlockError) console.error("[capi-dispatcher] advisory unlock failed", unlockError);
  }
}

async function dispatchBatch(
  supabaseAdmin: any,
  findDueStatusEvents: any,
  deliverStatusEvent: any,
) {
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
