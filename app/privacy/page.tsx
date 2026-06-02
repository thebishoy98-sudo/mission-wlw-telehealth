import { Navbar } from "@/components/layout/Navbar";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <section className="mx-auto max-w-3xl px-6 py-14 text-gray-800">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-forest-800">Mission WLW</p>
        <h1 className="mb-4 text-3xl font-bold text-gray-950">Privacy Policy</h1>
        <p className="mb-8 text-sm text-gray-500">Last updated: May 26, 2026</p>

        <div className="space-y-6 text-sm leading-6">
          <p>
            Mission WLW provides online intake, care coordination, payment coordination, pharmacy coordination, and
            patient communication tools. This Privacy Policy explains what information we collect, how we use it, and
            how we protect it.
          </p>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Information We Collect</h2>
            <p>
              We collect information you provide directly, information generated through your use of Mission WLW, and
              information received from connected services. This may include contact details, account information,
              shipping information, questionnaire responses, consent records, identity verification materials, order
              details, payment status, messages, support requests, and technical information such as browser, device,
              log, and request data.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">How We Use Information</h2>
            <p>
              We use information to operate Mission WLW, manage patient intake, support provider review, coordinate
              pharmacy orders, send service-related messages, process or record payment activity, maintain accounting
              records, troubleshoot issues, improve reliability, protect against misuse, and meet legal, regulatory, and
              contractual obligations.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">QuickBooks Information</h2>
            <p>
              If an authorized admin connects QuickBooks Online, Mission WLW may receive and use QuickBooks company
              information needed to support the connected accounting workflow. This can include customer, invoice,
              payment, transaction, and company identifiers. We use QuickBooks information to create or update accounting
              records, reconcile payment activity, troubleshoot sync issues, maintain audit records, and support the
              integration. We do not sell QuickBooks information or use it for advertising.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Connected Account Credentials</h2>
            <p>
              Tokens, API keys, and integration credentials are used to operate authorized connections and are restricted
              to personnel and systems that need access to provide the service. We do not ask users to share QuickBooks
              passwords with Mission WLW.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Sharing Information</h2>
            <p>
              We share information with service providers and partners only as needed to operate Mission WLW and complete
              requested workflows. These may include hosting, database, payment, accounting, pharmacy, messaging,
              identity verification, analytics, and support providers. When QuickBooks Payments is used, payment
              processing services are provided by Intuit Payments Inc. We may also share information when required by law,
              to protect rights and safety, or as part of a business transaction. Health-related information should be
              shared only through appropriate workflows and vendor arrangements.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Security</h2>
            <p>
              We use safeguards designed to protect information, including encrypted transport, restricted operational
              access, environment-managed secrets, monitoring, and audit logging where appropriate. No system can be
              guaranteed completely secure, but we work to maintain controls that are appropriate for the type of
              information processed and the services we provide.
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
