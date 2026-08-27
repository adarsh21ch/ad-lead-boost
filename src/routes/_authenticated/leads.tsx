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

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: () => listLeadsFn(),
  });

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
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Set lead outcomes manually — useful if you don't use a CRM.
          </p>
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
                  <TableHead>Leadgen ID</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Ad</TableHead>
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
                    <TableCell className="max-w-[160px] truncate font-mono text-xs">
                      {lead.meta_leadgen_id ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate font-mono text-xs">
                      {lead.campaign_id ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate font-mono text-xs">
                      {lead.ad_id ?? "—"}
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
