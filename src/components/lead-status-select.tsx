import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";
import { LEAD_STATUSES } from "@/lib/adspro.constants";
import { statusLabel } from "@/lib/lead-format";

/**
 * The status badge IS the control. Clicking it never bubbles to the row, so it
 * cannot open the detail panel. Nothing is written until an item is clicked.
 */
export function LeadStatusSelect({
  status,
  onSelect,
  className,
}: {
  status: string | null | undefined;
  onSelect: (status: string) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button type="button" className={className} aria-label="Set lead status">
          {status ? (
            <Badge variant="secondary" className="cursor-pointer gap-1">
              {statusLabel(status)}
              <ChevronDown className="size-3 opacity-70" aria-hidden />
            </Badge>
          ) : (
            <span className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground">
              Set status…
              <ChevronDown className="size-3 opacity-70" aria-hidden />
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {LEAD_STATUSES.map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={() => onSelect(s)}
            className={s === status ? "font-semibold" : undefined}
          >
            {statusLabel(s)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
