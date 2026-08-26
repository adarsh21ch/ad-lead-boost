import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccount, sendTestEvent } from "@/lib/adspro.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/integration")({
  head: () => ({
    meta: [
      { title: "Integration — AdsPro" },
      { name: "description", content: "Copy AdsPro webhook credentials and test the Meta Conversions API pipeline." },
      { property: "og:title", content: "Integration — AdsPro" },
      { property: "og:description", content: "Copy AdsPro webhook credentials and test the Meta Conversions API pipeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IntegrationPage,
});

function IntegrationPage() {
  const getMyAccountFn = useServerFn(getMyAccount);
  const sendTestEventFn = useServerFn(sendTestEvent);
  const [testing, setTesting] = useState(false);

  const { data: account, isLoading } = useQuery({
    queryKey: ["my-account"],
    queryFn: () => getMyAccountFn(),
  });

  const webhookUrl = `${window.location.origin}/api/public/webhooks/status`;
  const exampleBody = JSON.stringify({ lead_reference: "+15551234567", status: "qualified" }, null, 2);
  const exampleCurl = `curl -X POST ${webhookUrl} \\
  -H "Authorization: Bearer ${account?.webhook_api_key ?? "<your-api-key>"}" \\
  -H "Content-Type: application/json" \\
  -d '{"lead_reference": "+15551234567", "status": "qualified"}'`;

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const sendTest = async () => {
    if (!account) return;
    setTesting(true);
    try {
      const result = await sendTestEventFn({ data: { accountId: account.id } });
      if (result.ok) {
        toast.success(`Test event delivered to Meta (HTTP ${result.httpStatus})`);
      } else {
        toast.error(`Test event failed${result.error ? `: ${result.error}` : ""}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test event failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integration</h1>
          <p className="text-sm text-muted-foreground">
            Send lead-status outcomes from Zapier or any CRM via the webhook below.
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !account ? (
          <p className="text-sm text-muted-foreground">
            Connect Meta on the dashboard first to get your webhook credentials.
          </p>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Webhook URL</CardTitle>
                <CardDescription>
                  In Zapier: "Webhooks by Zapier" → POST → this URL, with the JSON body shape
                  below and an Authorization header.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
                    POST {webhookUrl}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => copy(webhookUrl, "URL")}>
                    Copy
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
                    Authorization: Bearer {account.webhook_api_key}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copy(account.webhook_api_key, "API key")}
                  >
                    Copy key
                  </Button>
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium">Body (JSON)</p>
                  <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
                    {exampleBody}
                  </pre>
                  <p className="mt-1 text-xs text-muted-foreground">
                    lead_reference matches a lead by Meta leadgen ID, phone, or email. status is
                    one of: contacted, qualified, not_qualified, booked, no_show, purchased.
                  </p>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-medium">cURL example</p>
                    <Button variant="ghost" size="sm" onClick={() => copy(exampleCurl, "cURL")}>
                      Copy
                    </Button>
                  </div>
                  <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
                    {exampleCurl}
                  </pre>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Test the pipeline</CardTitle>
                <CardDescription>
                  Fires a dummy "qualified" status event through the same path a real webhook
                  takes, so you can confirm it reaches Meta.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={sendTest} disabled={testing || account.status !== "active"}>
                  {testing ? "Sending…" : "Send test event"}
                </Button>
                {account.status !== "active" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Finish connecting Meta (ad account + dataset) before sending a test.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
