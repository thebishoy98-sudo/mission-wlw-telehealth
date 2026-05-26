import { Navbar } from "@/components/layout/Navbar";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <section className="mx-auto max-w-3xl px-6 py-14 text-gray-800">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-teal-700">Mission WLW</p>
        <h1 className="mb-4 text-3xl font-bold text-gray-950">Terms of Service and End User License Agreement</h1>
        <p className="mb-8 text-sm text-gray-500">Last updated: May 26, 2026</p>

        <div className="space-y-6 text-sm leading-6">
          <p>
            These Terms of Service and End User License Agreement govern access to and use of the Mission WLW platform.
            By using the service, you agree to these terms and any additional notices presented in the product.
          </p>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Service Description</h2>
            <p>
              Mission WLW provides online intake, eligibility workflow, payment and accounting coordination, provider
              review support, pharmacy order coordination, and patient communication tools. Medical decisions are made
              by licensed providers, not by the software.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">License and Restrictions</h2>
            <p>
              We grant authorized users a limited, revocable, non-transferable license to access the service for its
              intended business or care coordination purpose. Users may not reverse engineer the service, misuse APIs,
              interfere with security controls, upload malicious content, or use the service unlawfully.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">QuickBooks Connection</h2>
            <p>
              If you connect QuickBooks or Intuit services, you authorize Mission WLW to access and use the connected
              company data only for accounting, invoicing, payment reconciliation, and related operational workflows.
              You may revoke access through QuickBooks or the disconnect flow at any time.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">User Responsibilities</h2>
            <p>
              Users are responsible for providing accurate information, maintaining account confidentiality, using the
              service only for lawful purposes, and ensuring they have authority to submit information or connect third
              party services such as QuickBooks.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Medical and Pharmacy Disclaimer</h2>
            <p>
              The platform supports administrative and care coordination workflows. It does not replace medical advice,
              diagnosis, treatment, or provider judgment. Eligibility, prescriptions, dosage decisions, and pharmacy
              fulfillment are handled by qualified professionals and applicable third parties.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Availability and Changes</h2>
            <p>
              We may update, suspend, or discontinue parts of the service as needed for security, compliance,
              maintenance, legal obligations, or business reasons. We may update these terms from time to time.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Contact</h2>
            <p>
              Questions about these terms can be sent to service@missionwlw.com.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
