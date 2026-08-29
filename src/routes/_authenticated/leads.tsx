import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getIntegrationAccount, listLeads, setLeadStatus } from "@/lib/adspro.functions";
import { LEAD_STATUSES } from "@/lib/adspro.constants";
import { AppShell } from "@/components/app-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({
    meta: [
      { title: "Leads — AdsPro" },
      { name: "description", content: "Review Meta Lead Ads leads and assign conversion outcomes in AdsPro." },
      { property: "og:title", content: "Leads — AdsPro" },
      { property: "og:description", content: "Review Meta Lead Ads leads and assign conversion outcomes in AdsPro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeadsPage,
});

function LeadsPage() {
  const queryClient = useQueryClient();
  const listLeadsFn = useServerFn(listLeads);
  const setLeadStatusFn = useServerFn(setLeadStatus);

  const getAccountFn = useServerFn(getIntegrationAccount);

  const { data, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: () => listLeadsFn(),
  });
  const leads = data?.leads;
  const enrichmentEnabled = Boolean(data?.enrichmentEnabled);

  const [backfilling, setBackfilling] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const hasEnrichable = Boolean(
    leads?.some(
      (l) => l.enrichment_status === "not_attempted" || l.enrichment_status === "failed",
    ),
  );

  const fetchMissingNames = async () => {
    setBackfilling(true);
    try {
      const res = await fetch("/api/public/leads/enrich-missing", { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            processed?: number;
            enriched?: number;
            failed?: number;
          }
        | null;
      if (body?.error === "scope_missing") {
        setNeedsReconnect(true);
        return;
      }
      if (body?.error === "rate_limited") {
        toast.warning(
          `Meta rate limit reached — stopped after ${body.processed ?? 0} lead(s). Try again later.`,
        );
      } else if (!body?.ok) {
        toast.error("Could not fetch names right now.");
      } else {
        toast.success(`${body.enriched ?? 0} leads updated, ${body.failed ?? 0} failed`);
      }
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    } catch {
      toast.error("Could not fetch names right now.");
    } finally {
      setBackfilling(false);
    }
  };

  const { data: account } = useQuery({
    queryKey: ["integration-account"],
    queryFn: () => getAccountFn(),
  });

  const pageConnected = Boolean(
    (account as { meta_page_id?: string | null } | null | undefined)?.meta_page_id,
  );

  const updateStatus = async (leadId: string, status: string) => {
    try {
      await setLeadStatusFn({ data: { leadId, status } });
      toast.success("Status saved — it will be sent to Meta by the dispatcher");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save status");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
            <p className="text-sm text-muted-foreground">
              Set lead outcomes manually — useful if you don't use a CRM.
            </p>
          </div>
          {enrichmentEnabled && hasEnrichable ? (
            needsReconnect ? (
              <div className="max-w-xs text-right">
                <Button asChild variant="outline" size="sm">
                  <Link to="/dashboard/integration">Reconnect Meta</Link>
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your Meta connection was made before lead names were supported. Reconnect once to
                  enable them.
                </p>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={fetchMissingNames} disabled={backfilling}>
                {backfilling ? "Fetching…" : "Fetch missing names"}
              </Button>
            )
          ) : null}
        </div>


        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !leads?.length ? (
          <div className="rounded-md border p-6 text-sm text-muted-foreground">
            {!pageConnected ? (
              <>
                <p className="font-medium text-foreground">No leads yet — connect your Page</p>
                <p className="mt-1">
                  AdsPro can't tell which of your accounts a Lead Ads submission belongs to until
                  you save your Facebook Page ID. Add it on the Integration page, then submit a
                  test lead from Meta's Lead Ads Testing Tool.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link to="/dashboard/integration">Save your Page ID</Link>
                </Button>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground">No leads matched yet</p>
                <p className="mt-1">
                  Your Page is mapped, so new Lead Ads submissions will appear here within seconds.
                  If a lead is missing, the webhook subscription for the <code>leadgen</code> field
                  may not be active on that Page.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link to="/dashboard/integration">Check integration setup</Link>
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  {enrichmentEnabled ? <TableHead>Name</TableHead> : null}
                  <TableHead>Campaign</TableHead>
                  <TableHead>Ad set</TableHead>
                  <TableHead>Ad</TableHead>

                  <TableHead>Leadgen ID</TableHead>
                  <TableHead>Current status</TableHead>
                  <TableHead>Set status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(lead.created_at).toLocaleString()}
                    </TableCell>
                    {enrichmentEnabled ? (
                      <TableCell className="max-w-[180px] truncate text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{lead.full_name || "—"}</span>
                          {lead.enrichment_status === "failed" ? (
                            <span
                              title={lead.enrichment_error ?? "Enrichment failed"}
                              aria-label={lead.enrichment_error ?? "Enrichment failed"}
                              className="inline-block size-2 shrink-0 rounded-full bg-amber-500"
                            />
                          ) : null}
                        </span>
                      </TableCell>
                    ) : null}
                    <TableCell className="max-w-[160px] truncate text-sm">
                      {lead.campaign_name || lead.campaign_id || "—"}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm">
                      {lead.adset_name || lead.adset_id || "—"}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm">
                      {lead.ad_name || lead.ad_id || "—"}
                    </TableCell>

                    <TableCell className="max-w-[140px] truncate font-mono text-[11px] text-muted-foreground">
                      {lead.meta_leadgen_id ?? "—"}
                    </TableCell>
                    <TableCell>
                      {lead.latest_status ? (
                        <Badge variant="secondary">{lead.latest_status}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select onValueChange={(v) => updateStatus(lead.id, v)}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Choose…" />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s.replace("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
