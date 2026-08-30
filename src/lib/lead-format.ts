/** Shared formatting helpers for the Leads screen and its detail panel. */

/**
 * Meta's documented Lead Ads *prefill* field names — values Meta already knows
 * about the person, not questions the advertiser wrote. These names (and only
 * these) are treated as "profile" fields and rendered in the Lead cell /
 * "Profile details"; every other key in `responses` is one of the owner's own
 * questions and renders in "Their answers".
 *
 * This is a CLASSIFICATION, never a filter: an unrecognised key is shown as a
 * question, so forms this code has never seen still render in full.
 */
export const META_PREFILL_KEYS = [
  "date_of_birth",
  "gender",
  "city",
  "state",
  "province",
  "country",
  "zip_code",
  "post_code",
  "street_address",
  "marital_status",
  "relationship_status",
  "military_status",
  "job_title",
  "company_name",
] as const;

/** Back-compat alias. */
export const PREFILL_KEYS: readonly string[] = META_PREFILL_KEYS;

export function isProfileKey(key: string): boolean {
  return (META_PREFILL_KEYS as readonly string[]).includes(key);
}

export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  not_qualified: "Not Qualified",
  booked: "Booked",
  purchased: "Purchased",
};

export function relativeTime(iso: string): string {
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

export function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Meta sends answer values snake-cased; nobody reads them that way. */
export function humanizeAnswer(value: unknown): string {
  const raw = String(value ?? "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? humanizeKey(status);
}

/**
 * Meta returns date_of_birth as MM/DD/YYYY. Parsed explicitly — `new Date(str)`
 * is locale-dependent and disagrees between browsers. Returns null when the
 * string doesn't parse or the age is implausible: a wrong age is worse than none.
 */
export function ageFromDob(dob: unknown): number | null {
  const raw = String(dob ?? "").trim();
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  const now = new Date();
  let age = now.getUTCFullYear() - year;
  const beforeBirthday =
    now.getUTCMonth() + 1 < month ||
    (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  if (age < 13 || age > 100) return null;
  return age;
}

/** age · gender · relative time — every segment independently optional. */
export function identityLine(
  responses: Record<string, string> | null | undefined,
  createdAt: string,
): string {
  const parts: string[] = [];
  const age = ageFromDob(responses?.["date_of_birth"]);
  if (age != null) parts.push(String(age));
  const gender = responses?.["gender"];
  if (gender) parts.push(humanizeAnswer(gender));
  parts.push(relativeTime(createdAt));
  return parts.join(" · ");
}

export function waHref(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

export const ENRICHMENT_COPY: Record<string, string> = {
  not_attempted: "Lead details haven't been fetched from Meta yet.",
  pending: "Fetching lead details from Meta…",
  failed: "Meta wouldn't return this lead's details.",
  skipped: "Fetching lead details is turned off for this workspace.",
};
