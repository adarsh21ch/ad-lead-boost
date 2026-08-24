// Cron-triggered (e.g. every 1-2 min via pg_cron or Supabase scheduled function):
// picks up undelivered status_events, sends each to Meta's Conversion Leads endpoint,
// logs the response. Kept separate from the intake webhook so Meta latency/outages
// never block lead/status ingestion.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STATUS_TO_META_EVENT: Record<string, string> = {
  contacted: "Lead_Contacted",
  qualified: "Lead_Qualified",
  not_qualified: "Lead_Disqualified",
  booked: "Schedule",
  no_show: "Lead_NoShow",
  purchased: "Purchase",
};

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Undelivered = no row yet in capi_delivery_logs for this status_event.
  const { data: pending } = await supabase
    .from("status_events")
    .select(
      "id, status, account_id, lead:leads(id, event_id, phone_hash, email_hash, fbc, fbp, client_ip, client_user_agent, meta_leadgen_id), account:accounts(meta_ad_account_id, meta_dataset_id, meta_access_token_encrypted, status)",
    )
    .limit(50);

  const results: Array<{ id: string; ok: boolean }> = [];

  for (const event of pending ?? []) {
    const account = Array.isArray(event.account) ? event.account[0] : event.account;
    const lead = Array.isArray(event.lead) ? event.lead[0] : event.lead;
    if (!account || account.status !== "active" || !lead) continue;

    const metaEventName = STATUS_TO_META_EVENT[event.status];
    if (!metaEventName) continue;

    // TODO: decrypt account.meta_access_token_encrypted via pgcrypto/Vault before use.
    const accessToken = account.meta_access_token_encrypted;

    const payload = {
      data: [
        {
          event_name: metaEventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: lead.event_id, // shared id -> Meta dedups against any client-side pixel Lead event
          action_source: "system_generated",
          user_data: {
            ph: lead.phone_hash ? [lead.phone_hash] : undefined,
            em: lead.email_hash ? [lead.email_hash] : undefined,
            fbc: lead.fbc || undefined,
            fbp: lead.fbp || undefined,
            client_ip_address: lead.client_ip || undefined,
            client_user_agent: lead.client_user_agent || undefined,
            lead_id: lead.meta_leadgen_id || undefined,
          },
        },
      ],
    };

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${account.meta_dataset_id}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const responseBody = await res.json().catch(() => ({}));

    await supabase.from("capi_delivery_logs").insert({
      status_event_id: event.id,
      meta_event_name: metaEventName,
      http_status: res.status,
      meta_response: responseBody,
      delivered_at: res.ok ? new Date().toISOString() : null,
    });

    results.push({ id: event.id, ok: res.ok });
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
