import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — AdsPro" },
      {
        name: "description",
        content:
          "Terms of Service for AdsPro by Nevorai Technologies. Read the rules and conditions for using our Meta Conversions API syncing tool.",
      },
      { property: "og:title", content: "Terms of Service — AdsPro" },
      {
        property: "og:description",
        content:
          "Terms of Service for AdsPro by Nevorai Technologies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/">
            <BrandLogo />
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
            Terms of Service
          </h1>

          <Section title="1. Acceptance and eligibility">
            <p>
              These Terms of Service govern your use of <strong>AdsPro</strong> (the
              "Service"), operated by <strong>Nevorai Technologies</strong>, a sole
              proprietorship owned by Adarsh Chaturvedi and registered in India.
            </p>
            <p>
              By signing up or using the Service, you agree to these terms. You must be
              at least 18 years old and must be fully authorised to act on behalf of the
              Meta ad account you connect.
            </p>
          </Section>

          <Section title="2. Description of service">
            <p>
              AdsPro connects your Meta Lead Ads account and sends lead-status outcomes
              — such as Qualified, Booked, and Purchased — back to Meta via the
              Conversions API.
            </p>
            <p>
              <strong>AdsPro does not create, manage, or pay for ads on your behalf,</strong>{" "}
              and <strong>does not guarantee any advertising outcome, performance
              improvement, or return on ad spend.</strong> Results depend on your
              audience, creative, offer, and Meta's systems.
            </p>
          </Section>

          <Section title="3. Customer obligations">
            <p>You agree that:</p>
            <ul>
              <li>
                You have a lawful basis and, where required, valid consent to process the
                lead data you send us.
              </li>
              <li>
                You will comply with Meta's Business Tools Terms, Advertising Policies,
                and Platform Terms at all times.
              </li>
              <li>
                You will not send us data about any individual who has opted out of
                processing or objected to the use of their personal data.
              </li>
              <li>
                You will not submit fabricated, fraudulent, or misleading conversion
                events.
              </li>
            </ul>
          </Section>

          <Section title="4. Data fiduciary and processor">
            <p>
              For lead data generated through your Meta Lead Ads, <strong>you are the
              data fiduciary</strong> and <strong>AdsPro is your data processor</strong>.
              AdsPro processes that data only on your instructions and solely to send
              conversion events to Meta.
            </p>
          </Section>

          <Section title="5. Meta connection and authorisation">
            <p>
              You authorise AdsPro to access your Meta ad account, datasets, and related
              advertising data through Meta's OAuth flow. You may revoke this
              authorisation at any time from Meta Settings → Business Integrations, or by
              disconnecting your account in AdsPro.
            </p>
            <p>
              Once disconnected, AdsPro will no longer be able to call Meta APIs on your
              behalf, and queued events tied to your account will not be delivered.
            </p>
          </Section>

          <Section title="6. Acceptable use">
            <p>You may not:</p>
            <ul>
              <li>Reverse engineer, decompile, or attempt to extract our source code.</li>
              <li>Resell, sublicense, or white-label the Service without written consent.</li>
              <li>Use the Service to send fabricated or malicious conversion events.</li>
              <li>Interfere with the Service's infrastructure or other users' accounts.</li>
            </ul>
          </Section>

          <Section title="7. Availability">
            <p>
              The Service is provided <strong>"as is"</strong> during this early-access
              phase. We do not guarantee uptime, availability, or uninterrupted service,
              and we may perform maintenance or updates at any time.
            </p>
          </Section>

          <Section title="8. Fees and billing">
            <p>
              Pricing and billing terms will be presented to you before any paid plan
              begins. The Service is currently in early access.
            </p>
            <p>
              When fees are charged, they are inclusive of 18% GST unless otherwise
              stated.
            </p>
          </Section>

          <Section title="9. Limitation of liability">
            <p>
              To the maximum extent permitted by law, the total liability of Nevorai
              Technologies for any claim arising out of or relating to the Service is
              limited to the fees you paid in the preceding three months, or <strong>₹0</strong>{" "}
              while the Service is free.
            </p>
            <p>
              We will not be liable for any indirect, incidental, special, consequential,
              or punitive damages, including lost profits or business interruption.
            </p>
          </Section>

          <Section title="10. Termination">
            <p>
              Either party may terminate the agreement at any time. You may delete your
              account from within the Service. We may suspend or terminate your access
              for violations of these terms.
            </p>
            <p>
              Upon termination, your data will be handled in accordance with our Privacy
              Policy.
            </p>
          </Section>

          <Section title="11. Governing law and jurisdiction">
            <p>
              These Terms are governed by the laws of <strong>India</strong>. Any dispute
              shall be subject to the exclusive jurisdiction of the courts at{" "}
              <strong>Chhatarpur, Madhya Pradesh</strong>.
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
