// Server-only admin gate. The `is_app_admin` RPC is the source of truth; a
// client-side boolean is never a gate. Admin grants are made in SQL by design —
// nothing here ever writes to app_admins.
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminIdentity = { isAdmin: boolean; email: string | null; userId: string };

export async function resolveAdminIdentity(
  supabase: SupabaseClient<any>,
  userId: string,
  email: string | null,
): Promise<AdminIdentity> {
  const { data, error } = await supabase.rpc("is_app_admin");
  if (error) {
    console.error("[admin] is_app_admin failed", error.message);
    return { isAdmin: false, email, userId };
  }
  return { isAdmin: data === true, email, userId };
}

/** A 42501 from any admin_ops_* RPC means the gate failed — never fall back to tables. */
export function isNotAuthorised(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false;
  return error.code === "42501" || /not authorised/i.test(error.message ?? "");
}
