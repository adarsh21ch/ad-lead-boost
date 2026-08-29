/** Client-safe mapping of Meta Graph error codes to copy a human can act on. */
export type MetaErrorLike = {
  message?: string | null;
  code?: number | null;
  errorSubcode?: number | null;
};

export function metaErrorCopy(error: MetaErrorLike | null | undefined): string {
  if (!error) return "Meta rejected the request.";
  const code = error.code ?? null;
  if (code === 190) return "Your Meta connection has expired. Reconnect to continue.";
  if (code === 200 || code === 10) {
    return "Your Meta login doesn't have permission for this ad account.";
  }
  if (code === 17 || code === 4) {
    return "Meta is rate limiting us right now. Try again in a few minutes.";
  }
  const message = error.message?.trim() || "Meta rejected the request.";
  return code == null ? message : `${message} (code ${code})`;
}
