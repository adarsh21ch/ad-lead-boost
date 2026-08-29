/**
 * An `act_…` number means nothing to a person. Lead with the Meta ad account
 * name; keep the id as secondary, monospaced detail.
 *
 * `meta_ad_account_name` is NULL for an account that has never synced — in that
 * case the id stands alone. Never render an empty string, never "Unknown".
 */
export type AdAccountIdentity = {
  id: string | null | undefined;
  name?: string | null | undefined;
};

/** Primary line: the name when we have one, otherwise the id itself. */
export function adAccountPrimary({ id, name }: AdAccountIdentity): string | null {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return id?.trim() || null;
}

/** Secondary line: the id, but only when it is not already the primary line. */
export function adAccountSecondary({ id, name }: AdAccountIdentity): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return id?.trim() || null;
}

/** Single-line form for toasts and dense rows: "SAGAR ADS 1 (act_123)". */
export function adAccountLabel(identity: AdAccountIdentity): string {
  const primary = adAccountPrimary(identity);
  if (!primary) return "Not set";
  const secondary = adAccountSecondary(identity);
  return secondary ? `${primary} (${secondary})` : primary;
}
