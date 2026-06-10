import { Navbar } from "@/components/layout/Navbar";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <section className="mx-auto max-w-3xl px-6 py-14 text-gray-800">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-forest-800">Mission Weight Loss and Wellness</p>
        <h1 className="mb-4 text-3xl font-bold text-gray-950">Terms and Conditions</h1>
        <p className="mb-8 text-sm text-gray-500">Last updated: March 1, 2026</p>

        <div className="space-y-8 text-sm leading-7 text-gray-700">

          <p>
            Please read these Terms and Conditions carefully before using Mission Weight Loss and Wellness. By
            accessing or using our service, you agree to be bound by these terms. If you do not agree, do not
            use the service.
          </p>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">1. About Mission</h2>
            <p>
              Mission Weight Loss and Wellness is a telehealth coordination platform. We connect patients with
              independent, licensed healthcare providers who make all clinical decisions. Mission is not a
              healthcare provider. Mission staff do not diagnose medical conditions, prescribe medications, or
              provide medical treatment.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">2. Scope of Services</h2>
            <p className="mb-3">
              Mission provides online intake tools, care coordination, secure patient messaging, payment
              coordination, pharmacy order coordination, and identity verification workflows. We facilitate
              connections between patients and licensed providers who operate independently and bear sole
              responsibility for all clinical decisions, including whether to prescribe medication.
            </p>
            <p>
              Prescription medications, including compounded Tirzepatide, are dispensed only through licensed
              third-party pharmacies pursuant to valid prescriptions issued by independent licensed providers.
              A consultation does not guarantee a prescription will be issued.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">3. Eligibility</h2>
            <p>
              You must be at least 18 years old to use Mission. By using our service, you confirm that you meet
              this age requirement. You must be located in a state where our provider network operates at the
              time of your consultation. We reserve the right to decline service in any jurisdiction where
              required by law.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">4. Your Responsibilities</h2>
            <p className="mb-3">You agree to:</p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Provide complete, accurate, and truthful information on all health forms and intake questionnaires.</li>
              <li>Keep your account credentials secure and notify us immediately of any unauthorized access.</li>
              <li>Use Mission only for lawful personal health purposes.</li>
              <li>Not attempt to circumvent any security controls or access systems you are not authorized to use.</li>
              <li>Follow all instructions provided by your licensed provider, including dosing and storage guidelines.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">5. Medical Emergencies</h2>
            <p>
              Mission is not an emergency service. If you are experiencing a medical emergency, call 911 or go
              to the nearest emergency room immediately. Do not contact Mission in place of seeking emergency care.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">6. Prescriptions and Medications</h2>
            <p className="mb-3">
              Prescriptions are issued solely at the discretion of the independent licensed provider who reviews
              your case. Mission does not guarantee that a prescription will be issued. Compounded medications
              are prepared by a US-based pharmacy and are not FDA-approved drug products, though they are
              prepared under applicable compounding regulations.
            </p>
            <p>
              You are responsible for using medications exactly as directed by your provider. Do not adjust your
              dose without consulting your provider first. Report any adverse reactions to your provider or to
              service@missionwlw.com immediately.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">7. Payments and Refunds</h2>
            <p className="mb-3">
              All program fees are disclosed before checkout. By completing a purchase you authorize Mission to
              charge the stated amount. Fees are generally non-refundable once a prescription has been issued
              and sent to the pharmacy, as clinical work and pharmacy preparation have been completed.
            </p>
            <p>
              If your order has not yet been dispensed by the pharmacy, contact service@missionwlw.com within
              48 hours of purchase to request a review. Refund eligibility is determined on a case-by-case basis.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">8. No Doctor-Patient Relationship with Mission</h2>
            <p>
              Your clinical relationship is with the independent licensed provider who reviews your case, not
              with Mission. Mission does not employ or control the providers in its network. Providers operate
              as independent contractors and are solely responsible for their clinical judgments.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">9. Limitation of Liability</h2>
            <p className="mb-3">
              To the fullest extent permitted by law, Mission and its affiliates will not be liable for any
              indirect, incidental, special, consequential, or punitive damages arising from your use of the
              service, including adverse medical outcomes, delays in care, or reliance on information provided
              through the platform.
            </p>
            <p>
              Mission&rsquo;s total aggregate liability for any claim will not exceed USD $1,000 or the amount
              you paid Mission in the 90 days preceding the claim, whichever is greater.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">10. Dispute Resolution</h2>
            <p>
              Any dispute arising out of or relating to these Terms or your use of Mission will be resolved by
              binding arbitration on an individual basis. You waive any right to a jury trial or to participate
              in a class action. Arbitration will be conducted under the rules of a nationally recognized
              arbitration body agreed upon by both parties.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">11. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the state in which Mission is headquartered, without
              regard to conflict-of-law provisions.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">12. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. We will post the updated version with a revised date.
              Your continued use of Mission after an update constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">13. Contact</h2>
            <p>
              Questions about these Terms can be directed to{" "}
              <a href="mailto:service@missionwlw.com" className="text-forest-800 underline underline-offset-2">
                service@missionwlw.com
              </a>
              .
            </p>
          </section>

        </div>
      </section>
    </main>
  );
}
