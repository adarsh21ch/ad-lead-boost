import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getIntegrationAccount, listLeads, setLeadStatus } from "@/lib/adspro.functions";
import { AppShell } from "@/components/app-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, Copy, Info, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { LeadDetailPanel, type PanelLead } from "@/components/lead-detail-panel";
import {
  ENRICHMENT_COPY,
  identityLine,
  relativeTime,
  statusLabel,
  waHref,
} from "@/lib/lead-format";

type LeadSearch = { q?: string | undefined; status?: string | undefined };

const STATUS_CHIPS = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "booked", label: "Booked" },
  { value: "purchased", label: "Purchased" },
];

export const Route = createFileRoute("/_authenticated/leads")({
  validateSearch: (search: Record<string, unknown>): LeadSearch => {
    const q = search["q"];
    const status = search["status"];
    return {
      q: typeof q === "string" && q ? q : undefined,
      status: typeof status === "string" && status ? status : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Leads — AdsPro" },
      { name: "description", content: "Review Meta Lead Ads leads, call or WhatsApp them, and assign conversion outcomes in AdsPro." },
      { property: "og:title", content: "Leads — AdsPro" },
      { property: "og:description", content: "Review Meta Lead Ads leads, call or WhatsApp them, and assign conversion outcomes in AdsPro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeadsPage,
});

function copy(value: string, label: string) {
  navigator.clipboard?.writeText(value).then(
    () => toast.success(`${label} copied`),
    () => toast.error("Could not copy"),
  );
}

/** Stops a nested control from also opening the detail panel. */
function stop(e: React.MouseEvent | React.KeyboardEvent) {
  e.stopPropagation();
}

type LeadRow = PanelLead & { detailCount: number };

function LeadNameCell({ lead }: { lead: LeadRow }) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="truncate font-semibold">{lead.full_name || "—"}</span>
        {lead.enrichment_status === "failed" ? (
          <span
            title={lead.enrichment_error ?? "Enrichment failed"}
            aria-label={lead.enrichment_error ?? "Enrichment failed"}
            className="inline-block size-2 shrink-0 rounded-full bg-amber-500"
          />
        ) : null}
      </div>
      <p
        className="mt-0.5 text-xs text-muted-foreground"
        title={new Date(lead.created_at).toLocaleString()}
      >
        {identityLine(lead.responses, lead.created_at)}
      </p>
      {lead.detailCount > 0 ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{lead.detailCount} details ›</p>
      ) : null}
    </>
  );
}

function SuggestionChip({
  lead,
  onAccept,
  onDismiss,
}: {
  lead: LeadRow;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const suggestion = lead.suggestion!;
  return (
    <div className="mt-1.5 space-y-1" title={suggestion.reason}>
      <Badge variant="outline">Suggested: {statusLabel(suggestion.suggested_status!)}</Badge>
      <p className="text-xs text-muted-foreground">
        {suggestion.confidence === "high"
          ? "Decidable from their answers."
          : "Confirm they replied on WhatsApp first."}
      </p>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="secondary"
          className="h-6 px-2 text-xs"
          onClick={(e) => {
            stop(e);
            onAccept();
          }}
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={(e) => {
            stop(e);
            onDismiss();
          }}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function LeadsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const listLeadsFn = useServerFn(listLeads);
  const setLeadStatusFn = useServerFn(setLeadStatus);
  const getAccountFn = useServerFn(getIntegrationAccount);

  const activeStatus = search.status ?? "all";
  const urlQuery = search.q ?? "";
  const [searchInput, setSearchInput] = useState(urlQuery);

  useEffect(() => {
    setSearchInput(urlQuery);
  }, [urlQuery]);

  // Debounced URL sync — the query itself is keyed off the URL.
  useEffect(() => {
    if (searchInput === urlQuery) return;
    const t = setTimeout(() => {
      navigate({
        search: (prev: LeadSearch): LeadSearch => ({ ...prev, q: searchInput || undefined }),
        replace: true,
      });
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput, urlQuery, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["leads", urlQuery, activeStatus],
    queryFn: () => listLeadsFn({ data: { search: urlQuery, status: activeStatus } }),
  });
  const enrichmentEnabled = Boolean(data?.enrichmentEnabled);

  const leads: LeadRow[] = (data?.leads ?? []).map((l) => ({
    ...(l as unknown as PanelLead),
    detailCount: Object.keys((l as { responses?: Record<string, string> | null }).responses ?? {})
      .length,
  }));

  const [backfilling, setBackfilling] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  const fetchLeadDetails = async () => {
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
            rate_limited?: boolean;
            scope_missing?: boolean;
          }
        | null;
      if (body?.error === "disabled") {
        toast.error(
          "Fetching lead details is turned off for this workspace (LEAD_ENRICHMENT_ENABLED is off).",
        );
        return;
      }
      if (body?.error === "scope_missing" || body?.scope_missing) {
        setNeedsReconnect(true);
        toast.error(
          "Meta hasn't granted the leads_retrieval permission yet. Lead details can't be fetched until App Review approves it.",
        );
        return;
      }
      if (body?.error === "rate_limited" || body?.rate_limited) {
        toast.warning(
          "Meta's hourly limit was reached. Some leads were fetched; try again in an hour.",
        );
      } else if (!body?.ok) {
        toast.error("Could not fetch lead details right now.");
      } else {
        toast.success(`Fetched details for ${body.enriched ?? 0} of ${body.processed ?? 0} leads.`);
      }
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    } catch {
      toast.error("Could not fetch lead details right now.");
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

  // Dismissals are page-session only — no DDL exists to persist them.
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  // Only ever called from a click handler — never on render, load or effect.
  const updateStatus = async (
    leadId: string,
    status: string,
    suggestedStatus: string | null = null,
  ) => {
    try {
      await setLeadStatusFn({ data: { leadId, status, suggestedStatus } });
      toast.success("Status saved — it will be sent to Meta by the dispatcher");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads-awaiting-decision"] });
      queryClient.invalidateQueries({ queryKey: ["lead-status-history", leadId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save status");
    }
  };

  const hasFilters = Boolean(urlQuery) || activeStatus !== "all";
  const openLead = leads.find((l) => l.id === openLeadId) ?? null;
  const isSuggestionVisible = (lead: LeadRow) =>
    !dismissed[lead.id] &&
    Boolean(lead.suggestion?.suggested_status) &&
    lead.suggestion?.confidence !== "none";

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
            <p className="text-sm text-muted-foreground">
              Call or message the lead, record the answers, and set the outcome.
            </p>
          </div>
          {needsReconnect ? (
            <div className="max-w-xs text-right">
              <Button asChild variant="outline" size="sm">
                <Link to="/dashboard/integration">Reconnect Meta</Link>
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">
                Meta hasn't granted the <code>leads_retrieval</code> permission yet. Lead details
                can't be fetched until App Review approves it.
              </p>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={fetchLeadDetails} disabled={backfilling}>
              {backfilling ? "Fetching…" : "Fetch lead details"}
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, phone or email"
            className="w-full md:max-w-xs"
            aria-label="Search leads"
          />
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible">
            {STATUS_CHIPS.map((chip) => (
              <Button
                key={chip.value}
                size="sm"
                className="shrink-0"
                variant={activeStatus === chip.value ? "default" : "outline"}
                onClick={() =>
                  navigate({
                    search: (prev: LeadSearch): LeadSearch => ({
                      ...prev,
                      status: chip.value === "all" ? undefined : chip.value,
                    }),
                    replace: true,
                  })
                }
              >
                {chip.label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !leads.length ? (
          <div className="rounded-md border p-6 text-sm text-muted-foreground">
            {hasFilters ? (
              <>
                <p className="font-medium text-foreground">No leads match this view</p>
                <p className="mt-1">Try a different search term or status filter.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => navigate({ search: {}, replace: true })}
                >
                  Clear filters
                </Button>
              </>
            ) : !pageConnected ? (
              <>
                <p className="font-medium text-foreground">No leads yet — connect your Page</p>
                <p className="mt-1">
                  AdsPro can't tell which of your accounts a Lead Ads submission belongs to until
                  you connect your Facebook Page. Do that on the Integration page, then submit a
                  test lead from Meta's Lead Ads Testing Tool.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link to="/dashboard/integration">Connect your Page</Link>
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
          <>
            {/* Mobile: cards */}
            <div className="space-y-3 md:hidden">
              {leads.map((lead) => {
                const phone = lead.phone ?? null;
                return (
                  <div
                    key={lead.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenLeadId(lead.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setOpenLeadId(lead.id);
                    }}
                    className="cursor-pointer space-y-3 rounded-md border p-4 text-sm"
                  >
                    <LeadNameCell lead={lead} />
                    {phone ? (
                      <Button asChild className="w-full" onClick={stop}>
                        <a href={waHref(phone)} target="_blank" rel="noopener noreferrer">
                          <MessageSquare className="size-4" /> WhatsApp {phone}
                        </a>
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No phone number yet.{" "}
                        {lead.enrichment_status === "not_attempted" && !enrichmentEnabled
                          ? "Enrichment off"
                          : (ENRICHMENT_COPY[lead.enrichment_status ?? "not_attempted"] ?? "")}
                      </p>
                    )}
                    <div>
                      {lead.latest_status ? (
                        <Badge variant="secondary">{statusLabel(lead.latest_status)}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No status set</span>
                      )}
                      {isSuggestionVisible(lead) ? (
                        <SuggestionChip
                          lead={lead}
                          onAccept={() =>
                            updateStatus(
                              lead.id,
                              lead.suggestion!.suggested_status!,
                              lead.suggestion!.suggested_status,
                            )
                          }
                          onDismiss={() => setDismissed((d) => ({ ...d, [lead.id]: true }))}
                        />
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[lead.campaign_name, lead.adset_name, lead.ad_name]
                        .filter(Boolean)
                        .join(" · ") || "Source not resolved yet"}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Desktop: narrow, scannable table */}
            <div className="hidden rounded-md border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => {
                    const phone = lead.phone ?? null;
                    return (
                      <TableRow
                        key={lead.id}
                        tabIndex={0}
                        onClick={() => setOpenLeadId(lead.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setOpenLeadId(lead.id);
                        }}
                        className="cursor-pointer align-top"
                      >
                        <TableCell className="max-w-[200px] text-sm">
                          <LeadNameCell lead={lead} />
                        </TableCell>

                        <TableCell className="text-sm">
                          {phone ? (
                            <div className="flex items-center gap-1.5">
                              <a
                                href={waHref(phone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={stop}
                                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                              >
                                <MessageSquare className="size-3.5" />
                                {phone}
                              </a>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                aria-label="Copy phone number"
                                onClick={(e) => {
                                  stop(e);
                                  copy(phone, "Phone");
                                }}
                              >
                                <Copy className="size-3" />
                              </Button>
                            </div>
                          ) : (
                            <div>
                              <span className="text-muted-foreground">—</span>
                              {lead.enrichment_status === "not_attempted" && !enrichmentEnabled ? (
                                <p className="text-xs text-muted-foreground">Enrichment off</p>
                              ) : null}
                            </div>
                          )}
                          {lead.email ? (
                            <a
                              href={`mailto:${lead.email}`}
                              onClick={stop}
                              className="mt-0.5 block max-w-[190px] truncate text-xs text-muted-foreground hover:underline"
                            >
                              {lead.email}
                            </a>
                          ) : null}
                        </TableCell>

                        <TableCell className="max-w-[210px]">
                          {lead.latest_status ? (
                            <Badge variant="secondary">{statusLabel(lead.latest_status)}</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                          {isSuggestionVisible(lead) ? (
                            <SuggestionChip
                              lead={lead}
                              onAccept={() =>
                                updateStatus(
                                  lead.id,
                                  lead.suggestion!.suggested_status!,
                                  lead.suggestion!.suggested_status,
                                )
                              }
                              onDismiss={() => setDismissed((d) => ({ ...d, [lead.id]: true }))}
                            />
                          ) : null}
                        </TableCell>

                        <TableCell className="max-w-[180px] text-xs text-muted-foreground">
                          <p className="truncate" title={lead.campaign_name ?? undefined}>
                            {lead.campaign_name || lead.campaign_id || "—"}
                          </p>
                          <p className="truncate" title={lead.adset_name ?? undefined}>
                            {lead.adset_name || lead.adset_id || "—"}
                          </p>
                          <p className="flex items-center gap-1 truncate">
                            <span className="truncate" title={lead.ad_name ?? undefined}>
                              {lead.ad_name || lead.ad_id || "—"}
                            </span>
                            <span
                              title={`Leadgen ID: ${lead.meta_leadgen_id ?? "—"}`}
                              aria-label={`Leadgen ID: ${lead.meta_leadgen_id ?? "—"}`}
                            >
                              <Info className="size-3 shrink-0" />
                            </span>
                          </p>
                        </TableCell>

                        <TableCell className="w-8 text-muted-foreground">
                          <ChevronRight className="size-4" aria-hidden />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      <LeadDetailPanel
        lead={openLead}
        open={Boolean(openLead)}
        onOpenChange={(o) => {
          if (!o) setOpenLeadId(null);
        }}
        onSetStatus={updateStatus}
        onDismissSuggestion={(id) => setDismissed((d) => ({ ...d, [id]: true }))}
        suggestionVisible={openLead ? isSuggestionVisible(openLead) : false}
      />
    </AppShell>
  );
}
