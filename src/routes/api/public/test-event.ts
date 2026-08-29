import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const TEST_LEADGEN_ID = "adspro_test_lead";
const TEST_EMAIL = "test@adsproindia.com";

// Session-authenticated (cookie) test-event endpoint. Runs the REAL delivery
// path synchronously and returns Meta's verbatim response.
export const Route = createFileRoute("/api/public/test-event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getServerAuthUser } = await import("@/integrations/supabase/session.server");
        const user = await getServerAuthUser();
        if (!user) return json({ ok: false, error: "not_authenticated" }, 401);

        let body: { test_event_code?: string } = {};
        try {
          body = (await request.json()) ?? {};
        } catch {
          /* empty body is fine */
        }
        const testEventCode = body.test_event_code?.trim() || undefined;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: account, error: accErr } = await supabaseAdmin
          .from("accounts")
          .select("id, status, meta_dataset_id, meta_access_token_encrypted, meta_token_expires_at")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (accErr) return json({ ok: false, error: "db_read_failed" }, 500);
        if (!account) return json({ ok: false, error: "no_account" }, 404);
        if (account.status !== "active" || !account.meta_dataset_id) {
          return json({ ok: false, error: "account_not_active" }, 409);
        }
        if (!account.meta_access_token_encrypted) {
          return json({ ok: false, error: "meta_not_connected" }, 409);
        }
        if (
          account.meta_token_expires_at &&
          new Date(account.meta_token_expires_at).getTime() < Date.now()
        ) {
          return json({ ok: false, error: "meta_token_expired" }, 409);
        }

        const { hashForMeta, decryptToken, graphUrl } = await import("@/lib/meta.server");
        const emailHash = hashForMeta(TEST_EMAIL);

        // Reuse one stable test lead per account.
        const { data: existing } = await supabaseAdmin
          .from("leads")
          .select("id, event_id")
          .eq("account_id", account.id)
          .eq("meta_leadgen_id", TEST_LEADGEN_ID)
          .maybeSingle();

        let lead = existing;
        if (!lead) {
          const { data: created, error: leadErr } = await supabaseAdmin
            .from("leads")
            .insert({
              account_id: account.id,
              meta_leadgen_id: TEST_LEADGEN_ID,
              email_hash: emailHash,
              is_test: true,
              raw_field_data: { test: true },
            })
            .select("id, event_id")
            .single();
          if (leadErr || !created) return json({ ok: false, error: "lead_write_failed" }, 500);
          lead = created;
        }

        const { data: statusEvent, error: evErr } = await supabaseAdmin
          .from("status_events")
          .insert({
            account_id: account.id,
            lead_id: lead.id,
            status: "qualified",
            source: "manual",
            raw_payload: { test: true, test_event_code: testEventCode ?? null },
          })
          .select("id, created_at")
          .single();
        if (evErr || !statusEvent) return json({ ok: false, error: "event_write_failed" }, 500);

        const accessToken = await decryptToken(supabaseAdmin, account.meta_access_token_encrypted);
        const payload: Record<string, unknown> = {
          data: [
            {
              event_name: "Lead_Qualified",
              event_id: lead.event_id,
              event_time: Math.floor(new Date(statusEvent.created_at).getTime() / 1000),
              action_source: "system_generated",
              user_data: { em: [emailHash], lead_id: TEST_LEADGEN_ID },
            },
          ],
        };
        if (testEventCode) payload["test_event_code"] = testEventCode;

        let httpStatus: number | null = null;
        let metaResponse: unknown = null;
        try {
          const res = await fetch(graphUrl(`${account.meta_dataset_id}/events`), {
            method: "POST",
            headers: {
              "content-type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
          });
          httpStatus = res.status;
          const text = await res.text();
          try {
            metaResponse = JSON.parse(text);
          } catch {
            metaResponse = { raw: text };
          }
          console.error(`[meta:test-event] status=${res.status} body=${text.slice(0, 4000)}`);
        } catch (err) {
          metaResponse = { error: err instanceof Error ? err.message : "network_error" };
          console.error("[meta:test-event] network failure", metaResponse);
        }

        const ok = httpStatus != null && httpStatus >= 200 && httpStatus < 300;

        // One call per Meta response; record_token_health owns all state logic.
        const { reportTokenHealth, reportMetaError } = await import("@/lib/token-health.server");
        if (ok) {
          await reportTokenHealth(account.id, "ok", "dispatcher");
        } else {
          const metaErrorBody = (metaResponse as { error?: Record<string, unknown> } | null)?.error;
          await reportMetaError(account.id, "dispatcher", {
            code: typeof metaErrorBody?.["code"] === "number" ? (metaErrorBody["code"] as number) : null,
            errorSubcode:
              typeof metaErrorBody?.["error_subcode"] === "number"
                ? (metaErrorBody["error_subcode"] as number)
                : null,
            httpStatus,
            message:
              typeof metaErrorBody?.["message"] === "string"
                ? (metaErrorBody["message"] as string)
                : null,
          });
        }

        await supabaseAdmin.from("capi_delivery_logs").insert({
          status_event_id: statusEvent.id,
          meta_event_name: "Lead_Qualified",
          http_status: httpStatus,
          meta_response: metaResponse as never,
          retry_count: 0,
          is_test: true,
          delivered_at: ok ? new Date().toISOString() : null,
        });

        // Test events are one-shot: never leave them pending for the cron dispatcher.
        await supabaseAdmin
          .from("status_events")
          .update({ dispatch_status: ok ? "delivered" : "abandoned" })
          .eq("id", statusEvent.id);

        return json(
          {
            ok,
            http_status: httpStatus,
            meta_response: metaResponse,
            status_event_id: statusEvent.id,
          },
          200,
        );
      },
    },
  },
});
