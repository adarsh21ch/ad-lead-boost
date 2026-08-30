// Server-only: Meta Lead Ads enrichment. Never import from client code.
// Fetches GET /{leadgen_id} once per lead to resolve the person's name and the
// ad hierarchy the leadgen webhook omits.
//
// PII rules enforced here:
//  - raw phone/email are hashed for CAPI matching AND stored raw (leads.phone /
//    leads.email) so the owner can contact the lead; answers go to leads.responses
//  - the Graph `field_data` envelope is NEVER written to raw_field_data (webhook only)
//  - names/emails/phones/answers are never logged; only leadgen_id + status

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GRAPH_VERSION, decryptToken } from "./meta.server";

type AdminClient = SupabaseClient<any>;

export const MAX_ENRICHMENT_ATTEMPTS = 3;
export const RATE_LIMIT_CODES = [4, 17, 80004];

/** Read at request time so flipping the env var needs no redeploy. */
export function isLeadEnrichmentEnabled(): boolean {
  return process.env["LEAD_ENRICHMENT_ENABLED"] === "true";
}

const FULL_FIELDS =
  "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,is_organic,platform,field_data";
const MINIMAL_FIELDS = "field_data,created_time,ad_id,form_id";

export type EnrichResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped?: false; usedMinimalFields: boolean; fullNameFound: boolean }
  | { ok: false; error: "scope_missing" | "rate_limited" | "failed"; code: number | null; message: string };

type FieldDatum = { name?: string; values?: string[] };

export function resolveFullName(fieldData: FieldDatum[]): string | null {
  const get = (name: string) =>
    fieldData.find((f) => (f?.name ?? "").toLowerCase() === name)?.values?.[0]?.trim() || null;

  const full = get("full_name");
  if (full) return full;

  const first = get("first_name");
  const last = get("last_name");
  if (first || last) return [first, last].filter(Boolean).join(" ").trim() || null;

  const anyName = fieldData.find((f) => (f?.name ?? "").toLowerCase().includes("name"));
  const v = anyName?.values?.[0]?.trim();
  return v || null;
}

/** email: trimmed + lowercased. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** phone: digits only, country code kept, '+' and leading zeros stripped. */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pickFieldValue(fieldData: FieldDatum[], matcher: (name: string) => boolean): string | null {
  const hit = fieldData.find((f) => matcher((f?.name ?? "").toLowerCase()));
  return hit?.values?.[0]?.trim() || null;
}

type GraphAttempt = {
  ok: boolean;
  json: any;
  bodyText: string;
  httpStatus: number;
  code: number | null;
};

async function graphGetLead(leadgenId: string, token: string, fields: string): Promise<GraphAttempt> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    return {
      ok: false,
      json: null,
      bodyText: `network_error: ${err instanceof Error ? err.message : String(err)}`,
      httpStatus: 0,
      code: null,
    };
  }
  const bodyText = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(bodyText);
  } catch {
    /* non-JSON */
  }
  const code = typeof json?.error?.code === "number" ? json.error.code : null;
  return { ok: res.ok && !json?.error, json, bodyText, httpStatus: res.status, code };
}

/**
 * Enriches one lead. Safe to call repeatedly: it self-skips when already
 * enriched/unavailable, when the id is not a real Meta id, when the attempt cap
 * is reached, or when the feature flag is off.
 */
export async function enrichLead(admin: AdminClient, leadId: string): Promise<EnrichResult> {
  if (!isLeadEnrichmentEnabled()) return { ok: true, skipped: true, reason: "flag_off" };

  const { data: lead, error } = await admin
    .from("leads")
    .select(
      "id, account_id, meta_leadgen_id, enrichment_status, enrichment_attempts, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, form_id, phone_hash, email_hash, phone, email, responses",
    )

    .eq("id", leadId)
    .maybeSingle();
  if (error || !lead) return { ok: true, skipped: true, reason: "lead_not_found" };

  if (lead.enrichment_status === "enriched" || lead.enrichment_status === "unavailable") {
    return { ok: true, skipped: true, reason: `status_${lead.enrichment_status}` };
  }
  const leadgenId = lead.meta_leadgen_id ?? "";
  if (!/^[0-9]+$/.test(leadgenId)) {
    return { ok: true, skipped: true, reason: "not_a_meta_id" };
  }
  if ((lead.enrichment_attempts ?? 0) >= MAX_ENRICHMENT_ATTEMPTS) {
    return { ok: true, skipped: true, reason: "attempt_cap" };
  }

  const { data: account } = await admin
    .from("accounts")
    .select("id, meta_access_token_encrypted")
    .eq("id", lead.account_id)
    .maybeSingle();
  if (!account?.meta_access_token_encrypted) {
    await admin
      .from("leads")
      .update({ enrichment_status: "failed", enrichment_error: "Meta is not connected for this account" })
      .eq("id", lead.id);
    return { ok: false, error: "failed", code: null, message: "meta_not_connected" };
  }

  let token: string;
  try {
    token = await decryptToken(admin, account.meta_access_token_encrypted);
  } catch (err) {
    const message = err instanceof Error ? err.message : "token_decrypt_failed";
    await admin
      .from("leads")
      .update({ enrichment_status: "failed", enrichment_error: message })
      .eq("id", lead.id);
    return { ok: false, error: "failed", code: null, message };
  }

  // Increment attempts BEFORE the Graph call: a crash mid-call must not retry forever.
  await admin
    .from("leads")
    .update({ enrichment_attempts: (lead.enrichment_attempts ?? 0) + 1 })
    .eq("id", lead.id);

  let usedMinimalFields = false;
  let attempt = await graphGetLead(leadgenId, token, FULL_FIELDS);
  if (!attempt.ok && attempt.code === 100) {
    // Unknown field in the list — retry once with the minimal set.
    console.log(`[lead-enrichment] leadgen_id=${leadgenId} unknown-field (code 100), retrying minimal fields`);
    usedMinimalFields = true;
    attempt = await graphGetLead(leadgenId, token, MINIMAL_FIELDS);
  }

  const { reportTokenHealth, reportMetaError } = await import("./token-health.server");

  if (!attempt.ok) {
    const message = attempt.json?.error?.message ?? attempt.bodyText;
    const scopeMissing = attempt.code === 200 || /leads_retrieval/i.test(String(message));
    const rateLimited = attempt.code != null && RATE_LIMIT_CODES.includes(attempt.code);
    // Only a real token error flips token_status; scope/rate-limit report nothing.
    await reportMetaError(lead.account_id, "enrichment", {
      code: attempt.code,
      errorSubcode:
        typeof attempt.json?.error?.error_subcode === "number"
          ? attempt.json.error.error_subcode
          : null,
      httpStatus: attempt.httpStatus,
      message: typeof message === "string" ? message : String(message),
    });
    await admin
      .from("leads")
      .update({
        enrichment_status: "failed",
        // Meta's response body, verbatim.
        enrichment_error: attempt.bodyText,
      })
      .eq("id", lead.id);
    console.error(
      `[lead-enrichment] leadgen_id=${leadgenId} failed http=${attempt.httpStatus} code=${attempt.code}`,
    );
    return {
      ok: false,
      error: scopeMissing ? "scope_missing" : rateLimited ? "rate_limited" : "failed",
      code: attempt.code,
      message: String(message),
    };
  }

  await reportTokenHealth(lead.account_id, "ok", "enrichment");


  const payload = attempt.json ?? {};
  const fieldData: FieldDatum[] = Array.isArray(payload.field_data) ? payload.field_data : [];

  const fullName = resolveFullName(fieldData);

  const rawEmail = pickFieldValue(fieldData, (n) => n.includes("email"));
  const rawPhone = pickFieldValue(fieldData, (n) => n.includes("phone") || n.includes("mobile"));

  const update: Record<string, unknown> = {
    enrichment_status: "enriched",
    enriched_at: new Date().toISOString(),
    enrichment_error: null,
  };
  if (fullName) update["full_name"] = fullName;

  // Only fill columns that are currently NULL — never null out existing values.
  const fillIfNull = (column: string, value: unknown) => {
    if ((lead as Record<string, unknown>)[column] == null && value != null && value !== "") {
      update[column] = value;
    }
  };
  fillIfNull("ad_id", payload.ad_id);
  fillIfNull("ad_name", payload.ad_name);
  fillIfNull("adset_id", payload.adset_id);
  fillIfNull("adset_name", payload.adset_name);
  fillIfNull("campaign_id", payload.campaign_id);
  fillIfNull("campaign_name", payload.campaign_name);
  fillIfNull("form_id", payload.form_id);
  // Raw-vs-hash split: the hashes below keep coming from the NORMALISED values
  // (CAPI matching is unchanged); the raw values are stored alongside them so the
  // owner can actually call/email the person.
  if (rawPhone) fillIfNull("phone", rawPhone);
  if (rawEmail) fillIfNull("email", rawEmail);
  if (rawEmail) fillIfNull("email_hash", sha256Hex(normalizeEmail(rawEmail)));
  if (rawPhone) {
    const normalized = normalizePhone(rawPhone);
    if (normalized) fillIfNull("phone_hash", sha256Hex(normalized));
  }

  // Qualification answers: every field_data entry that is not a contact field.
  const responses: Record<string, string> = {};
  for (const f of fieldData) {
    const key = (f?.name ?? "").trim();
    if (!key) continue;
    const lower = key.toLowerCase();
    if (/name|email|phone|mobile/.test(lower)) continue;
    const value = f?.values?.[0]?.trim();
    if (!value) continue;
    responses[key] = value;
  }
  const existingResponses = (lead as Record<string, unknown>)["responses"];
  const existingHasKeys =
    existingResponses != null &&
    typeof existingResponses === "object" &&
    Object.keys(existingResponses as Record<string, unknown>).length > 0;
  if (!existingHasKeys && Object.keys(responses).length > 0) {
    update["responses"] = responses;
  }

  // Contact fields and qualification answers are persisted (columns phone, email,
  // responses); the raw Graph envelope still is not — raw_field_data holds the
  // webhook envelope only.
  const { error: writeError } = await admin.from("leads").update(update).eq("id", lead.id);

  if (writeError) {
    console.error(`[lead-enrichment] leadgen_id=${leadgenId} db write failed`, writeError.message);
    return { ok: false, error: "failed", code: null, message: writeError.message };
  }

  console.log(
    `[lead-enrichment] leadgen_id=${leadgenId} enriched name_found=${Boolean(fullName)} minimal=${usedMinimalFields}`,
  );
  return { ok: true, usedMinimalFields, fullNameFound: Boolean(fullName) };
}

/** Sequential, rate-limit-aware backfill for one account. Max 25 leads per call. */
export async function enrichMissingForAccount(admin: AdminClient, accountId: string) {
  const { data: leads, error } = await admin
    .from("leads")
    .select("id")
    .eq("account_id", accountId)
    .in("enrichment_status", ["not_attempted", "failed"])
    .lt("enrichment_attempts", MAX_ENRICHMENT_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(25);
  if (error) throw error;

  let processed = 0;
  let enriched = 0;
  let failed = 0;
  let scopeMissing = false;

  for (const lead of leads ?? []) {
    if (processed > 0) await new Promise((r) => setTimeout(r, 200));
    let result: EnrichResult;
    try {
      result = await enrichLead(admin, lead.id);
    } catch (err) {
      failed += 1;
      processed += 1;
      console.error(`[lead-enrichment] backfill threw for lead=${lead.id}`, err);
      continue;
    }
    processed += 1;
    if (result.ok) {
      if (!result.skipped) enriched += 1;
      continue;
    }
    if (result.error === "rate_limited") {
      // Stop the whole batch: the ad account has a ~60 calls/hour ceiling.
      return { processed, enriched, failed, rate_limited: true as const, scope_missing: false };
    }
    if (result.error === "scope_missing") scopeMissing = true;
    failed += 1;
  }

  return { processed, enriched, failed, rate_limited: false as const, scope_missing: scopeMissing };
}
