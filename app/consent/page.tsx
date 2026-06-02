import { Navbar } from "@/components/layout/Navbar";

export default function ConsentPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <section className="mx-auto max-w-3xl px-6 py-14 text-gray-800">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-forest-800">Mission Weight Loss and Wellness</p>
        <h1 className="mb-4 text-3xl font-bold text-gray-950">Telehealth Informed Consent</h1>
        <p className="mb-8 text-sm text-gray-500">Last updated: March 1, 2026</p>

        <div className="space-y-8 text-sm leading-7 text-gray-700">

          <p>
            This document explains your rights and the nature of telehealth services provided through Mission
            Weight Loss and Wellness. By proceeding with a telehealth consultation, you confirm that you have
            read, understood, and consent to the terms described below.
          </p>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">What Is Telehealth</h2>
            <p>
              Telehealth involves the delivery of healthcare services using electronic communications, including
              secure messaging and video conferencing. Through Mission, you will communicate with an independent
              licensed healthcare provider who will review your health information and, if clinically appropriate,
              issue a prescription.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">Nature of the Service</h2>
            <p className="mb-3">
              Mission Weight Loss and Wellness is a telehealth coordination platform, not a healthcare provider.
              Licensed providers who participate in the Mission network are independent contractors. All clinical
              decisions, including eligibility determinations, prescriptions, dosing, and follow-up care, are
              made solely by the licensed provider assigned to your case.
            </p>
            <p>
              A consultation does not guarantee that a prescription will be issued. The provider will make that
              determination based on your individual health history and clinical judgment.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">Benefits of Telehealth</h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Access to licensed medical care without traveling to an office.</li>
              <li>Convenient consultations from your home or any private location.</li>
              <li>Faster access to prescription medications when clinically appropriate.</li>
              <li>Ongoing provider support through secure messaging.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">Risks and Limitations</h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Telehealth does not replace an in-person physical examination. Your provider relies on the information you provide.</li>
              <li>Technical issues such as poor internet connection may interrupt a consultation.</li>
              <li>In some cases, a telehealth consultation may not be sufficient to make a clinical determination and an in-person visit may be recommended.</li>
              <li>Unauthorized access to electronic communications could occur despite security safeguards, though Mission uses encrypted, HIPAA-compliant systems.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">Your Responsibilities</h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Provide complete and accurate health information to your provider.</li>
              <li>Disclose all medications, supplements, and relevant medical history.</li>
              <li>Follow your provider&rsquo;s clinical instructions and dosing guidance.</li>
              <li>Contact your provider immediately if you experience unexpected side effects.</li>
              <li>Call 911 or go to an emergency room for any medical emergency.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">Privacy and Security</h2>
            <p>
              All health information exchanged through Mission is handled in accordance with applicable HIPAA
              regulations. Your information is transmitted using encrypted, secure channels. It will not be
              shared with third parties except as required to deliver your care or comply with the law. For
              full details, see our{" "}
              <a href="/privacy" className="text-forest-800 underline underline-offset-2">Privacy Policy</a>.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">Right to Withdraw Consent</h2>
            <p>
              You may withdraw your consent to telehealth services at any time by contacting
              service@missionwlw.com. Withdrawing consent will stop future consultations but will not affect
              care that has already been provided or prescriptions already issued.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">Emergency Situations</h2>
            <p>
              Mission is not equipped to handle medical emergencies. If you are experiencing chest pain,
              difficulty breathing, severe allergic reaction, or any other emergency, call 911 or go to
              your nearest emergency room immediately. Do not wait to contact Mission.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-gray-950">Contact</h2>
            <p>
              Questions about this consent form can be directed to{" "}
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
