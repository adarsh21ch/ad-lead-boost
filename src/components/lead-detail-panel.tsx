import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getLeadStatusHistory,
  setLeadNotes,
  reenrichLead,
} from "@/lib/adspro.functions";
import { LEAD_STATUSES } from "@/lib/adspro.constants";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Mail, MessageSquare, Phone, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  ENRICHMENT_COPY,
  PREFILL_KEYS,
  humanizeAnswer,
  humanizeKey,
  identityLine,
  statusLabel,
  waHref,
} from "@/lib/lead-format";

export type PanelLead = {
  id: string;
  created_at: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  responses?: Record<string, string> | null;
  notes?: string | null;
  enrichment_status?: string | null;
  enrichment_error?: string | null;
  meta_leadgen_id?: string | null;
  campaign_name?: string | null;
  campaign_id?: string | null;
  adset_name?: string | null;
  adset_id?: string | null;
  ad_name?: string | null;
  ad_id?: string | null;
  latest_status?: string | null;
  suggestion?: {
    suggested_status: string | null;
    confidence: "high" | "needs_human" | "none";
    reason: string;
  } | null;
};

function copy(value: string, label: string) {
  navigator.clipboard?.writeText(value).then(
    () => toast.success(`${label} copied`),
    () => toast.error("Could not copy"),
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

type HistoryRow = {
  status_event_id: string | null;
  status: string | null;
  source: string | null;
  suggested_status: string | null;
  created_at: string | null;
  dispatch_status: string | null;
  meta_event_name: string | null;
  http_status: number | null;
  delivered_at: string | null;
  retry_count: number | null;
};

function deliveryText(row: HistoryRow): { text: string; tone: string } {
  if (row.delivered_at) {
    return { text: `✓ delivered (${row.http_status ?? 200})`, tone: "text-emerald-600" };
  }
  if (row.http_status != null) {
    const retries = (row.retry_count ?? 0) > 0 ? ` · ${row.retry_count} retries` : "";
    return { text: `failed (${row.http_status})${retries}`, tone: "text-destructive" };
  }
  return { text: "pending", tone: "text-muted-foreground" };
}

function NotesEditor({ leadId, notes }: { leadId: string; notes: string | null }) {
  const queryClient = useQueryClient();
  const setNotesFn = useServerFn(setLeadNotes);
  const [value, setValue] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(notes ?? "");
  }, [notes, leadId]);

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
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        rows={4}
        placeholder="What happened on the call?"
      />
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save note"}
        </Button>
      </div>
    </div>
  );
}

export function LeadDetailPanel({
  lead,
  open,
  onOpenChange,
  onSetStatus,
  onDismissSuggestion,
  suggestionVisible,
}: {
  lead: PanelLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetStatus: (leadId: string, status: string, suggestedStatus: string | null) => void;
  onDismissSuggestion: (leadId: string) => void;
  suggestionVisible: boolean;
}) {
  const queryClient = useQueryClient();
  const historyFn = useServerFn(getLeadStatusHistory);
  const reenrichFn = useServerFn(reenrichLead);
  const [reenriching, setReenriching] = useState(false);

  // Only this lead's timeline is fetched — the list is not refetched on open.
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["lead-status-history", lead?.id],
    queryFn: () => historyFn({ data: { leadId: lead!.id } }),
    enabled: Boolean(open && lead?.id),
  });

  if (!lead) return null;

  const responses = lead.responses ?? {};
  const entries = Object.entries(responses);
  // Everything that isn't a known prefill key is a question — no allowlist,
  // so keys this code has never seen still render.
  const answers = entries.filter(([k]) => !PREFILL_KEYS.includes(k));
  const profile = entries.filter(([k]) => PREFILL_KEYS.includes(k));

  const phone = lead.phone ?? null;
  const enrichmentStatus = lead.enrichment_status ?? "not_attempted";
  const enrichmentNote =
    enrichmentStatus !== "enriched"
      ? (lead.enrichment_error ?? ENRICHMENT_COPY[enrichmentStatus] ?? `Enrichment: ${enrichmentStatus}`)
      : null;
  const suggestion = lead.suggestion;
  const showSuggestion =
    suggestionVisible && Boolean(suggestion?.suggested_status) && suggestion?.confidence !== "none";

  const runReenrich = async () => {
    setReenriching(true);
    try {
      const res = (await reenrichFn({ data: { leadId: lead.id } })) as {
        ok?: boolean;
        skipped?: boolean;
        reason?: string;
        error?: string;
      };
      if (res?.ok && !res.skipped) toast.success("Lead details refreshed");
      else if (res?.skipped) toast.warning(`Skipped: ${res.reason ?? "no reason given"}`);
      else toast.error(res?.error ?? res?.reason ?? "Could not refresh this lead");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not refresh this lead");
    } finally {
      setReenriching(false);
    }
  };

  const rows = (history?.events ?? []) as HistoryRow[];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[480px]"
      >
        <SheetHeader className="border-b p-5 text-left">
          <SheetTitle className="text-lg">{lead.full_name || "Unnamed lead"}</SheetTitle>
          <SheetDescription>{identityLine(responses, lead.created_at)}</SheetDescription>
          {enrichmentNote ? (
            <p className="mt-1 text-xs text-amber-600">{enrichmentNote}</p>
          ) : null}
        </SheetHeader>

        <div className="space-y-6 p-5">
          {/* 2. Contact */}
          <section className="space-y-3">
            <SectionTitle>Contact</SectionTitle>
            {phone ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild>
                    <a href={waHref(phone)} target="_blank" rel="noopener noreferrer">
                      <MessageSquare className="size-4" /> WhatsApp
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <a href={`tel:${phone}`}>
                      <Phone className="size-4" /> Call
                    </a>
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{phone}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Copy phone number"
                    onClick={() => copy(phone, "Phone")}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No phone number yet.{" "}
                {ENRICHMENT_COPY[enrichmentStatus] ?? ""}
              </p>
            )}
            {lead.email ? (
              <Button asChild variant="outline" className="w-full justify-start">
                <a href={`mailto:${lead.email}`}>
                  <Mail className="size-4" /> {lead.email}
                </a>
              </Button>
            ) : null}
          </section>

          <Separator />

          {/* 3. Suggestion */}
          {showSuggestion && suggestion ? (
            <>
              <section className="space-y-2 rounded-md border p-3">
                <SectionTitle>AdsPro suggests</SectionTitle>
                <Badge variant="outline">
                  {statusLabel(suggestion.suggested_status!)}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {suggestion.confidence === "high"
                    ? "Decidable from their answers."
                    : "Confirm they replied on WhatsApp first."}
                </p>
                {suggestion.reason ? (
                  <p className="text-sm">{suggestion.reason}</p>
                ) : null}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() =>
                      onSetStatus(lead.id, suggestion.suggested_status!, suggestion.suggested_status)
                    }
                  >
                    Accept
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDismissSuggestion(lead.id)}>
                    Dismiss
                  </Button>
                </div>
              </section>
              <Separator />
            </>
          ) : null}

          {/* 4. Status */}
          <section className="space-y-3">
            <SectionTitle>Status</SectionTitle>
            <div className="flex items-center gap-2">
              {lead.latest_status ? (
                <Badge variant="secondary">{statusLabel(lead.latest_status)}</Badge>
              ) : (
                <span className="text-sm text-muted-foreground">No status set</span>
              )}
            </div>
            <Select
              onValueChange={(v) =>
                onSetStatus(lead.id, v, showSuggestion ? (suggestion?.suggested_status ?? null) : null)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Set status…" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {historyLoading ? (
              <p className="text-xs text-muted-foreground">Loading history…</p>
            ) : rows.length ? (
              <ul className="space-y-2">
                {rows.map((row, i) => {
                  const d = deliveryText(row);
                  return (
                    <li
                      key={row.status_event_id ?? `${row.created_at}-${i}`}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs"
                    >
                      <span className="font-medium">{statusLabel(row.status ?? "")}</span>
                      <span className="text-muted-foreground">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString(undefined, {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                      {row.meta_event_name ? (
                        <span className="text-muted-foreground">{row.meta_event_name}</span>
                      ) : null}
                      <span className={d.tone}>{d.text}</span>
                      {row.suggested_status ? (
                        <span className="text-muted-foreground">
                          suggested: {statusLabel(row.suggested_status)}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No status set yet.</p>
            )}
          </section>

          <Separator />

          {/* 5 + 6. Their answers, then profile details */}
          <section className="space-y-3">
            <SectionTitle>Their answers</SectionTitle>
            {answers.length || profile.length ? (
              <>
                {answers.length ? (
                  <dl className="space-y-2">
                    {answers.map(([key, value]) => (
                      <div key={key}>
                        <dt className="text-xs text-muted-foreground">{humanizeKey(key)}</dt>
                        <dd className="text-sm">{humanizeAnswer(value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No form questions captured for this lead.
                  </p>
                )}
                {profile.length ? (
                  <div className="space-y-2 pt-2">
                    <SectionTitle>Profile details</SectionTitle>
                    <dl className="space-y-2">
                      {profile.map(([key, value]) => (
                        <div key={key}>
                          <dt className="text-xs text-muted-foreground">{humanizeKey(key)}</dt>
                          {/* Rendered exactly as submitted — never reformatted. */}
                          <dd className="text-sm">
                            {key === "date_of_birth" ? String(value) : humanizeAnswer(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No answers captured</p>
            )}
          </section>

          <Separator />

          {/* 7. Source */}
          <section className="space-y-2">
            <SectionTitle>Source</SectionTitle>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Campaign</dt>
                <dd>{lead.campaign_name || lead.campaign_id || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Ad set</dt>
                <dd>{lead.adset_name || lead.adset_id || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Ad</dt>
                <dd>{lead.ad_name || lead.ad_id || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Leadgen ID</dt>
                <dd className="flex items-center gap-2">
                  <code className="text-xs">{lead.meta_leadgen_id ?? "—"}</code>
                  {lead.meta_leadgen_id ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Copy leadgen ID"
                      onClick={() => copy(lead.meta_leadgen_id!, "Leadgen ID")}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  ) : null}
                </dd>
              </div>
            </dl>
          </section>

          <Separator />

          {/* 8. Notes */}
          <section className="space-y-2">
            <SectionTitle>Notes</SectionTitle>
            <NotesEditor leadId={lead.id} notes={lead.notes ?? null} />
          </section>

          <Separator />

          {/* 9. Technical */}
          <section className="space-y-2">
            <SectionTitle>Technical</SectionTitle>
            <p className="text-xs text-muted-foreground">
              Received {new Date(lead.created_at).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              Enrichment: {enrichmentStatus.replace(/_/g, " ")}
            </p>
            {lead.enrichment_error ? (
              <p className="text-xs text-destructive">{lead.enrichment_error}</p>
            ) : null}
            <Button variant="outline" size="sm" onClick={runReenrich} disabled={reenriching}>
              <RefreshCw className={`size-4 ${reenriching ? "animate-spin" : ""}`} />
              {reenriching ? "Fetching…" : "Re-enrich this lead"}
            </Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
