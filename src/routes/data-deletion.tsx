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

          <Section title="For AdsPro customers — disconnect Meta only">
            <p>
              This revokes AdsPro's access to your Meta account and stops all lead
              flow and conversion syncing. Your existing lead history stays in AdsPro.
            </p>
            <ol>
              <li>Sign in to AdsPro at adsproindia.com.</li>
              <li>
                In the left sidebar, click <strong>Settings</strong>.
              </li>
              <li>
                Scroll to the <strong>Meta connection</strong> section.
              </li>
              <li>
                Click <strong>Disconnect Meta</strong>, then confirm by clicking{" "}
                <strong>Disconnect</strong> in the dialog.
              </li>
            </ol>
            <p>
              AdsPro then unsubscribes your Facebook Page from lead notifications, calls
              Meta's <code>DELETE /me/permissions</code> endpoint to revoke every
              permission you granted, and erases your stored Meta access token, ad
              account, dataset and Page from our database.
            </p>
            <p>
              You may also revoke access from Meta's side at any time via Meta Settings →
              Business Integrations.
            </p>
          </Section>

          <Section title="For AdsPro customers — delete your account and all data">
            <p>
              This permanently removes your AdsPro account, every lead, every status
              event, and every delivery record. This cannot be undone.
            </p>
            <ol>
              <li>Sign in to AdsPro at adsproindia.com.</li>
              <li>
                In the left sidebar, click <strong>Settings</strong>.
              </li>
              <li>
                Scroll to the <strong>Danger zone</strong> section at the bottom of the
                page.
              </li>
              <li>
                In the field labelled <strong>Type DELETE to confirm</strong>, type{" "}
                <strong>DELETE</strong> exactly (uppercase). The button stays disabled
                until you do.
              </li>
              <li>
                Click <strong>Delete my account and all data</strong>.
              </li>
            </ol>
            <p>
              AdsPro first revokes your Meta access (the same steps as Disconnect Meta),
              then deletes your account row — which cascades to all of your leads, status
              events, delivery logs and Page records — and finally deletes your login. You
              are signed out immediately and the deletion is irreversible.
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
              are removed in accordance with our Privacy Policy. Lead records are in any
              case retained for no more than 90 days from creation. Customer account data
              deleted through the Danger zone is removed immediately; account data deleted
              by request is removed within 30 days of account closure.
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
