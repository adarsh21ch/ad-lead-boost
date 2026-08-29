import { createFileRoute } from "@tanstack/react-router";
import { LEAD_STATUSES } from "@/lib/adspro.constants";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Generic inbound webhook for Zapier / any external CRM.
// Auth: `Authorization: Bearer <account.webhook_api_key>` (never a URL param).
// Body: { lead_reference: string, status: string }
export const Route = createFileRoute("/api/public/webhooks/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!token) return json({ error: "missing_bearer_token" }, 401);

        let body: { lead_reference?: string; status?: string };
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }
        const leadReference = body.lead_reference?.trim();
        const status = body.status?.trim();
        if (!leadReference || !status) return json({ error: "missing_fields" }, 400);
        if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
          return json({ error: "invalid_status", allowed: LEAD_STATUSES }, 400);
        }

        // A Meta leadgen_id is digits only and bounded in length. Anything else
        // is not a lead reference we could ever match — reject as not found,
        // without echoing the offending input back to the caller.
        const isValidReference = /^[0-9]{1,32}$/.test(leadReference);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: account } = await supabaseAdmin
          .from("accounts")
          .select("id, status")
          .eq("webhook_api_key", token)
          .maybeSingle();
        if (!account) return json({ error: "invalid_api_key" }, 401);
        if (account.status !== "active") return json({ error: "account_not_active" }, 409);

        if (!isValidReference) return json({ error: "lead_not_found" }, 404);

        // Parameterised lookups only: the caller value is passed as an .eq()
        // value and never becomes part of the filter syntax. Every query keeps
        // the non-negotiable account_id scope so a lookup can never cross tenants.
        const { hashForMeta } = await import("@/lib/meta.server");
        const hashed = hashForMeta(leadReference);

        const findBy = async (column: "meta_leadgen_id" | "phone_hash" | "email_hash", value: string) => {
          const { data } = await supabaseAdmin
            .from("leads")
            .select("id")
            .eq("account_id", account.id)
            .eq(column, value)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          return data;
        };

        const lead =
          (await findBy("meta_leadgen_id", leadReference)) ??
          (await findBy("phone_hash", hashed)) ??
          (await findBy("email_hash", hashed));
        if (!lead) return json({ error: "lead_not_found" }, 404);


        // Deliberately does NOT call Meta here — the capi-dispatcher delivers
        // asynchronously so this endpoint stays fast.
        const { data: event, error } = await supabaseAdmin
          .from("status_events")
          .insert({
            account_id: account.id,
            lead_id: lead.id,
            status,
            source: "webhook",
            raw_payload: body,
          })
          .select("id")
          .single();
        if (error) return json({ error: "insert_failed" }, 500);

        return json({ id: event.id }, 202);
      },
    },
  },
});
