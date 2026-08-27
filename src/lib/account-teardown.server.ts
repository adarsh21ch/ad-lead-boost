/**
 * Server-only teardown helpers shared by the Settings page routes.
 *
 * `disconnectMetaForAccount` revokes access on Meta's side (Page unsubscribe +
 * DELETE /me/permissions) and then clears every Meta field on the account. Lead
 * history is deliberately left untouched — disconnecting is not deleting.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AdminClient = SupabaseClient<Database>;

export type MetaCallLog = {
  step: string;
  http_status: number | null;
  body: unknown;
  ok: boolean;
};

/** Value `accounts.status` carries before a successful Meta connect. */
export const PRE_CONNECT_STATUS = "pending_meta_connect";

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function disconnectMetaForAccount(
  admin: AdminClient,
  accountId: string,
  userId: string,
): Promise<{ calls: MetaCallLog[] }> {
  const calls: MetaCallLog[] = [];

  const { data: account } = await admin
    .from("accounts")
    .select("id, meta_page_id, meta_access_token_encrypted")
    .eq("id", accountId)
    .maybeSingle();

  const { getOwnedAccountToken, graphUrl, graphGet, getMetaGraphErrorDetails } = await import(
    "./meta.server"
  );

  let userToken: string | null = null;
  if (account?.meta_access_token_encrypted) {
    try {
      userToken = await getOwnedAccountToken(admin, accountId, userId);
    } catch (error) {
      const details = getMetaGraphErrorDetails(error);
      console.error("[account:disconnect] token decrypt/read failed", details);
      calls.push({ step: "token_read", http_status: null, body: details, ok: false });
    }
  }

  // 1. Unsubscribe the connected Page (non-blocking).
  const pageId = account?.meta_page_id ?? null;
  if (pageId && userToken) {
    try {
      const listed = await graphGet(
        `${graphUrl("me/accounts")}?fields=id,access_token&limit=100`,
        userToken,
        "me/accounts",
      );
      const pageToken = ((listed.data ?? []) as Array<{ id: string; access_token?: string }>).find(
        (p) => p.id === pageId,
      )?.access_token;
      if (pageToken) {
        const res = await fetch(
          `${graphUrl(`${pageId}/subscribed_apps`)}?access_token=${encodeURIComponent(pageToken)}`,
          { method: "DELETE" },
        );
        const body = await readJson(res);
        console.error(
          `[account:disconnect] page unsubscribe page=${pageId} status=${res.status} body=${JSON.stringify(body)}`,
        );
        calls.push({ step: "page_unsubscribe", http_status: res.status, body, ok: res.ok });
      } else {
        calls.push({
          step: "page_unsubscribe",
          http_status: null,
          body: { message: "No Page access token returned by Meta." },
          ok: false,
        });
      }
    } catch (error) {
      const details = getMetaGraphErrorDetails(error);
      console.error("[account:disconnect] page unsubscribe failed", details);
      calls.push({ step: "page_unsubscribe", http_status: null, body: details, ok: false });
    }
  }

  // 2. Revoke the app's permissions on Meta's side. Reviewers check this.
  if (userToken) {
    try {
      const res = await fetch(
        `${graphUrl("me/permissions")}?access_token=${encodeURIComponent(userToken)}`,
        { method: "DELETE" },
      );
      const body = await readJson(res);
      console.error(
        `[account:disconnect] DELETE /me/permissions status=${res.status} body=${JSON.stringify(body)}`,
      );
      calls.push({ step: "revoke_permissions", http_status: res.status, body, ok: res.ok });
    } catch (error) {
      const message = error instanceof Error ? error.message : "network_error";
      console.error("[account:disconnect] DELETE /me/permissions threw", message);
      calls.push({
        step: "revoke_permissions",
        http_status: null,
        body: { message },
        ok: false,
      });
    }
  }

  // 3. Clear Meta state on the account.
  const { error: clearErr } = await admin
    .from("accounts")
    .update({
      meta_access_token_encrypted: null,
      meta_token_expires_at: null,
      meta_ad_account_id: null,
      meta_dataset_id: null,
      meta_page_id: null,
      page_subscribe_status: null,
      page_subscribe_error: null,
      page_subscribed_at: null,
      status: PRE_CONNECT_STATUS,
    })
    .eq("id", accountId);
  if (clearErr) {
    console.error("[account:disconnect] account clear failed", clearErr.message);
    calls.push({ step: "db_clear", http_status: null, body: clearErr, ok: false });
  }

  // 4. Reset discovered Pages for this account.
  await admin
    .from("meta_pages")
    .update({ subscribe_status: "not_attempted", subscribed_at: null, subscribe_error: null })
    .eq("account_id", accountId);

  return { calls };
}
