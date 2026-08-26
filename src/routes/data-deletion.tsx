import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/data-deletion")({
  head: () => ({
    meta: [
      { title: "Data Deletion Instructions — AdsPro" },
      {
        name: "description",
        content:
          "Instructions for deleting your data from AdsPro by Nevorai Technologies, including disconnecting Meta and removing lead records.",
      },
      { property: "og:title", content: "Data Deletion Instructions — AdsPro" },
      {
        property: "og:description",
        content:
          "Instructions for deleting your data from AdsPro by Nevorai Technologies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataDeletionPage,
});

function DataDeletionPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="text-lg font-semibold text-foreground">
            AdsPro
          </Link>
          <ButtonLink to="/auth">Sign in</ButtonLink>
        </div>
      </header>

      <main className="flex-1 px-4 py-12">
        <article className="mx-auto max-w-3xl">
          <p className="text-sm text-muted-foreground">
            Last updated: 26 August 2026
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            Data Deletion Instructions
          </h1>

          <Section title="For AdsPro customers">
            <p>
              To delete your AdsPro account and disconnect Meta:
            </p>
            <ol>
              <li>Sign in to AdsPro and open the dashboard.</li>
              <li>Disconnect your Meta ad account from the integration settings.</li>
              <li>Delete your AdsPro account from the account settings page.</li>
            </ol>
            <p>
              Disconnecting AdsPro from your Meta account via Meta Settings → Business
              Integrations immediately revokes our access token, and we can no longer
              call Meta APIs on your behalf.
            </p>
          </Section>

          <Section title="For people who submitted a Meta Lead Ad form">
            <p>
              If you filled out a lead form on an ad run by one of our customers, that
              business is the data fiduciary for your information. Please contact the
              business whose ad you responded to and ask them to remove your data.
            </p>
            <p>
              You may also email us directly at <strong>socialwiire@gmail.com</strong>{" "}
              with the phone number or email address you submitted. We will locate the
              hashed record and delete it within <strong>30 days</strong>.
            </p>
          </Section>

          <Section title="What happens after deletion">
            <p>
              Once your deletion request is processed, lead records and hashed identifiers
              are removed in accordance with our Privacy Policy. Customer account data is
              deleted within 30 days of account closure.
            </p>
          </Section>
        </article>
      </main>

      <Footer />
    </div>
  );
}

function ButtonLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to as any}
      className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
    >
      {children}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function Footer() {
  return (
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
  );
}
