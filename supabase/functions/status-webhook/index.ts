// Generic inbound status webhook — Zapier or any CRM POSTs here.
// Auth: Authorization: Bearer <account.webhook_api_key> (never the key in the URL).
// Body: { lead_reference: string (meta_leadgen_id, phone, or email), status: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STATUS_VALUES = [
  "contacted",
  "qualified",
  "not_qualified",
  "booked",
  "no_show",
  "purchased",
] as const;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const apiKey = authHeader.replace(/^Bearer\s+/i, "");
  if (!apiKey) {
    return new Response("Missing Authorization header", { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.lead_reference || !body?.status) {
    return new Response("Expected { lead_reference, status }", { status: 400 });
  }
  if (!STATUS_VALUES.includes(body.status)) {
    return new Response(`status must be one of: ${STATUS_VALUES.join(", ")}`, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, status")
    .eq("webhook_api_key", apiKey)
    .single();

  if (accountError || !account) {
    return new Response("Invalid API key", { status: 401 });
  }
  if (account.status !== "active") {
    return new Response(`Account status is '${account.status}', not active`, { status: 409 });
  }

  // Match by meta_leadgen_id first, fall back to hashed phone/email.
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("account_id", account.id)
    .or(
      `meta_leadgen_id.eq.${body.lead_reference},phone_hash.eq.${body.lead_reference},email_hash.eq.${body.lead_reference}`,
    )
    .limit(1)
    .maybeSingle();

  if (!lead) {
    return new Response("No matching lead found for lead_reference", { status: 404 });
  }

  const { data: statusEvent, error: insertError } = await supabase
    .from("status_events")
    .insert({
      account_id: account.id,
      lead_id: lead.id,
      status: body.status,
      source: "webhook",
      raw_payload: body,
    })
    .select("id")
    .single();

  if (insertError) {
    return new Response("Failed to record status event", { status: 500 });
  }

  // CAPI dispatch is picked up by a separate cron-triggered dispatcher function
  // (see supabase/functions/capi-dispatcher) rather than sent inline here, so a
  // slow/failing Meta call never blocks or times out the caller's webhook.
  return new Response(JSON.stringify({ ok: true, status_event_id: statusEvent.id }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
});
