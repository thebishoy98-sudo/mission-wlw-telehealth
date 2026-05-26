import { Navbar } from "@/components/layout/Navbar";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <section className="mx-auto max-w-3xl px-6 py-14 text-gray-800">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-teal-700">Mission WLW</p>
        <h1 className="mb-4 text-3xl font-bold text-gray-950">Privacy Policy</h1>
        <p className="mb-8 text-sm text-gray-500">Last updated: May 26, 2026</p>

        <div className="space-y-6 text-sm leading-6">
          <p>
            Mission WLW operates a telehealth and medication access platform. We collect and use information needed to
            provide intake, eligibility review, payment, pharmacy coordination, patient communication, and support.
          </p>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Information We Collect</h2>
            <p>
              We may collect account details, contact information, shipping information, questionnaire responses,
              consent records, identity verification materials, order details, payment status, and technical data such
              as device, browser, and request metadata.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">How We Use Information</h2>
            <p>
              We use information to operate the service, support patient intake, coordinate provider review, process or
              record payments, create accounting records, submit approved pharmacy orders, send operational messages,
              detect misuse, troubleshoot issues, and comply with legal or regulatory obligations.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">QuickBooks and Intuit Data</h2>
            <p>
              When you connect QuickBooks, we use Intuit APIs only for authorized accounting, invoicing, payment
              reconciliation, and related operational workflows. We do not sell QuickBooks data. Access tokens and
              integration credentials are treated as confidential and are used only to provide the connected service.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Sharing Information</h2>
            <p>
              We share information with service providers only as needed to operate the platform. These may include
              payment, accounting, pharmacy, messaging, identity verification, hosting, database, support, and analytics
              providers. Health-related information should be shared only with vendors that are appropriate for the
              workflow and under required agreements.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Security</h2>
            <p>
              We use administrative, technical, and physical safeguards designed to protect information, including
              encrypted transport, restricted operational access, environment-based secrets, and audit logging where
              applicable. No system is completely secure, and production readiness depends on proper configuration,
              vendor agreements, access control, monitoring, and operational policies.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Data Retention</h2>
            <p>
              We retain information for as long as needed to provide services, meet legal obligations, resolve disputes,
              maintain business records, and enforce agreements. Retention periods may vary by record type and legal
              requirement.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Contact</h2>
            <p>
              Questions about this policy can be sent to service@missionwlw.com.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
