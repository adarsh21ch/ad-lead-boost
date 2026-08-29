import { Fragment, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getIntegrationAccount,
  getMetaConnectUrl,
  listAccountDeliveries,
  listMetaPages,
  regenerateWebhookKey,
} from "@/lib/adspro.functions";
import { LEAD_STATUSES, STATUS_TO_META_EVENT } from "@/lib/adspro.constants";
import { AppShell } from "@/components/app-shell";
import { FacebookPageCard, type PageRow } from "@/components/facebook-page-card";
import { ConnectionSettings } from "@/components/connection-settings";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { getTokenHealth } from "@/lib/token-health";

const WEBHOOK_URL = "https://adsproindia.com/api/public/webhooks/status";

export const Route = createFileRoute("/_authenticated/dashboard/integration")({
  head: () => ({
    meta: [
      { title: "Integration — AdsPro" },
      {
        name: "description",
        content:
          "Wire your CRM into AdsPro: webhook endpoint, API key, Zapier setup and a live Meta test event.",
      },
      { property: "og:title", content: "Integration — AdsPro" },
      {
        property: "og:description",
        content:
          "Wire your CRM into AdsPro: webhook endpoint, API key, Zapier setup and a live Meta test event.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IntegrationPage,
});

type TestResult = {
  ok: boolean;
  http_status: number | null;
  meta_response: unknown;
  status_event_id?: string;
  error?: string;
};

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        toast.success(`${label} copied`);
      }}
    >
      Copy
    </Button>
  );
}

function IntegrationPage() {
  const queryClient = useQueryClient();
  const getAccountFn = useServerFn(getIntegrationAccount);
  const regenerateFn = useServerFn(regenerateWebhookKey);
  const listDeliveriesFn = useServerFn(listAccountDeliveries);
  const listPagesFn = useServerFn(listMetaPages);
  const getMetaConnectUrlFn = useServerFn(getMetaConnectUrl);

  const [revealed, setRevealed] = useState(false);
  const [testCode, setTestCode] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const { data: account, isLoading } = useQuery({
    queryKey: ["integration-account"],
    queryFn: () => getAccountFn(),
  });

  const ready = Boolean(account && account.status === "active" && account.meta_dataset_id);
  const tokenHealth = getTokenHealth(account ?? {});
  const tokenExpired = tokenHealth.state === "expired";
  const apiKey = (account?.webhook_api_key ?? "") as string;
  const tokenState = account as { token_status?: string | null; token_invalid_since?: string | null; token_last_error?: string | null } | null | undefined;
  const tokenInvalid = tokenState?.token_status === "invalid";

  const { data: storedPages } = useQuery({
    queryKey: ["meta-pages"],
    queryFn: () => listPagesFn(),
    enabled: ready,
  });

  const { data: deliveries } = useQuery({
    queryKey: ["integration-deliveries"],
    queryFn: () => listDeliveriesFn(),
    enabled: ready,
    refetchInterval: 30_000,
  });

  const contract = `POST ${WEBHOOK_URL}
Authorization: Bearer ${revealed && apiKey ? apiKey : "<webhook_api_key>"}
Content-Type: application/json

{
  "lead_reference": "<meta_leadgen_id>",
  "status": "qualified"
}`;

  const curlExample = `curl -X POST ${WEBHOOK_URL} \\
  -H "Authorization: Bearer ${revealed && apiKey ? apiKey : "YOUR_KEY_HERE"}" \\
  -H "Content-Type: application/json" \\
  -d '{"lead_reference":"1234567890123456","status":"qualified"}'`;

  const reconnectMeta = async () => {
    if (!account) return;
    setReconnecting(true);
    try {
      const url = await getMetaConnectUrlFn({ data: { accountId: account.id } });
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start Meta reconnect");
      setReconnecting(false);
    }
  };

  const regenerate = async () => {
    if (!account) return;
    try {
      const res = await regenerateFn({ data: { accountId: account.id } });
      queryClient.setQueryData(["integration-account"], (prev: typeof account) =>
        prev ? { ...prev, webhook_api_key: res.webhook_api_key } : prev,
      );
      setRevealed(true);
      toast.success("New API key generated — update your CRM/Zapier now");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not regenerate the key");
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/public/test-event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ test_event_code: testCode.trim() || undefined }),
      });
      const body = (await res.json().catch(() => null)) as TestResult | null;
      setResult(body ?? { ok: false, http_status: res.status, meta_response: null });
      await queryClient.invalidateQueries({ queryKey: ["integration-deliveries"] });
    } catch (err) {
      setResult({
        ok: false,
        http_status: null,
        meta_response: { error: err instanceof Error ? err.message : "request_failed" },
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integration</h1>
          <p className="text-sm text-muted-foreground">
            Wire your CRM into AdsPro and prove the pipe works end to end.
          </p>
        </div>

        {account && tokenInvalid && (
          <div role="alert" className="rounded-md border border-destructive bg-destructive/10 p-4">
            <p className="font-semibold text-destructive">Your Meta connection is no longer valid.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Lead outcomes are not reaching Meta and spend data has stopped updating. Reconnect to
              resume.
            </p>
            {tokenState?.token_last_error && (
              <p className="mt-2 font-mono text-xs break-words text-muted-foreground">
                {tokenState.token_last_error}
              </p>
            )}
            <Button size="sm" className="mt-3" onClick={reconnectMeta} disabled={reconnecting}>
              {reconnecting ? "Redirecting…" : "Reconnect Meta"}
            </Button>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !ready ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connect your Meta ad account first</CardTitle>
              <CardDescription>
                Connect your Meta ad account and choose a dataset first. Your webhook key stays
                hidden until then.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {account ? (
                <Button asChild>
                  <Link to="/dashboard/select-ad-account" search={{ account: account.id }}>
                    Choose ad account &amp; dataset
                  </Link>
                </Button>
              ) : (
                <Button disabled>Choose ad account &amp; dataset</Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <FacebookPageCard
              account={{
                meta_page_id: (account as { meta_page_id?: string | null }).meta_page_id ?? null,
                page_subscribe_status:
                  (account as { page_subscribe_status?: string | null }).page_subscribe_status ??
                  null,
                page_subscribe_error:
                  (account as { page_subscribe_error?: string | null }).page_subscribe_error ??
                  null,
                page_subscribed_at:
                  (account as { page_subscribed_at?: string | null }).page_subscribed_at ?? null,
              }}
              storedPages={storedPages as PageRow[] | undefined}
              onReconnect={reconnectMeta}
              reconnecting={reconnecting}
            />

            <ConnectionSettings
              account={{
                id: account!.id as string,
                meta_ad_account_id: (account as { meta_ad_account_id?: string | null }).meta_ad_account_id ?? null,
                meta_dataset_id: (account as { meta_dataset_id?: string | null }).meta_dataset_id ?? null,
              }}
            />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your webhook endpoint</CardTitle>
                <CardDescription>Point your CRM or Zapier at this URL.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Input readOnly value={WEBHOOK_URL} className="font-mono text-xs" />
                  <CopyButton value={WEBHOOK_URL} label="URL" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={revealed ? apiKey : "•".repeat(Math.min(apiKey.length, 32))}
                      className="font-mono text-xs"
                    />
                    <Button variant="ghost" size="sm" onClick={() => setRevealed((v) => !v)}>
                      {revealed ? "Hide" : "Reveal"}
                    </Button>
                    <CopyButton value={apiKey} label="API key" />
                  </div>
                  <p className="text-xs text-destructive">
                    Treat this like a password. Anyone with it can write lead statuses to your
                    account.
                  </p>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        Regenerate key
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Regenerate webhook API key?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Your existing Zapier/CRM integrations will stop working until you paste
                          the new key.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={regenerate}>Regenerate</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Send status updates</CardTitle>
                <CardDescription>The exact request contract.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-2">
                  <pre className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
                    {contract}
                  </pre>
                  <CopyButton value={contract} label="Request" />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>status</TableHead>
                      <TableHead>Meta event</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {LEAD_STATUSES.map((status) => (
                      <TableRow key={status}>
                        <TableCell className="font-mono text-xs">{status}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {STATUS_TO_META_EVENT[status]}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  <li>
                    <code>202</code> accepted
                  </li>
                  <li>
                    <code>401</code> bad or missing key
                  </li>
                  <li>
                    <code>404</code> no matching lead — check you sent the <code>leadgen_id</code>
                  </li>
                  <li>
                    <code>409</code> account not active
                  </li>
                  <li>
                    <code>400</code> bad status value
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Set up with Zapier</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="list-decimal space-y-2 pl-5 text-sm">
                  <li>
                    In Zapier, create a Zap. Trigger = your CRM (e.g. "Deal stage changed" in
                    HubSpot / Pipedrive / Google Sheets row updated).
                  </li>
                  <li>
                    Action = <strong>Webhooks by Zapier → POST</strong>.
                  </li>
                  <li>
                    <strong>URL</strong>: <code className="text-xs">{WEBHOOK_URL}</code>
                  </li>
                  <li>
                    <strong>Payload Type</strong>: <code>json</code>
                  </li>
                  <li>
                    <strong>Data</strong>: <code>lead_reference</code> = the Meta{" "}
                    <code>leadgen_id</code> stored against that lead in your CRM;{" "}
                    <code>status</code> = one of the six values above.
                  </li>
                  <li>
                    <strong>Headers</strong>: <code>Authorization</code> ={" "}
                    <code className="break-all text-xs">
                      Bearer {revealed && apiKey ? apiKey : "YOUR_KEY_HERE"}
                    </code>
                    , and <code>Content-Type</code> = <code>application/json</code>
                  </li>
                  <li>
                    Test the step. A <code>202</code> means AdsPro accepted it.
                  </li>
                </ol>
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Using a different tool?
                  </summary>
                  <div className="mt-3 flex items-start gap-2">
                    <pre className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
                      {curlExample}
                    </pre>
                    <CopyButton value={curlExample} label="cURL" />
                  </div>
                </details>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Send test event</CardTitle>
                <CardDescription>
                  Runs the real delivery path and shows Meta's verbatim response.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="test-code" className="text-sm font-medium">
                    Meta test event code (optional)
                  </label>
                  <Input
                    id="test-code"
                    value={testCode}
                    onChange={(e) => setTestCode(e.target.value)}
                    placeholder="TEST12345"
                    className="max-w-xs font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Find this in Events Manager → your dataset → Test Events. With a code set, the
                    event shows up there instead of affecting optimization.
                  </p>
                </div>
                {tokenExpired && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                    <p className="font-medium text-destructive">
                      Your Meta connection has expired.
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Test events cannot be sent until you reconnect Meta.
                    </p>
                    <Button asChild variant="outline" size="sm" className="mt-2">
                      <Link to="/dashboard">Reconnect Meta</Link>
                    </Button>
                  </div>
                )}
                <Button onClick={sendTest} disabled={testing || tokenExpired}>
                  {testing ? "Sending…" : "Send test event"}
                </Button>
                {result && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant={result.ok ? "default" : "destructive"}>
                        {result.ok ? "Delivered" : "Failed"}
                      </Badge>
                      <span className="text-muted-foreground">
                        HTTP {result.http_status ?? "—"}
                        {result.error ? ` · ${result.error}` : ""}
                      </span>
                    </div>
                    <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">
                      {JSON.stringify(result.meta_response ?? result, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent deliveries</CardTitle>
              </CardHeader>
              <CardContent>
                {!deliveries?.length ? (
                  <p className="text-sm text-muted-foreground">
                    No events delivered yet — send a test event above.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>HTTP</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveries.map((row) => (
                        <Fragment key={row.id}>
                          <TableRow>
                            <TableCell className="text-xs">
                              {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {row.meta_event_name}
                              {row.is_test && (
                                <Badge variant="secondary" className="ml-2">
                                  test
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">{row.http_status ?? "—"}</TableCell>
                            <TableCell>
                              {row.delivered_at ? (
                                <Badge>OK</Badge>
                              ) : row.dispatch_status === "abandoned" ? (
                                <Badge
                                  variant="outline"
                                  className="border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                >
                                  Abandoned after {row.attempt} attempt
                                  {row.attempt === 1 ? "" : "s"}
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  Failed (attempt {row.attempt}, retrying)
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                              >
                                {expanded === row.id ? "Hide" : "Details"}
                              </Button>
                            </TableCell>
                          </TableRow>
                          {expanded === row.id && (
                            <TableRow>
                              <TableCell colSpan={5}>
                                <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
                                  {JSON.stringify(row.meta_response, null, 2)}
                                </pre>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
