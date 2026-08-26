/** Client-safe helpers for describing Meta token freshness. */
export type TokenHealth = {
  state: "unknown" | "expired" | "expiring" | "healthy";
  daysRemaining: number | null;
  expiresAt: Date | null;
};

export const TOKEN_WARNING_DAYS = 14;

export function getTokenHealth(input: {
  status?: string | null;
  meta_token_expires_at?: string | null;
}): TokenHealth {
  const raw = input.meta_token_expires_at;
  const expiresAt = raw ? new Date(raw) : null;
  const valid = expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null;

  if (input.status === "token_expired") {
    return { state: "expired", daysRemaining: 0, expiresAt: valid };
  }
  if (!valid) return { state: "unknown", daysRemaining: null, expiresAt: null };

  const ms = valid.getTime() - Date.now();
  const daysRemaining = Math.max(0, Math.ceil(ms / 86_400_000));
  if (ms <= 0) return { state: "expired", daysRemaining: 0, expiresAt: valid };
  if (daysRemaining <= TOKEN_WARNING_DAYS) return { state: "expiring", daysRemaining, expiresAt: valid };
  return { state: "healthy", daysRemaining, expiresAt: valid };
}
