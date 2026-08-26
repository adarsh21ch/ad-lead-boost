import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// Receives real-time lead notifications from Meta Lead Ads.
// GET: Meta webhook verification handshake (hub.challenge).
// POST: leadgen change notifications -> fetch full lead data -> insert lead.
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
        if (appSecret) {
          const expected = `sha256=${createHmac("sha256", appSecret).update(bodyText).digest("hex")}`;
          const sig = Buffer.from(signature);
          const exp = Buffer.from(expected);
          if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
            return new Response("invalid_signature", { status: 401 });
          }
        }

        let payload: any;
        try {
          payload = JSON.parse(bodyText);
        } catch {
          return new Response("invalid_json", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { graphUrl, hashForMeta } = await import("@/lib/meta.server");

        const changes: any[] = [];
        for (const entry of payload?.entry ?? []) {
          for (const change of entry?.changes ?? []) {
            if (change?.field === "leadgen" && change?.value?.leadgen_id) changes.push(change.value);
          }
        }

        if (changes.length) {
          const { data: accounts } = await supabaseAdmin
            .from("accounts")
            .select("id, meta_access_token_encrypted")
            .eq("status", "active")
            .not("meta_access_token_encrypted", "is", null);

          for (const value of changes) {
            const leadgenId: string = value.leadgen_id;
            // The leadgen payload doesn't say which ad account it belongs to,
            // so try each connected account token until Meta returns the lead.
            let accountId: string | null = null;
            let leadData: any = null;
            for (const account of accounts ?? []) {
              try {
                const res = await fetch(
                  `${graphUrl(leadgenId)}?access_token=${encodeURIComponent(account.meta_access_token_encrypted)}`,
                );
                if (res.ok) {
                  leadData = await res.json();
                  accountId = account.id;
                  break;
                }
              } catch {
                // try next account
              }
            }
            if (!accountId || !leadData) continue;

            const fields: Array<{ name: string; values: string[] }> = leadData.field_data ?? [];
            const get = (name: string) =>
              fields.find((f) => f.name === name)?.values?.[0] ?? null;
            const rawPhone = get("phone_number");
            const rawEmail = get("email");

            // fbc/fbp/IP/user-agent typically come from a companion pixel event
            // on the same page as the Instant Form, not from the leadgen
            // payload itself — left null here when unavailable.
            await supabaseAdmin.from("leads").upsert({
              account_id: accountId,
              meta_leadgen_id: leadgenId,
              phone_hash: rawPhone ? hashForMeta(rawPhone.replace(/[^0-9]/g, "")) : null,
              email_hash: rawEmail ? hashForMeta(rawEmail) : null,
              fbc: null,
              fbp: null,
              client_ip: null,
              client_user_agent: null,
              ad_id: value.ad_id ?? leadData.ad_id ?? null,
              campaign_id: value.campaign_id ?? leadData.campaign_id ?? null,
              form_id: value.form_id ?? leadData.form_id ?? null,
              raw_field_data: leadData,
            }, { onConflict: "account_id,meta_leadgen_id", ignoreDuplicates: true });
          }
        }

        // Meta expects a fast 200 regardless of per-lead outcome.
        return new Response("ok", { status: 200 });
      },
    },
  },
});
