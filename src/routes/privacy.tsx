import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — AdsPro" },
      {
        name: "description",
        content:
          "Privacy Policy for AdsPro by Nevorai Technologies. Learn how we handle advertiser and lead data for Meta Conversions API syncing.",
      },
      { property: "og:title", content: "Privacy Policy — AdsPro" },
      {
        property: "og:description",
        content:
          "Privacy Policy for AdsPro by Nevorai Technologies. Learn how we handle advertiser and lead data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
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
            Privacy Policy
          </h1>

          <Section title="1. Who we are">
            <p>
              This Privacy Policy is issued by <strong>Nevorai Technologies</strong>{" "}
              (trade name), a sole proprietorship registered in India, owned by{" "}
              <strong>Adarsh Chaturvedi</strong>. Our registered address is Lakhera
              Tighadda, Seetaram Colony, Nandishwar Temple, Chetgiri Colony,
              Chhatarpur, District Chhatarpur, Madhya Pradesh 471001, India. GSTIN:
              23CBCPC3986J1ZN.
            </p>
            <p>
              <strong>AdsPro</strong> (adsproindia.com) is a tool that lets advertisers
              running Meta Lead Ads connect their Meta ad account and sync lead-status
              outcomes — such as Qualified, Booked, and Purchased — back to Meta's
              Conversions API on the advertiser's behalf.
            </p>
            <p>
              Contact email: <strong>socialwiire@gmail.com</strong>
            </p>
          </Section>

          <Section title="2. Two kinds of people whose data we handle">
            <p>We handle personal data belonging to two distinct groups:</p>
            <ul>
              <li>
                <strong>Customers</strong> — advertisers who sign up for AdsPro. We
                process their email address, name, password (hashed by Supabase Auth),
                Meta ad account ID, Meta dataset/pixel ID, and an encrypted Meta access
                token.
              </li>
              <li>
                <strong>Leads</strong> — people who submit a Meta Lead Ad form belonging
                to one of our customers. For this data, the <strong>advertiser is the
                data fiduciary</strong> and AdsPro acts only as a{" "}
                <strong>data processor</strong> on the advertiser's instructions.
              </li>
            </ul>
          </Section>

          <Section title="3. What lead data we process">
            <p>
              When a customer's Meta Lead Ad generates a lead, AdsPro may process the
              lead's name, email address, phone number, and Meta lead ID. We also
              receive technical signals such as <code>fbc</code> and <code>fbp</code>{" "}
              click identifiers, IP address, and browser user agent. These signals are
              used solely for event matching when sending conversions back to Meta.
            </p>
            <p>
              Email addresses and phone numbers are <strong>hashed with SHA-256 before
              storage</strong>. We do not store them in readable form.
            </p>
          </Section>

          <Section title="4. Why we process data">
            <p>
              The sole purpose of processing lead data is to send conversion events to
              Meta's Conversions API so the advertiser's ad delivery can optimize toward
              leads that actually convert.
            </p>
            <p>
              We do not sell personal data, do not use it for our own advertising, and do
              not share it with any third party other than Meta for this specific
              purpose.
            </p>
          </Section>

          <Section title="5. Meta access tokens">
            <p>
              The Meta access token you authorize is stored encrypted at rest using
              PostgreSQL's <code>pgcrypto</code> extension. It is used only server-side
              to call Meta's APIs, and it is never exposed to any browser or returned to
              the client.
            </p>
          </Section>

          <Section title="6. Data retention">
            <p>
              Lead records and hashed identifiers are retained for <strong>90 days</strong>{" "}
              from creation and are then automatically deleted. Meta's conversion
              attribution windows do not exceed 28 days, so data older than 90 days
              serves no legitimate purpose.
            </p>
            <p>
              Customer account data is retained while the account is active and is
              deleted within 30 days of account closure.
            </p>
            <p>
              You can delete everything yourself at any time: sign in and go to{" "}
              <strong>Dashboard → Settings → Danger zone</strong>, type{" "}
              <strong>DELETE</strong> and click{" "}
              <strong>Delete my account and all data</strong>. This immediately and
              permanently removes your account, every lead, every status event and every
              delivery record. To stop data flowing without deleting anything, use{" "}
              <strong>Dashboard → Settings → Meta connection → Disconnect Meta</strong>,
              which revokes our Meta permissions and erases your stored Meta token. See
              our <a href="/data-deletion">Data Deletion Instructions</a> for the full
              steps.
            </p>
          </Section>

          <Section title="7. Sub-processors">
            <p>
              We use the following sub-processors to provide AdsPro:
            </p>
            <ul>
              <li>
                <strong>Supabase</strong> — database and authentication services
                (Mumbai region).
              </li>
              <li>
                <strong>Cloudflare</strong> — hosting, edge functions, and content
                delivery network.
              </li>
              <li>
                <strong>Meta Platforms, Inc.</strong> — recipient of conversion events
                sent through the Conversions API.
              </li>
            </ul>
          </Section>

          <Section title="8. Your rights under Indian data protection law">
            <p>
              Under the Digital Personal Data Protection Act, 2023 (India), you have the
              right to access, correction, erasure, grievance redressal, and nomination.
            </p>
            <p>
              Customers can exercise erasure directly in the app via{" "}
              <strong>Dashboard → Settings → Danger zone → Delete my account and all
              data</strong>.
            </p>
            <p>
              If you are a lead who wants your data removed, please contact the business
              whose ad you responded to (the data fiduciary). You may also contact us
              directly at socialwiire@gmail.com and we will act on the request in
              accordance with this policy.
            </p>
          </Section>

          <Section title="9. Grievance Officer">
            <p>
              Name: <strong>Adarsh Chaturvedi</strong>
              <br />
              Email: <strong>socialwiire@gmail.com</strong>
              <br />
              Address: Lakhera Tighadda, Seetaram Colony, Nandishwar Temple, Chetgiri
              Colony, Chhatarpur, District Chhatarpur, Madhya Pradesh 471001, India.
            </p>
          </Section>

          <Section title="10. Children">
            <p>
              AdsPro is not directed at or intended for use by anyone under the age of
              18. We do not knowingly collect personal data from children.
            </p>
          </Section>

          <Section title="11. Changes to this policy">
            <p>
              We may update this Privacy Policy from time to time. When we do, we will
              revise the "Last updated" date at the top of this page and notify
              customers of material changes by email.
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
