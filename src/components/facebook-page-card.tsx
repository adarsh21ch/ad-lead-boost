import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export type PageRow = {
  page_id: string;
  page_name: string | null;
  subscribe_status: string | null;
  subscribe_error: string | null;
  subscribed_at: string | null;
};

type AccountPageState = {
  meta_page_id?: string | null;
  page_subscribe_status?: string | null;
  page_subscribe_error?: string | null;
  page_subscribed_at?: string | null;
};

const SCOPE_HINT_RE = /#200|permission/i;

function pageLabel(pages: PageRow[], pageId: string | null | undefined) {
  if (!pageId) return "";
  const found = pages.find((p) => p.page_id === pageId);
  return found ? `${found.page_name ?? "Unnamed Page"} (${found.page_id})` : pageId;
}

export function FacebookPageCard({
  account,
  storedPages,
  onReconnect,
  reconnecting,
}: {
  account: AccountPageState;
  storedPages: PageRow[] | undefined;
  onReconnect: () => void;
  reconnecting: boolean;
}) {
  const queryClient = useQueryClient();

  const status = account.page_subscribe_status ?? "not_attempted";
  const connectedPageId = account.meta_page_id ?? null;
  const isConnected = status === "subscribed" && Boolean(connectedPageId);
  const isFailed = status === "failed";

  const [pages, setPages] = useState<PageRow[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [loadingPages, setLoadingPages] = useState(false);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [scopeMissing, setScopeMissing] = useState(false);
  const [scopeMessage, setScopeMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [partialWarning, setPartialWarning] = useState<string | null>(null);
  const autoLoaded = useRef(false);

  useEffect(() => {
    if (!storedPages?.length) return;
    setPages((prev) => (prev.length ? prev : storedPages));
  }, [storedPages]);

  useEffect(() => {
    setSelectedPageId((prev) => prev || connectedPageId || "");
  }, [connectedPageId]);

  const loadPages = async (silent = false) => {
    setLoadingPages(true);
    setScopeMissing(false);
    setScopeMessage(null);
    try {
      const res = await fetch("/api/public/pages/refresh", { method: "POST" });
      const body = (await res.json().catch(() => null)) as {
        ok: boolean;
        pages?: PageRow[];
        error?: string;
        message?: string;
      } | null;
      if (!body?.ok) {
        if (body?.error === "scope_missing") {
          setScopeMissing(true);
          setScopeMessage(body.message ?? null);
        } else if (!silent) {
          toast.error(body?.message ?? body?.error ?? "Could not load your Pages");
        }
        return;
      }
      const list = body.pages ?? [];
      setPages(list);
      setSelectedPageId((prev) => prev || connectedPageId || (list[0]?.page_id ?? ""));
      if (!silent) {
        toast.success(list.length ? `${list.length} Page(s) found` : "Meta returned no Pages");
      }
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : "Could not load your Pages");
    } finally {
      setLoadingPages(false);
    }
  };

  // Auto-load Pages whenever the picker is (or may become) visible — no click needed.
  const pickerVisible = !isConnected || changing;
  useEffect(() => {
    if (!pickerVisible || autoLoaded.current) return;
    autoLoaded.current = true;
    void loadPages(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerVisible]);

  const refreshAccount = async () => {
    await queryClient.invalidateQueries({ queryKey: ["integration-account"] });
    await queryClient.invalidateQueries({ queryKey: ["my-account"] });
    await queryClient.invalidateQueries({ queryKey: ["meta-pages"] });
  };

  type ConnectResult = { ok: boolean; error?: string; message?: string; subscribed_at?: string };

  const callConnect = async (pageId: string): Promise<ConnectResult> => {
    const res = await fetch("/api/public/pages/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page_id: pageId }),
    });
    return (
      ((await res.json().catch(() => null)) as ConnectResult | null) ?? {
        ok: false,
        message: "Meta returned an unreadable response",
      }
    );
  };

  const callDisconnect = async (pageId: string): Promise<ConnectResult> => {
    const res = await fetch("/api/public/pages/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page_id: pageId }),
    });
    return (
      ((await res.json().catch(() => null)) as ConnectResult | null) ?? {
        ok: false,
        message: "Meta returned an unreadable response",
      }
    );
  };

  const handleFailure = (body: ConnectResult) => {
    const message = body.message ?? body.error ?? "Meta rejected the request";
    if (body.error === "scope_missing" || SCOPE_HINT_RE.test(message)) {
      setScopeMissing(true);
      setScopeMessage(message);
    }
    setFailure(message);
    toast.error(message);
  };

  // Connect (STATE A / retry in STATE D)
  const connectPage = async () => {
    if (!selectedPageId) return;
    setBusy(true);
    setFailure(null);
    setPartialWarning(null);
    try {
      const body = await callConnect(selectedPageId);
      if (body.ok) {
        toast.success("Page connected — leads will arrive automatically");
        setChanging(false);
      } else {
        handleFailure(body);
      }
      await refreshAccount();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect this Page");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Switch order matters: subscribe B FIRST. Only after Meta confirms B do we
   * unsubscribe A, so a failed switch never leaves the account connected to
   * nothing. A failed unsubscribe of A is non-fatal (B is live).
   */
  const switchPage = async () => {
    if (!selectedPageId || !connectedPageId || selectedPageId === connectedPageId) return;
    const previousPageId = connectedPageId;
    const previousLabel = pageLabel(pages, previousPageId);
    setBusy(true);
    setFailure(null);
    setPartialWarning(null);
    try {
      // 1. Subscribe the new Page.
      const connectBody = await callConnect(selectedPageId);
      if (!connectBody.ok) {
        handleFailure(connectBody);
        await refreshAccount();
        return;
      }
      // 2. Only now unsubscribe the old Page.
      const disconnectBody = await callDisconnect(previousPageId);
      if (!disconnectBody.ok) {
        setPartialWarning(
          `Couldn't fully disconnect ${previousLabel || previousPageId} — leads from it may still be sent and will be ignored.`,
        );
      }
      setChanging(false);
      toast.success("Page switched — leads now arrive from the new Page");
      await refreshAccount();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not switch Page");
    } finally {
      setBusy(false);
    }
  };

  const picker = (
    <div className="space-y-2">
      {loadingPages && pages.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Finding your Facebook Pages…
        </p>
      ) : (
        <select
          value={selectedPageId}
          onChange={(e) => setSelectedPageId(e.target.value)}
          className="h-9 w-full max-w-sm rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Choose the Page your lead ads run from</option>
          {pages.map((p) => (
            <option key={p.page_id} value={p.page_id}>
              {p.page_name ?? "Unnamed Page"} ({p.page_id})
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className="block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        onClick={() => void loadPages()}
        disabled={loadingPages}
      >
        {loadingPages ? "Refreshing…" : "Just created a new Page? Refresh list"}
      </button>
    </div>
  );

  const scopeBlock = (
    <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
      <p className="font-medium text-amber-700 dark:text-amber-400">
        Your Meta connection was made before Page support was added. Reconnect once to enable
        automatic Page connection.
      </p>
      {scopeMessage ? <p className="mt-1 text-xs text-muted-foreground">{scopeMessage}</p> : null}
      <Button size="sm" className="mt-2" onClick={onReconnect} disabled={reconnecting}>
        {reconnecting ? "Redirecting…" : "Reconnect Meta"}
      </Button>
    </div>
  );

  let inner: React.ReactNode;

  if (scopeMissing) {
    // Dropdown is hidden entirely until Meta is reconnected.
    inner = scopeBlock;
  } else if (isConnected && changing) {
    // STATE C — changing
    const switching = Boolean(selectedPageId) && selectedPageId !== connectedPageId;
    inner = (
      <div className="space-y-3">
        {picker}
        {switching ? (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            Leads from {pageLabel(pages, connectedPageId) || connectedPageId} will stop arriving.
            Leads from {pageLabel(pages, selectedPageId) || selectedPageId} will start.
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={switchPage}
            disabled={busy || !selectedPageId || selectedPageId === connectedPageId}
          >
            {busy ? "Switching…" : "Switch Page"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setChanging(false);
              setSelectedPageId(connectedPageId ?? "");
              setFailure(null);
            }}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  } else if (isConnected) {
    // STATE B — connected. No dropdown, no "Load my Pages", no "Connect".
    inner = (
      <div className="space-y-2">
        <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm">
          <p className="font-medium text-emerald-700 dark:text-emerald-400">
            Connected — leads from this Page will arrive automatically
          </p>
          <p className="mt-1 text-sm">{pageLabel(pages, connectedPageId) || connectedPageId}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Subscribed{" "}
            {account.page_subscribed_at
              ? new Date(account.page_subscribed_at).toLocaleString()
              : "—"}
          </p>
        </div>
        {partialWarning ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">{partialWarning}</p>
        ) : null}
        <button
          type="button"
          className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => setChanging(true)}
        >
          Change Page
        </button>
      </div>
    );
  } else if (isFailed || failure) {
    // STATE D — failed
    const rawError = failure ?? account.page_subscribe_error ?? "Meta returned no message.";
    const needsScope = SCOPE_HINT_RE.test(rawError);
    inner = (
      <div className="space-y-3">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <p className="font-medium text-destructive">
            Page connection failed — no leads are arriving from this Page.
          </p>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-muted px-2 py-1 text-xs">
            {rawError}
          </pre>
          {needsScope ? (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                Your Meta connection needs to be refreshed — reconnect Meta and grant Page access.
              </p>
              <Button size="sm" className="mt-2" onClick={onReconnect} disabled={reconnecting}>
                {reconnecting ? "Redirecting…" : "Reconnect Meta"}
              </Button>
            </>
          ) : null}
        </div>
        {picker}
        <Button variant="outline" onClick={connectPage} disabled={busy || !selectedPageId}>
          {busy ? "Retrying…" : "Retry"}
        </Button>
      </div>
    );
  } else {
    // STATE A — not connected
    inner = (
      <div className="space-y-3">
        {picker}
        <Button onClick={connectPage} disabled={busy || !selectedPageId}>
          {busy ? "Connecting…" : "Connect Page"}
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Facebook Page</CardTitle>
        <CardDescription>
          {isConnected && !changing
            ? "AdsPro is listening for new leads from this Page."
            : "AdsPro subscribes your Page to Meta's leadgen webhook for you — pick the Page your lead ads run from."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {inner}

        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">
            Match leads by <code>leadgen_id</code> — not phone or email
          </p>
          <p className="mt-1">
            Leads arrive as identifiers only, so status updates must send the Meta{" "}
            <code>leadgen_id</code> as <code>lead_reference</code>. Sending a phone number or email
            will return <code>404</code>. Meta's Conversions API accepts <code>lead_id</code> as the
            preferred match key for lead-ads conversions, so delivery and Conversion Leads
            optimization work fully without PII.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
