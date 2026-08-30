import { humanizeAnswer, humanizeKey } from "@/lib/lead-format";

/**
 * The owner's own questions. Callers pass the already-partitioned entries —
 * partitioning is a classification, so nothing is ever dropped: any key that
 * isn't a Meta prefill field arrives here.
 */
export function LeadAnswers({
  entries,
  className,
}: {
  entries: Array<[string, string]>;
  className?: string;
}) {
  if (!entries.length) {
    return <span className="text-xs text-muted-foreground">No answers captured</span>;
  }
  return (
    <dl className={className ?? "space-y-1"}>
      {entries.map(([key, value]) => (
        <div key={key} className="text-xs leading-snug">
          <dt className="text-muted-foreground">{humanizeKey(key)}</dt>
          <dd className="text-foreground">{humanizeAnswer(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
