import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getIntegrationAccount,
  listLeads,
  listSourceOptions,
  setLeadStatus,
} from "@/lib/adspro.functions";
import { AppShell } from "@/components/app-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight, Copy, MessageSquare, Phone } from "lucide-react";
import { toast } from "sonner";
import { LeadDetailPanel, type PanelLead } from "@/components/lead-detail-panel";
import { LeadStatusSelect } from "@/components/lead-status-select";
import { LeadAnswers } from "@/components/lead-answers";
import { ENRICHMENT_COPY, identityLine, isProfileKey, waHref } from "@/lib/lead-format";

type LeadSearch = {
  q?: string | undefined;
  status?: string | undefined;
  campaign?: string | undefined;
  adset?: string | undefined;
  ad?: string | undefined;
};

const STATUS_CHIPS = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "booked", label: "Booked" },
  { value: "purchased", label: "Purchased" },
];

const ALL = "__all__";

export const Route = createFileRoute("/_authenticated/leads")({
  validateSearch: (search: Record<string, unknown>): LeadSearch => {
    const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    return {
      q: str(search["q"]),
      status: str(search["status"]),
      campaign: str(search["campaign"]),
      adset: str(search["adset"]),
      ad: str(search["ad"]),
    };
  },
  head: () => ({
    meta: [
      { title: "Leads — AdsPro" },
      {
        name: "description",
        content:
          "Review Meta Lead Ads leads, call or WhatsApp them, and assign conversion outcomes in AdsPro.",
      },
      { property: "og:title", content: "Leads — AdsPro" },
      {
        property: "og:description",
        content:
          "Review Meta Lead Ads leads, call or WhatsApp them, and assign conversion outcomes in AdsPro.",
      },
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

type LeadRow = PanelLead & { detailCount: number; answers: Array<[string, string]> };

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
        className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"
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

function ContactCell({ lead, enrichmentEnabled }: { lead: LeadRow; enrichmentEnabled: boolean }) {
  const phone = lead.phone ?? null;
  const enrichmentNote =
    lead.enrichment_status === "not_attempted" && !enrichmentEnabled
      ? "Enrichment off"
      : (ENRICHMENT_COPY[lead.enrichment_status ?? "not_attempted"] ?? "");
  return (
    <>
      {phone ? (
        <div className="flex items-center gap-1">
          <span className="whitespace-nowrap text-xs font-medium">{phone}</span>
          <Button asChild variant="ghost" size="icon" className="size-6" onClick={stop}>
            <a
              href={waHref(phone)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Message on WhatsApp"
              title="WhatsApp"
            >
              <MessageSquare className="size-3.5" />
            </a>
          </Button>
          <Button asChild variant="ghost" size="icon" className="size-6" onClick={stop}>
            <a href={`tel:${phone}`} aria-label="Call this lead" title="Call">
              <Phone className="size-3.5" />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Copy phone number"
            title="Copy"
            onClick={(e) => {
              stop(e);
              copy(phone, "Phone");
            }}
          >
            <Copy className="size-3" />
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{enrichmentNote || "No phone number yet."}</p>
      )}
      {lead.email ? (
        <a
          href={`mailto:${lead.email}`}
          onClick={stop}
          className="mt-0.5 block max-w-[170px] truncate text-xs text-muted-foreground hover:underline"
        >
          {lead.email}
        </a>
      ) : null}
    </>
  );
}

type SourceOption = {
  level: string | null;
  entity_id: string | null;
  name: string | null;
  parent_id: string | null;
  lead_count: number | null;
};

function SourceFilter({
  label,
  placeholder,
  options,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: SourceOption[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  // A filter that can only be set one way is noise.
  if (options.length < 2) return null;
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger className="h-8 w-[190px] shrink-0 text-xs" aria-label={label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.entity_id ?? ""} value={o.entity_id ?? ""}>
            {(o.name || o.entity_id) ?? "—"} ({o.lead_count ?? 0})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LeadsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const listLeadsFn = useServerFn(listLeads);
  const listSourceOptionsFn = useServerFn(listSourceOptions);
  const setLeadStatusFn = useServerFn(setLeadStatus);
  const getAccountFn = useServerFn(getIntegrationAccount);

  const activeStatus = search.status ?? "all";
  const urlQuery = search.q ?? "";
  const campaignId = search.campaign;
  const adsetId = search.adset;
  const adId = search.ad;
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
    queryKey: ["leads", urlQuery, activeStatus, campaignId, adsetId, adId],
    queryFn: () =>
      listLeadsFn({
        data: {
          search: urlQuery,
          status: activeStatus,
          campaignId: campaignId ?? null,
          adsetId: adsetId ?? null,
          adId: adId ?? null,
        },
      }),
  });
  const enrichmentEnabled = Boolean(data?.enrichmentEnabled);

  const { data: sourceData } = useQuery({
    queryKey: ["lead-source-options"],
    queryFn: () => listSourceOptionsFn(),
  });

  const sourceOptions = (sourceData?.options ?? []) as SourceOption[];
  const campaigns = useMemo(
    () => sourceOptions.filter((o) => o.level === "campaign"),
    [sourceOptions],
  );
  const adsets = useMemo(
    () =>
      sourceOptions.filter(
        (o) => o.level === "adset" && (!campaignId || o.parent_id === campaignId),
      ),
    [sourceOptions, campaignId],
  );
  const ads = useMemo(
    () => sourceOptions.filter((o) => o.level === "ad" && (!adsetId || o.parent_id === adsetId)),
    [sourceOptions, adsetId],
  );

  const leads: LeadRow[] = (data?.leads ?? []).map((l) => {
    const lead = l as unknown as PanelLead;
    const responses = (lead.responses ?? {}) as Record<string, string>;
    return {
      ...lead,
      detailCount: Object.keys(responses).length,
      // Classification, not a filter: every non-prefill key lands in Answers.
      answers: Object.entries(responses).filter(([k]) => !isProfileKey(k)),
    };
  });

  const [backfilling, setBackfilling] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  const fetchLeadDetails = async () => {
    setBackfilling(true);
    try {
      const res = await fetch("/api/public/leads/enrich-missing", { method: "POST" });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        processed?: number;
        enriched?: number;
        failed?: number;
        rate_limited?: boolean;
        scope_missing?: boolean;
      } | null;
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

  const hasFilters =
    Boolean(urlQuery) || activeStatus !== "all" || Boolean(campaignId || adsetId || adId);
  const openLead = leads.find((l) => l.id === openLeadId) ?? null;

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
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible">
            <SourceFilter
              label="Campaign"
              placeholder="All campaigns"
              options={campaigns}
              value={campaignId}
              onChange={(v) =>
                navigate({
                  // Changing a parent resets its children.
                  search: (prev: LeadSearch): LeadSearch => ({
                    ...prev,
                    campaign: v,
                    adset: undefined,
                    ad: undefined,
                  }),
                  replace: true,
                })
              }
            />
            <SourceFilter
              label="Ad set"
              placeholder="All ad sets"
              options={adsets}
              value={adsetId}
              onChange={(v) =>
                navigate({
                  search: (prev: LeadSearch): LeadSearch => ({
                    ...prev,
                    adset: v,
                    ad: undefined,
                  }),
                  replace: true,
                })
              }
            />
            <SourceFilter
              label="Ad"
              placeholder="All ads"
              options={ads}
              value={adId}
              onChange={(v) =>
                navigate({
                  search: (prev: LeadSearch): LeadSearch => ({ ...prev, ad: v }),
                  replace: true,
                })
              }
            />
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !leads.length ? (
          <div className="rounded-md border p-6 text-sm text-muted-foreground">
            {hasFilters ? (
              <>
                <p className="font-medium text-foreground">No leads match this view</p>
                <p className="mt-1">Try a different search term, status or source filter.</p>
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
              {leads.map((lead, i) => {
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
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <LeadNameCell lead={lead} />
                      </div>
                    </div>
                    {phone ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Button asChild onClick={stop}>
                          <a href={waHref(phone)} target="_blank" rel="noopener noreferrer">
                            <MessageSquare className="size-4" /> WhatsApp
                          </a>
                        </Button>
                        <Button asChild variant="outline" onClick={stop}>
                          <a href={`tel:${phone}`}>
                            <Phone className="size-4" /> Call
                          </a>
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No phone number yet.{" "}
                        {lead.enrichment_status === "not_attempted" && !enrichmentEnabled
                          ? "Enrichment off"
                          : (ENRICHMENT_COPY[lead.enrichment_status ?? "not_attempted"] ?? "")}
                      </p>
                    )}
                    {phone ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium">{phone}</span>
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
                    ) : null}
                    <LeadAnswers entries={lead.answers} />
                    <div onClick={stop}>
                      <LeadStatusSelect
                        status={lead.latest_status}
                        onSelect={(s) => updateStatus(lead.id, s, null)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: five columns — each one differs between rows */}
            <div className="hidden rounded-md border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-right">#</TableHead>
                    <TableHead className="w-[210px]">Lead</TableHead>
                    <TableHead className="w-[190px]">Contact</TableHead>
                    <TableHead>Answers</TableHead>
                    <TableHead className="w-[150px]">Status</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead, i) => (
                    <TableRow
                      key={lead.id}
                      tabIndex={0}
                      onClick={() => setOpenLeadId(lead.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setOpenLeadId(lead.id);
                      }}
                      className="cursor-pointer align-top"
                    >
                      <TableCell className="w-10 text-right text-xs text-muted-foreground">
                        {i + 1}
                      </TableCell>

                      <TableCell className="max-w-[210px] text-sm">
                        <LeadNameCell lead={lead} />
                      </TableCell>

                      <TableCell className="max-w-[190px] text-sm">
                        <ContactCell lead={lead} enrichmentEnabled={enrichmentEnabled} />
                      </TableCell>

                      <TableCell className="text-sm">
                        <LeadAnswers entries={lead.answers} />
                      </TableCell>

                      <TableCell className="w-[150px]">
                        <LeadStatusSelect
                          status={lead.latest_status}
                          onSelect={(s) => updateStatus(lead.id, s, null)}
                        />
                      </TableCell>

                      <TableCell className="w-8 text-muted-foreground">
                        <ChevronRight className="size-4" aria-hidden />
                      </TableCell>
                    </TableRow>
                  ))}
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
      />
    </AppShell>
  );
}
