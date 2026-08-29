import { adAccountPrimary, adAccountSecondary, type AdAccountIdentity } from "@/lib/ad-account-label";
import { cn } from "@/lib/utils";

/**
 * Name first, id second. The single place that renders an ad account identity,
 * so no screen can regress to a bare `act_` number.
 */
export function AdAccountIdentityLines({
  id,
  name,
  className,
  emptyLabel = "Not set",
}: AdAccountIdentity & { className?: string; emptyLabel?: string }) {
  const primary = adAccountPrimary({ id, name });
  const secondary = adAccountSecondary({ id, name });

  if (!primary) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{emptyLabel}</p>;
  }

  return (
    <div className={className}>
      <p className="text-sm font-medium">{primary}</p>
      {secondary ? <p className="font-mono text-xs text-muted-foreground">{secondary}</p> : null}
    </div>
  );
}
