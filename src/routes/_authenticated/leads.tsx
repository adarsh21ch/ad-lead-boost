import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getIntegrationAccount,
  listLeads,
  reenrichLead,
  setLeadNotes,
  setLeadStatus,
} from "@/lib/adspro.functions";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Copy, Info, MessageSquare, RefreshCw, StickyNote } from "lucide-react";
import { toast } from "sonner";


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

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Meta sends answer values snake-cased; nobody reads them that way. */
function humanizeAnswer(value: unknown): string {
  const raw = String(value ?? "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

const PREFILL_KEYS = ["gender", "date_of_birth"];

function prefillLine(responses: Record<string, string>): string | null {
  const parts: string[] = [];
  if (responses["gender"]) parts.push(humanizeAnswer(responses["gender"]));
  if (responses["date_of_birth"]) parts.push(`b. ${responses["date_of_birth"]}`);
  return parts.length ? parts.join(" · ") : null;
}

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  not_qualified: "Not Qualified",
  booked: "Booked",
  purchased: "Purchased",
};

function suggestionLabel(status: string): string {
  return STATUS_LABELS[status] ?? humanizeKey(status);
}


function copy(value: string, label: string) {
  navigator.clipboard?.writeText(value).then(
    () => toast.success(`${label} copied`),
    () => toast.error("Could not copy"),
  );
}

function NotesCell({ leadId, notes }: { leadId: string; notes: string | null }) {
  const queryClient = useQueryClient();
  const setNotesFn = useServerFn(setLeadNotes);
  const [value, setValue] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);
  const hasNotes = Boolean((notes ?? "").trim());

  useEffect(() => {
    setValue(notes ?? "");
  }, [notes]);

  const save = async () => {
    if ((value ?? "") === (notes ?? "")) return;
    setSaving(true);
    try {
      await setNotesFn({ data: { leadId, notes: value } });
      toast.success("Note saved");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={hasNotes ? "Edit note" : "Add note"}
          title={hasNotes ? "Edit note" : "Add note"}
        >
          {hasNotes ? (
            <StickyNote className="size-4 text-primary" fill="currentColor" />
          ) : (
            <StickyNote className="size-4 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2" align="end">
        <p className="text-xs font-medium">Note</p>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          rows={4}
          placeholder="What happened on the call?"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
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
  const leads = data?.leads;
  const enrichmentEnabled = Boolean(data?.enrichmentEnabled);

  const [backfilling, setBackfilling] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);

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
  const [reenriching, setReenriching] = useState<string | null>(null);
  const reenrichFn = useServerFn(reenrichLead);

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save status");
    }
  };

  const runReenrich = async (leadId: string) => {
    setReenriching(leadId);
    try {
      const res = (await reenrichFn({ data: { leadId } })) as {
        ok?: boolean;
        skipped?: boolean;
        reason?: string;
        error?: string;
      };
      if (res?.ok && !res.skipped) {
        toast.success("Lead details refreshed");
      } else if (res?.skipped) {
        toast.warning(`Skipped: ${res.reason ?? "no reason given"}`);
      } else {
        toast.error(res?.error ?? res?.reason ?? "Could not refresh this lead");
      }
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not refresh this lead");
    } finally {
      setReenriching(null);
    }
  };


  const hasFilters = Boolean(urlQuery) || activeStatus !== "all";

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

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, phone or email"
            className="w-full max-w-xs"
            aria-label="Search leads"
          />
          <div className="flex flex-wrap gap-1.5">
            {STATUS_CHIPS.map((chip) => (
              <Button
                key={chip.value}
                size="sm"
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
        ) : !leads?.length ? (
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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="min-w-[260px]">Answers</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => {
                  const phone = lead.phone ?? null;
                  const waHref = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : null;
                  const allAnswers = Object.entries(lead.responses ?? {});
                  const answers = allAnswers.filter(([k]) => !PREFILL_KEYS.includes(k));
                  const prefill = prefillLine(lead.responses ?? {});
                  const suggestion =
                    ("suggestion" in lead ? lead.suggestion : null) as
                      | {
                          suggested_status: string | null;
                          confidence: "high" | "needs_human" | "none";
                          reason: string;
                        }
                      | null;
                  const showSuggestion =
                    !dismissed[lead.id] &&
                    Boolean(suggestion?.suggested_status) &&
                    suggestion?.confidence !== "none";

                  return (
                    <TableRow key={lead.id} className="align-top">
                      <TableCell className="max-w-[180px] text-sm">
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
                          {relativeTime(lead.created_at)}
                        </p>
                      </TableCell>

                      <TableCell className="text-sm">
                        {phone ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={waHref!}
                              target="_blank"
                              rel="noopener noreferrer"
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
                              onClick={() => copy(phone, "Phone")}
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
                            className="mt-0.5 block max-w-[190px] truncate text-xs text-muted-foreground hover:underline"
                          >
                            {lead.email}
                          </a>
                        ) : null}
                      </TableCell>

                      <TableCell className="min-w-[260px] text-sm">
                        {answers.length || prefill ? (
                          <dl className="space-y-1">
                            {answers.map(([key, value]) => (
                              <div key={key}>
                                <dt className="text-xs text-muted-foreground">
                                  {humanizeKey(key)}
                                </dt>
                                <dd className="text-sm">{humanizeAnswer(value)}</dd>
                              </div>
                            ))}
                            {prefill ? (
                              <div>
                                <dd className="text-xs text-muted-foreground">{prefill}</dd>
                              </div>
                            ) : null}
                          </dl>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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

                      <TableCell className="max-w-[210px]">
                        {lead.latest_status ? (
                          <Badge variant="secondary">{lead.latest_status.replace("_", " ")}</Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                        {showSuggestion && suggestion ? (
                          <div className="mt-1.5 space-y-1" title={suggestion.reason}>
                            <Badge variant="outline">
                              Suggested: {suggestionLabel(suggestion.suggested_status!)}
                            </Badge>
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
                                onClick={() =>
                                  updateStatus(
                                    lead.id,
                                    suggestion.suggested_status!,
                                    suggestion.suggested_status,
                                  )
                                }
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={() => setDismissed((d) => ({ ...d, [lead.id]: true }))}
                              >
                                Dismiss
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Select
                            onValueChange={(v) =>
                              updateStatus(lead.id, v, showSuggestion ? (suggestion?.suggested_status ?? null) : null)
                            }
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue placeholder="Set status…" />
                            </SelectTrigger>
                            <SelectContent>
                              {LEAD_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s.replace("_", " ")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <NotesCell leadId={lead.id} notes={lead.notes ?? null} />
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Re-fetch this lead's details"
                            title="Re-fetch this lead's details"
                            disabled={reenriching === lead.id}
                            onClick={() => runReenrich(lead.id)}
                          >
                            <RefreshCw
                              className={`size-4 text-muted-foreground ${reenriching === lead.id ? "animate-spin" : ""}`}
                            />
                          </Button>

                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
