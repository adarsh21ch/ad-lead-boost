import { Fragment } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAdminIdentity,
  adminOpsAccounts,
  adminOpsAlerts,
  adminOpsCapiHealth,
  adminOpsCron,
  adminOpsLeads,
  adminOpsRetention,
  adminOpsSpend,
  adminOpsSyncHealth,
} from "@/lib/admin.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Ops health — AdsPro" },
      {
        name: "description",
        content: "Internal operations health: sync, token, delivery, spend and retention status.",
      },
      { property: "og:title", content: "Ops health — AdsPro" },
      {
        property: "og:description",
        content: "Internal operations health: sync, token, delivery, spend and retention status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

/* ---------- formatting helpers (PostgREST sends bigint/numeric as strings) ---------- */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function minutesAgo(v: unknown): string {
  if (v == null) return "—";
  const m = num(v);
  if (m < 1) return "just now";
  if (m < 60) return `${Math.round(m)} min ago`;
  const h = m / 60;
  if (h < 48) return `${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
}

function dt(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function money(amount: unknown, currency: string | null): string {
  const n = num(amount);
  if (!currency) return n.toLocaleString();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString()}`;
  }
}

function PanelShell({
  title,
  subtitle,
  state,
  children,
}: {
  title: string;
  subtitle?: string;
  state: { isLoading: boolean; notAuthorised?: boolean | undefined; error?: string | undefined };
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </CardHeader>
      <CardContent>
        {state.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : state.notAuthorised ? (
          <p className="text-sm text-muted-foreground">Not authorised.</p>
        ) : state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function AdminPage() {
  const queryClient = useQueryClient();
  const identityFn = useServerFn(getAdminIdentity);
  const alertsFn = useServerFn(adminOpsAlerts);
  const accountsFn = useServerFn(adminOpsAccounts);
  const syncFn = useServerFn(adminOpsSyncHealth);
  const capiFn = useServerFn(adminOpsCapiHealth);
  const leadsFn = useServerFn(adminOpsLeads);
  const spendFn = useServerFn(adminOpsSpend);
  const cronFn = useServerFn(adminOpsCron);
  const retentionFn = useServerFn(adminOpsRetention);

  const identity = useQuery({ queryKey: ["admin-identity"], queryFn: () => identityFn() });

  const enabled = identity.data?.isAdmin === true;

  const alerts = useQuery({ queryKey: ["admin-alerts"], queryFn: () => alertsFn(), enabled });
  const accounts = useQuery({ queryKey: ["admin-accounts"], queryFn: () => accountsFn(), enabled });
  const sync = useQuery({ queryKey: ["admin-sync"], queryFn: () => syncFn(), enabled });
  const capi = useQuery({ queryKey: ["admin-capi"], queryFn: () => capiFn(), enabled });
  const leads = useQuery({ queryKey: ["admin-leads"], queryFn: () => leadsFn(), enabled });
  const spend = useQuery({ queryKey: ["admin-spend"], queryFn: () => spendFn(), enabled });
  const cron = useQuery({ queryKey: ["admin-cron"], queryFn: () => cronFn(), enabled });
  const retention = useQuery({ queryKey: ["admin-retention"], queryFn: () => retentionFn(), enabled });

  if (identity.isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  // Non-admins see nothing but a plain not-found. No hint that an admin area exists.
  if (!enabled) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg py-20 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The page you were looking for does not exist.
          </p>
        </div>
      </AppShell>
    );
  }

  const st = (r: { isLoading: boolean; data?: any }) => ({
    isLoading: r.isLoading,
    notAuthorised: r.data?.notAuthorised as boolean | undefined,
    error: r.data?.error as string | undefined,
  });

  const oursByAccount = new Map<string, number>();
  for (const l of (leads.data?.rows ?? []) as any[]) {
    oursByAccount.set(String(l.account_id), num(l.leads_real_window));
  }

  const refreshAll = () => {
    for (const key of [
      "admin-alerts",
      "admin-accounts",
      "admin-sync",
      "admin-capi",
      "admin-leads",
      "admin-spend",
      "admin-cron",
      "admin-retention",
    ]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ops health</h1>
            <p className="text-xs text-muted-foreground">
              Signed in as {identity.data?.email ?? "unknown"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refreshAll}>
            Refresh
          </Button>
        </div>

        {/* 1. Alerts */}
        <PanelShell title="Alerts" state={st(alerts)}>
          {((alerts.data?.rows ?? []) as any[]).length === 0 ? (
            <p className="text-sm font-medium text-emerald-600">No problems detected.</p>
          ) : (
            <ul className="space-y-3">
              {((alerts.data?.rows ?? []) as any[]).map((a, i) => (
                <li key={i} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={a.severity === "critical" ? "destructive" : "secondary"}>
                      {a.severity}
                    </Badge>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {a.area}
                    </span>
                    <span className="text-xs text-muted-foreground">{a.account_name ?? "—"}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium">{a.message}</p>
                  {a.detail ? (
                    <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                      {a.detail}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </PanelShell>

        {/* 2. Accounts */}
        <PanelShell title="Accounts" state={st(accounts)}>
          <div className="grid gap-4 md:grid-cols-2">
            {((accounts.data?.rows ?? []) as any[]).map((a) => (
              <div key={a.account_id} className="space-y-3 rounded-md border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{a.account_name}</p>
                  <Badge variant="outline">{a.status}</Badge>
                </div>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Ad account</dt>
                    <dd>{a.meta_ad_account_name ?? "Not selected"}</dd>
                    <dd className="font-mono text-xs text-muted-foreground">
                      {a.meta_ad_account_id ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Pixel (dataset)</dt>
                    <dd>{a.meta_dataset_name ?? "Not selected"}</dd>
                    <dd className="font-mono text-xs text-muted-foreground">
                      {a.meta_dataset_id ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Owner</dt>
                    <dd>{a.owner_email ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Created</dt>
                    <dd>{dt(a.created_at)}</dd>
                  </div>
                </dl>

                <div className="space-y-1 rounded-md bg-muted/40 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Token health</span>
                    <Badge
                      variant={
                        a.token_status === "invalid" || a.token_status === "token_expired"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {a.token_status ?? "unknown"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last confirmed OK by Meta: {dt(a.token_last_ok_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Advance warning only (not a health check): expires {dt(a.token_expires_at)}
                    {a.days_to_expiry != null ? ` · ${Math.round(num(a.days_to_expiry))} days` : ""}
                  </p>
                  {a.token_last_error ? (
                    <pre className="whitespace-pre-wrap font-mono text-xs text-destructive">
                      {a.token_last_error}
                      {"\n"}
                      {dt(a.token_last_error_at)}
                    </pre>
                  ) : null}
                </div>

                <div className="text-sm">
                  <span className="text-xs text-muted-foreground">Page subscription: </span>
                  {a.page_subscribe_status === "failed" ? (
                    <span className="font-semibold text-destructive">
                      failed — leads will not arrive at all
                    </span>
                  ) : (
                    <span>{a.page_subscribe_status ?? "—"}</span>
                  )}
                  {a.page_subscribe_error ? (
                    <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-destructive">
                      {a.page_subscribe_error}
                    </pre>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </PanelShell>

        {/* 3. Insights sync */}
        <PanelShell title="Insights sync" state={st(sync)}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead className="text-right">Runs 24h</TableHead>
                <TableHead className="text-right">Failed 24h</TableHead>
                <TableHead className="text-right">Rows / calls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((sync.data?.rows ?? []) as any[]).map((r, i) => (
                <Fragment key={`${r.account_id ?? "null"}-${i}`}>
                  <TableRow>
                    <TableCell>{r.account_name}</TableCell>
                    <TableCell>{r.verdict}</TableCell>
                    <TableCell>{r.status ?? "—"}</TableCell>
                    <TableCell>{minutesAgo(r.age_minutes)}</TableCell>
                    <TableCell className="text-right">{num(r.runs_24h)}</TableCell>
                    <TableCell
                      className={
                        num(r.failed_24h) > 0 ? "text-right text-destructive" : "text-right"
                      }
                    >
                      {num(r.failed_24h)}
                    </TableCell>
                    <TableCell className="text-right">
                      {num(r.rows_written)} / {num(r.meta_calls)}
                    </TableCell>
                  </TableRow>
                  {r.error ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            Error detail
                            {r.meta_code ? ` (code ${r.meta_code}${r.meta_subcode ? `/${r.meta_subcode}` : ""})` : ""}
                          </summary>
                          <pre className="mt-1 whitespace-pre-wrap font-mono text-xs">
                            {r.error}
                          </pre>
                        </details>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
              {((sync.data?.rows ?? []) as any[]).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">
                    No sync runs recorded.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </PanelShell>

        {/* 4. CAPI delivery */}
        <PanelShell
          title="CAPI delivery (last 24h)"
          subtitle="Pending means queued and not yet attempted — the dispatcher ticks every 2 minutes, so a few minutes pending is normal."
          state={st(capi)}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Events</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Retries</TableHead>
                <TableHead>Oldest pending</TableHead>
                <TableHead>Last event</TableHead>
                <TableHead>Dispatch breakdown</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((capi.data?.rows ?? []) as any[]).map((r) => {
                const oldest = r.oldest_pending_minutes == null ? null : num(r.oldest_pending_minutes);
                return (
                  <TableRow key={r.account_id}>
                    <TableCell>{r.account_name}</TableCell>
                    <TableCell className="text-right">{num(r.events)}</TableCell>
                    <TableCell className="text-right">{num(r.delivered)}</TableCell>
                    <TableCell className="text-right">{num(r.pending)}</TableCell>
                    <TableCell
                      className={num(r.failed) > 0 ? "text-right text-destructive" : "text-right"}
                    >
                      {num(r.failed)}
                    </TableCell>
                    <TableCell className="text-right">{num(r.retries)}</TableCell>
                    <TableCell
                      className={oldest != null && oldest > 15 ? "text-destructive" : undefined}
                    >
                      {oldest == null ? "—" : minutesAgo(oldest)}
                    </TableCell>
                    <TableCell>{dt(r.last_event_at)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.dispatch_breakdown && typeof r.dispatch_breakdown === "object"
                        ? Object.entries(r.dispatch_breakdown as Record<string, unknown>)
                            .map(([k, v]) => `${k}: ${num(v)}`)
                            .join("  ") || "—"
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {((capi.data?.rows ?? []) as any[]).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-sm text-muted-foreground">
                    No delivery activity in the last 24 hours.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </PanelShell>

        {/* 5. Leads */}
        <PanelShell title="Leads (last 7 days)" state={st(leads)}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Real (7d)</TableHead>
                <TableHead className="text-right">Real (all time)</TableHead>
                <TableHead className="text-right">Test leads</TableHead>
                <TableHead className="text-right">All incl. test</TableHead>
                <TableHead className="text-right">Unlinked real</TableHead>
                <TableHead>Last real lead</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((leads.data?.rows ?? []) as any[]).map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell>{r.account_name}</TableCell>
                  <TableCell className="text-right">{num(r.leads_real_window)}</TableCell>
                  <TableCell className="text-right">{num(r.leads_real)}</TableCell>
                  <TableCell className="text-right">{num(r.leads_test)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {num(r.leads_total)}
                  </TableCell>
                  <TableCell className="text-right">{num(r.unlinked_real)}</TableCell>
                  <TableCell>{dt(r.last_real_lead_at)}</TableCell>
                </TableRow>
              ))}
              {((leads.data?.rows ?? []) as any[]).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">
                    No leads recorded.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            Unlinked real leads have no ad_id and cannot be attributed to spend.
          </p>
        </PanelShell>

        {/* 6. Spend & data freshness */}
        <PanelShell title="Spend & data freshness (last 7 days)" state={st(spend)}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Leads — Meta's count</TableHead>
                <TableHead className="text-right">Leads — ours</TableHead>
                <TableHead>Latest stat date</TableHead>
                <TableHead>Warehouse age</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((spend.data?.rows ?? []) as any[]).map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell>{r.account_name}</TableCell>
                  <TableCell className="text-right">
                    {money(r.spend_window, r.currency ?? null)}
                  </TableCell>
                  <TableCell className="text-right">{num(r.impressions_window)}</TableCell>
                  <TableCell className="text-right">{num(r.meta_leads_window)}</TableCell>
                  <TableCell className="text-right">
                    {oursByAccount.get(String(r.account_id)) ?? "—"}
                  </TableCell>
                  <TableCell>{r.latest_stat_date ?? "—"}</TableCell>
                  <TableCell>{minutesAgo(r.data_age_minutes)}</TableCell>
                </TableRow>
              ))}
              {((spend.data?.rows ?? []) as any[]).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">
                    No spend snapshots yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            Meta's count and ours use different attribution windows, so small differences are
            expected — a large gap means leads are arriving that we are not storing.
          </p>
        </PanelShell>

        {/* 7. Scheduler */}
        <PanelShell title="Scheduler" state={st(cron)}>
          {((cron.data?.rows ?? []) as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground">Scheduler information unavailable.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Last status</TableHead>
                  <TableHead>Last message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {((cron.data?.rows ?? []) as any[]).map((r) => (
                  <TableRow key={r.jobname}>
                    <TableCell>{r.jobname}</TableCell>
                    <TableCell className="font-mono text-xs">{r.schedule}</TableCell>
                    <TableCell>{r.active ? "yes" : "no"}</TableCell>
                    <TableCell>{dt(r.last_run_at)}</TableCell>
                    <TableCell>{r.last_status ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.last_message ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </PanelShell>

        {/* 8. Retention */}
        <PanelShell
          title="Retention purges"
          subtitle="Compliance artifact: evidence the published 90-day retention promise is enforced."
          state={st(retention)}
        >
          {((retention.data?.rows ?? []) as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No purge has deleted anything yet — normal.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ran at</TableHead>
                  <TableHead>Cutoff</TableHead>
                  <TableHead className="text-right">Leads deleted</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {((retention.data?.rows ?? []) as any[]).map((r, i) => (
                  <TableRow key={`${r.ran_at ?? i}`}>
                    <TableCell>{dt(r.ran_at)}</TableCell>
                    <TableCell>{dt(r.cutoff)}</TableCell>
                    <TableCell className="text-right">{num(r.leads_deleted)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </PanelShell>
      </div>
    </AppShell>
  );
}
