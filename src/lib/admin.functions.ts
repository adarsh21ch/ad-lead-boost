import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PanelResult<T> = { rows: T[]; notAuthorised?: boolean; error?: string };

async function callRpc<T>(
  supabase: any,
  name: string,
  args: Record<string, unknown> = {},
): Promise<PanelResult<T>> {
  const { isNotAuthorised } = await import("./admin.server");
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (isNotAuthorised(error)) return { rows: [], notAuthorised: true };
    return { rows: [], error: error.message };
  }
  return { rows: (data ?? []) as T[] };
}

/** Gate + identity in one server-verified call. */
export const getAdminIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveAdminIdentity } = await import("./admin.server");
    const { data } = await context.supabase.auth.getUser();
    return resolveAdminIdentity(
      context.supabase as any,
      context.userId,
      data?.user?.email ?? null,
    );
  });

async function guard(context: any) {
  const { resolveAdminIdentity } = await import("./admin.server");
  const identity = await resolveAdminIdentity(context.supabase, context.userId, null);
  return identity.isAdmin;
}

export const adminOpsAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await guard(context))) return { rows: [], notAuthorised: true };
    return callRpc<any>(context.supabase, "admin_ops_alerts");
  });

export const adminOpsAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await guard(context))) return { rows: [], notAuthorised: true };
    return callRpc<any>(context.supabase, "admin_ops_accounts");
  });

export const adminOpsSyncHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await guard(context))) return { rows: [], notAuthorised: true };
    return callRpc<any>(context.supabase, "admin_ops_sync_health");
  });

export const adminOpsCapiHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await guard(context))) return { rows: [], notAuthorised: true };
    return callRpc<any>(context.supabase, "admin_ops_capi_health", { p_hours: 24 });
  });

export const adminOpsLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await guard(context))) return { rows: [], notAuthorised: true };
    return callRpc<any>(context.supabase, "admin_ops_leads", { p_days: 7 });
  });

export const adminOpsSpend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await guard(context))) return { rows: [], notAuthorised: true };
    return callRpc<any>(context.supabase, "admin_ops_spend", { p_days: 7 });
  });

export const adminOpsCron = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await guard(context))) return { rows: [], notAuthorised: true };
    return callRpc<any>(context.supabase, "admin_ops_cron");
  });

export const adminOpsRetention = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await guard(context))) return { rows: [], notAuthorised: true };
    return callRpc<any>(context.supabase, "admin_ops_retention", { p_limit: 30 });
  });
