import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

type LeadgenChange = {
  leadgen_id?: string;
  page_id?: string;
  form_id?: string;
  ad_id?: string;
  adgroup_id?: string;
  campaign_id?: string;
  created_time?: number;
};

// Receives real-time lead notifications from Meta Lead Ads.
// GET: Meta webhook verification handshake (hub.challenge).
// POST: leadgen change notifications -> insert lead rows keyed by leadgen_id.
//
// NOTE: the app does NOT hold the `leads_retrieval` permission, so Meta's
// payload is all we get: identifiers only, no name/email/phone. That is fine —
// the Conversions API accepts `user_data.lead_id` (= leadgen_id) as the
// preferred match key for lead-ads conversions. When `leads_retrieval` is
// approved later, enriching these rows with hashed PII is purely additive
// (update phone_hash/email_hash/raw_field_data on the existing row).
export const Route = createFileRoute("/api/public/webhooks/meta-leadgen")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const verifyToken = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env["META_VERIFY_TOKEN"] ?? process.env["META_APP_SECRET"];
        if (mode === "subscribe" && verifyToken && expected && verifyToken === expected) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const bodyText = await request.text();
        const appSecret = process.env["META_APP_SECRET"];
        const signature = request.headers.get("x-hub-signature-256") ?? "";

        // Signature verification is mandatory: the endpoint is public.
        if (!appSecret) {
          console.error("[meta-leadgen] META_APP_SECRET missing — cannot verify signature");
          return new Response("signature_unverifiable", { status: 401 });
        }
        const expected = `sha256=${createHmac("sha256", appSecret).update(bodyText).digest("hex")}`;
        const sig = Buffer.from(signature);
        const exp = Buffer.from(expected);
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
          console.error("[meta-leadgen] invalid X-Hub-Signature-256 — rejecting");
          return new Response("invalid_signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(bodyText);
        } catch {
          return new Response("invalid_json", { status: 400 });
        }

        // Meta batches: entry[] x changes[].
        const changes: LeadgenChange[] = [];
        for (const entry of payload?.entry ?? []) {
          for (const change of entry?.changes ?? []) {
            if (change?.field === "leadgen" && change?.value?.leadgen_id) {
              changes.push({
                ...change.value,
                page_id: change.value.page_id ?? entry?.id ?? null,
              });
            }
          }
        }

        if (!changes.length) return new Response("ok", { status: 200 });

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: accounts } = await supabaseAdmin
            .from("accounts")
            .select("id, meta_page_id, meta_ad_account_id")
            .eq("status", "active");

          const byPage = new Map<string, string>();
          for (const a of accounts ?? []) {
            const pageId = (a as { meta_page_id?: string | null }).meta_page_id;
            if (pageId) byPage.set(String(pageId), a.id);
          }

          for (const value of changes) {
            const leadgenId = String(value.leadgen_id);
            const pageId = value.page_id ? String(value.page_id) : null;
            const accountId = pageId ? byPage.get(pageId) ?? null : null;

            if (!accountId) {
              console.error(
                `[meta-leadgen] UNMAPPED LEAD: no account has meta_page_id=${pageId ?? "null"} ` +
                  `(leadgen_id=${leadgenId}, ad_id=${value.ad_id ?? "null"}, form_id=${value.form_id ?? "null"}). ` +
                  `Ask the account owner to save their Page ID on the Integration page.`,
              );
              continue;
            }

            // Idempotent: skip if we already stored this leadgen_id, and treat a
            // unique-violation (concurrent re-delivery) as a no-op too.
            const { data: existing } = await supabaseAdmin
              .from("leads")
              .select("id")
              .eq("account_id", accountId)
              .eq("meta_leadgen_id", leadgenId)
              .maybeSingle();
            if (existing) {
              console.log(`[meta-leadgen] duplicate delivery ignored leadgen_id=${leadgenId}`);
              continue;
            }

            const { data: inserted, error } = await supabaseAdmin
              .from("leads")
              .insert({
                account_id: accountId,
                meta_leadgen_id: leadgenId,
                ad_id: value.ad_id ?? value.adgroup_id ?? null,
                campaign_id: value.campaign_id ?? null,
                form_id: value.form_id ?? null,
                is_test: false,
                // PII stays null here; enrichment writes hashes only.
                phone_hash: null,
                email_hash: null,
                // Webhook envelope ONLY — never the enriched Graph field_data.
                raw_field_data: { webhook: value },
              })
              .select("id")
              .maybeSingle();
            if (error && error.code === "23505") {
              console.log(`[meta-leadgen] duplicate delivery ignored leadgen_id=${leadgenId}`);
            } else if (error) {
              console.error(`[meta-leadgen] insert failed for leadgen_id=${leadgenId}:`, error);
            } else {
              console.log(
                `[meta-leadgen] lead stored leadgen_id=${leadgenId} account=${accountId} ad_id=${value.ad_id ?? "null"}`,
              );
              if (inserted?.id) newLeadIds.push(inserted.id);
            }
          }
        } catch (err) {
          // Never 500: Meta retries and eventually disables the subscription.
          console.error("[meta-leadgen] processing failed:", err);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
