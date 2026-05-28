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
            These Terms of Service and End User License Agreement apply to your use of Mission WLW, including our
            website, intake tools, patient communications, payment coordination, and connected business software
            features. By accessing or using Mission WLW, you agree to these terms.
          </p>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Service Description</h2>
            <p>
              Mission WLW supports online intake, eligibility review workflows, provider review coordination, patient
              messaging, payment coordination, accounting workflows, and pharmacy order coordination. The platform is an
              administrative and care coordination tool. Medical decisions, including eligibility, prescriptions,
              dosage, and follow-up care, are made by qualified healthcare professionals.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">License and Restrictions</h2>
            <p>
              We grant authorized users a limited, non-exclusive, non-transferable right to access Mission WLW for its
              intended business, patient intake, and care coordination purposes. You may not copy, resell, reverse
              engineer, interfere with, or misuse the platform; attempt to bypass security controls; upload malicious
              content; or use Mission WLW for any unlawful purpose.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">QuickBooks Connection</h2>
            <p>
              When an authorized admin connects a QuickBooks Online company, Mission WLW may access and update the
              QuickBooks records needed to perform the requested accounting workflow, such as creating customers,
              preparing invoices, recording payment status, and reconciling order activity. Mission WLW does not use the
              QuickBooks connection for unrelated purposes. The connection can be revoked from QuickBooks or through the
              Mission WLW disconnect page.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Third-Party Services</h2>
            <p>
              Mission WLW may rely on third-party services for hosting, payment processing, accounting, pharmacy
              coordination, secure communications, analytics, and support. Payment processing services may be provided
              by Intuit Payments Inc. Your use of connected services may also be governed by their own terms and
              policies. Mission WLW is not affiliated with or endorsed by Intuit.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">User Responsibilities</h2>
            <p>
              You are responsible for providing accurate information, keeping account credentials secure, maintaining
              authority to act on behalf of your organization, and ensuring that any third-party account you connect,
              including QuickBooks, is connected by an authorized user.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Medical and Pharmacy Disclaimer</h2>
            <p>
              Mission WLW does not provide medical advice, diagnose conditions, prescribe medication, or operate as a
              pharmacy. The platform supports administrative workflows used by patients, providers, staff, and pharmacy
              partners. Clinical decisions and pharmacy fulfillment remain the responsibility of the applicable licensed
              professionals and third-party providers.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-950">Availability and Changes</h2>
            <p>
              We may update, suspend, or discontinue parts of Mission WLW as needed for security, maintenance,
              compliance, legal, operational, or business reasons. We may also update these terms from time to time.
              Continued use of the service after an update means you accept the updated terms.
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
