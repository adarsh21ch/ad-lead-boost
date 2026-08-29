import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMetaAdAccounts } from "@/lib/adspro.functions";
import { metaErrorCopy } from "@/lib/meta-error-copy";
import { AdAccountIdentityLines } from "@/components/ad-account-identity";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export type MetaAdAccountOption = {
  id: string;
  name: string;
  account_status?: number;
  business?: { id: string; name?: string };
};

export type AdAccountListError = {
  message: string;
  code: number | null;
  errorSubcode?: number | null;
};

/**
 * ONE ad-account chooser, rendered both by /dashboard/select-ad-account and by
 * the "Change ad account" dialog on Integration. Callers own the save action and
 * any nested step (dataset picking) via `actionSlot` / `expandedSlot`.
 */
export function AdAccountList({
  accountId,
  selectedId,
  currentId,
  actionSlot,
  expandedSlot,
  onError,
}: {
  accountId: string;
  /** Highlighted row (multi-step flows). */
  selectedId?: string | null;
  /** The ad account already saved on this AdsPro account. */
  currentId?: string | null;
  actionSlot: (account: MetaAdAccountOption) => ReactNode;
  expandedSlot?: (account: MetaAdAccountOption) => ReactNode;
  onError?: (error: AdAccountListError) => void;
}) {
  const listAdAccounts = useServerFn(listMetaAdAccounts);

  const query = useQuery({
    queryKey: ["meta-ad-accounts", accountId],
    queryFn: () => listAdAccounts({ data: { accountId } }),
    enabled: Boolean(accountId),
    retry: false,
  });

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">Loading ad accounts…</p>;
  }

  const listError = query.data && !query.data.ok ? query.data.error : null;
  if (listError || query.isError) {
    const error: AdAccountListError = listError ?? {
      message: query.error instanceof Error ? query.error.message : "Unknown error",
      code: null,
    };
    onError?.(error);
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">{metaErrorCopy(error)}</p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const accounts: MetaAdAccountOption[] = query.data?.ok ? query.data.data : [];
  if (accounts.length === 0) {
    return (
      <div className="rounded-md border p-4">
        <p className="text-sm font-medium">No ad accounts found for this Meta user.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Check that this Facebook account has a Business role on an ad account.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {accounts.map((account) => {
        const isSelected = selectedId === account.id;
        return (
          <Card key={account.id} className={isSelected ? "border-primary" : undefined}>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <AdAccountIdentityLines id={account.id} name={account.name} />
                <div className="flex shrink-0 items-center gap-2">
                  {currentId === account.id ? (
                    <span className="text-xs text-muted-foreground">In use</span>
                  ) : null}
                  {actionSlot(account)}
                </div>
              </div>
            </CardHeader>
            {isSelected && expandedSlot ? (
              <CardContent className="space-y-3 border-t pt-4">{expandedSlot(account)}</CardContent>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
