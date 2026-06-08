import { Navbar } from "@/components/layout/Navbar";
import Link from "next/link";

export default function DosagePage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <section className="mx-auto max-w-3xl px-6 py-14 text-gray-800">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-forest-800">Mission Weight Loss and Wellness</p>
        <h1 className="mb-4 text-3xl font-bold text-gray-950">Tirzepatide Dosage Instructions</h1>
        <p className="mb-2 text-sm text-gray-500">Compounded Tirzepatide Injection</p>
        <p className="mb-8 text-sm text-gray-500">
          Always follow the specific instructions on your prescription label. The information below is
          general guidance. Your provider may adjust your dose or schedule.
        </p>

        <div className="space-y-8 text-sm leading-7 text-gray-700">

          <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 text-gray-800 text-sm">
            <strong>Important:</strong> This medication is prescribed to you specifically. Do not share it
            with anyone else. Call your provider or email service@missionwlw.com before making any changes
            to your dosing schedule.
          </div>

          <section>
            <h2 className="mb-4 text-base font-bold text-gray-950">Dose Schedule</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-forest-800 text-white">
                    <th className="text-left px-4 py-3 font-semibold rounded-tl-lg">Vial Size</th>
                    <th className="text-left px-4 py-3 font-semibold">Weekly Dose</th>
                    <th className="text-left px-4 py-3 font-semibold">Injection Volume</th>
                    <th className="text-left px-4 py-3 font-semibold rounded-tr-lg">Supply</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr className="bg-gray-50">
                    <td className="px-4 py-3 font-medium">20 mg vial</td>
                    <td className="px-4 py-3">2.5 mg</td>
                    <td className="px-4 py-3">12.5 units (0.125 mL)</td>
                    <td className="px-4 py-3">8 weeks</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">40 mg vial</td>
                    <td className="px-4 py-3">5 mg</td>
                    <td className="px-4 py-3">25 units (0.25 mL)</td>
                    <td className="px-4 py-3">8 weeks</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-4 py-3 font-medium">60 mg vial</td>
                    <td className="px-4 py-3">7.5 mg</td>
                    <td className="px-4 py-3">37.5 units (0.375 mL)</td>
                    <td className="px-4 py-3">8 weeks</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Units shown are for a standard U-100 insulin syringe. Your prescription label will confirm the
              exact volume for your dose.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-base font-bold text-gray-950">How to Inject</h2>
            <ol className="list-none space-y-4">
              {[
                { num: "1", title: "Wash your hands", body: "Wash thoroughly with soap and water before handling your medication or supplies." },
                { num: "2", title: "Gather your supplies", body: "You need your medication vial, a new insulin syringe, and an alcohol swab. Your kit includes all necessary supplies." },
                { num: "3", title: "Clean the vial top", body: "Wipe the rubber top of the vial with an alcohol swab and let it air dry for 15 seconds." },
                { num: "4", title: "Draw your dose", body: "Pull back the syringe plunger to the prescribed unit mark, insert the needle into the vial, invert the vial, and draw your dose. Remove any air bubbles by tapping and gently pushing them out." },
                { num: "5", title: "Choose your injection site", body: "Inject subcutaneously (under the skin) into the abdomen, upper thigh, or upper arm. Rotate sites each week to avoid irritation." },
                { num: "6", title: "Clean the injection site", body: "Wipe the injection area with a fresh alcohol swab and let it dry." },
                { num: "7", title: "Inject", body: "Pinch the skin, insert the needle at a 45-degree angle, push the plunger slowly until all medication is injected, then withdraw the needle." },
                { num: "8", title: "Dispose safely", body: "Place the used needle in a sharps container immediately. Never recap a used needle. Do not place in household trash." },
              ].map((step) => (
                <li key={step.num} className="flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-forest-800 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {step.num}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 mb-0.5">{step.title}</p>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="mb-4 text-base font-bold text-gray-950">Storage Instructions</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Store your vial in the refrigerator between 36&deg;F and 46&deg;F (2&deg;C to 8&deg;C).</li>
              <li>Do not freeze. Do not use if the medication has been frozen.</li>
              <li>Keep out of direct sunlight and away from heat sources.</li>
              <li>Once opened, use within 56 days (8 weeks) if stored properly in the refrigerator.</li>
              <li>Do not use if the medication appears cloudy, discolored, or contains particles.</li>
              <li>Keep out of reach of children.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 text-base font-bold text-gray-950">Missed Dose</h2>
            <p className="mb-3">
              If you miss a dose and it has been fewer than 4 days since your scheduled injection day, take
              your dose as soon as you remember, then resume your regular weekly schedule.
            </p>
            <p>
              If more than 4 days have passed, skip the missed dose and inject on your next scheduled day.
              Do not take two doses in one week to make up for a missed dose.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-base font-bold text-gray-950">Common Side Effects</h2>
            <p className="mb-3">
              Tirzepatide may cause the following side effects, especially during the first few weeks or after
              a dose increase:
            </p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Nausea (most common, usually mild and temporary)</li>
              <li>Decreased appetite</li>
              <li>Vomiting or diarrhea</li>
              <li>Constipation</li>
              <li>Fatigue</li>
              <li>Mild injection site reactions (redness, itching)</li>
            </ul>
            <p className="mt-3">
              These typically improve as your body adjusts. Taking your injection with food or at bedtime may
              help reduce nausea. Your provider may slow dose titration if side effects are bothersome.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-base font-bold text-gray-950">When to Contact Your Provider</h2>
            <p className="mb-3">Contact your provider or email service@missionwlw.com if you experience:</p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Severe or persistent nausea, vomiting, or abdominal pain</li>
              <li>Signs of an allergic reaction (rash, swelling, difficulty breathing)</li>
              <li>Vision changes or eye pain</li>
              <li>Rapid heart rate</li>
              <li>Signs of low blood sugar if you are also taking diabetes medication</li>
              <li>Any other side effect that concerns you</li>
            </ul>
            <p className="mt-3 font-medium text-red-700">
              For any medical emergency, call 911 immediately.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-base font-bold text-gray-950">Questions</h2>
            <p>
              For questions about your prescription, dose, or side effects, contact your care team at{" "}
              <a href="mailto:service@missionwlw.com" className="text-forest-800 underline underline-offset-2">
                service@missionwlw.com
              </a>
              . We respond within 24 hours.
            </p>
          </section>

          <div className="border-t border-gray-100 pt-6">
            <Link
              href="/patient"
              className="inline-flex items-center gap-2 text-forest-800 font-semibold text-sm hover:underline"
            >
              View your orders
            </Link>
          </div>

        </div>
      </section>
    </main>
  );
}
