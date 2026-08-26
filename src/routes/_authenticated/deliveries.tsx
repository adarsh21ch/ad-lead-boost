import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDeliveryLogs } from "@/lib/adspro.functions";
import { AppShell } from "@/components/app-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/deliveries")({
  head: () => ({
    meta: [
      { title: "Delivery Log — AdsPro" },
      { name: "description", content: "Inspect recent Conversions API delivery attempts and Meta responses in AdsPro." },
      { property: "og:title", content: "Delivery Log — AdsPro" },
      { property: "og:description", content: "Inspect recent Conversions API delivery attempts and Meta responses in AdsPro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DeliveriesPage,
});

function DeliveriesPage() {
  const queryClient = useQueryClient();
  const listDeliveryLogsFn = useServerFn(listDeliveryLogs);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["delivery-logs"],
    queryFn: () => listDeliveryLogsFn(),
    refetchInterval: 30_000,
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Delivery log</h1>
            <p className="text-sm text-muted-foreground">
              Recent Conversions API deliveries to Meta.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["delivery-logs"] })}
          >
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !logs?.length ? (
          <p className="text-sm text-muted-foreground">
            No deliveries yet. Events appear here once the dispatcher sends them to Meta.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Meta event</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Meta response</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const ok = !!log.delivered_at && log.http_status != null && log.http_status < 300;
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {new Date(log.delivered_at ?? "").toLocaleString() || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.meta_event_name}</TableCell>
                      <TableCell className="font-mono text-xs">{log.http_status ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={ok ? "default" : "destructive"}>
                          {ok ? "Delivered" : "Failed"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate font-mono text-xs text-muted-foreground">
                        {JSON.stringify(log.meta_response)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
