import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AdsPro — Sync lead outcomes to Meta" },
      {
        name: "description",
        content:
          "Connect Meta Lead Ads and send Qualified, Booked, and Purchased outcomes back via the Conversions API so Meta finds people who actually convert.",
      },
      { property: "og:title", content: "AdsPro — Sync lead outcomes to Meta" },
      {
        property: "og:description",
        content:
          "Connect Meta Lead Ads and send Qualified, Booked, and Purchased outcomes back via the Conversions API so Meta finds people who actually convert.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <BrandLogo />
          <Button asChild size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>
      <main className="flex flex-1 items-center">
        <div className="mx-auto max-w-5xl px-4 py-20 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Teach Meta which leads actually convert
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            AdsPro connects your Meta Lead Ads account and syncs lead-status outcomes —
            Qualified, Booked, Purchased — back through the Conversions API, so Meta's
            algorithm optimizes for real customers, not just form-fillers.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Get started</Link>
            </Button>
          </div>
          <div className="mx-auto mt-16 grid max-w-3xl gap-6 text-left sm:grid-cols-3">
            {[
              {
                title: "Connect Meta",
                body: "Secure OAuth connection to your ad account and dataset in a few clicks.",
              },
              {
                title: "Send outcomes",
                body: "Push lead statuses from your CRM, Zapier, or manually from the dashboard.",
              },
              {
                title: "Optimize delivery",
                body: "Meta learns from real conversions and finds more people like your buyers.",
              },
            ].map((f) => (
              <div key={f.title} className="rounded-lg border bg-card p-5">
                <h2 className="font-semibold">{f.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t px-4 py-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <span>© 2026 Nevorai Technologies. All rights reserved.</span>
          <nav className="flex gap-4">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/data-deletion" className="hover:text-foreground">
              Data deletion
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
