"use client";
import Image from "next/image";
import Link from "next/link";
import { FadeUp } from "./FadeUp";

const DOSES = [
  {
    id: "tirzepatide_20mg_8_week",
    label: "Tirzepatide 20mg",
    strength: "20mg vial",
    weekly: "2.5mg / week",
    price: 349,
    monthly: 175,
    badge: "Most Popular",
    bullets: [
      "8-week supply",
      "Syringes & supplies included",
      "Free overnight shipping",
      "Provider-reviewed prescription",
    ],
    highlight: true,
  },
  {
    id: "tirzepatide_40mg_8_week",
    label: "Tirzepatide 40mg",
    strength: "40mg vial",
    weekly: "5mg / week",
    price: 479,
    monthly: 240,
    badge: "Standard Dose",
    bullets: [
      "8-week supply",
      "Syringes & supplies included",
      "Free overnight shipping",
      "Provider-reviewed prescription",
    ],
    highlight: false,
  },
  {
    id: "tirzepatide_60mg_8_week",
    label: "Tirzepatide 60mg",
    strength: "60mg vial",
    weekly: "7.5mg / week",
    price: 749,
    monthly: 375,
    badge: "Max Dose",
    bullets: [
      "8-week supply",
      "Syringes & supplies included",
      "Free overnight shipping",
      "Provider-reviewed prescription",
    ],
    highlight: false,
  },
];

export function PricingCards({ ctaUrl }: { ctaUrl: string }) {
  return (
    <section id="pricing" className="bg-cream-100 py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp className="text-center mb-12 sm:mb-16">
          <span className="text-[11px] font-bold uppercase tracking-widest text-forest-700 mb-3 block">
            Pricing
          </span>
          <div className="flex justify-center mb-5">
            <Image
              src="/tirzepatide-vial.jpg"
              alt="Mission Tirzepatide vial"
              width={72}
              height={92}
              className="object-contain drop-shadow-xl"
            />
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-forest-800 tracking-tight mb-4">
            Compounded Tirzepatide
          </h2>
          <p className="text-gray-600 max-w-xl mx-auto text-base sm:text-lg">
            8-week prescription with all supplies included. Your provider determines the right
            dose during your consultation.
          </p>
        </FadeUp>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {DOSES.map((d, i) => (
            <FadeUp key={d.id} delay={i * 0.08}>
              <div
                className={`rounded-2xl p-6 h-full flex flex-col ${
                  d.highlight
                    ? "bg-forest-800 text-white ring-2 ring-forest-700"
                    : "bg-white text-gray-800 border border-gray-100 shadow-sm"
                }`}
              >
                <div className="mb-5">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div
                      className={`min-w-0 pt-1 text-[11px] font-bold uppercase tracking-widest ${
                        d.highlight ? "text-rose-300" : "text-forest-700"
                      }`}
                    >
                      {d.weekly}
                    </div>
                    <span
                      className={`shrink-0 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                        d.highlight
                          ? "bg-white text-forest-800"
                          : "bg-forest-800/10 text-forest-800"
                      }`}
                    >
                      {d.badge}
                    </span>
                  </div>
                  <h3
                    className={`text-lg font-bold mb-1 ${
                      d.highlight ? "text-white" : "text-forest-800"
                    }`}
                  >
                    {d.label}
                  </h3>
                  <div
                    className={`text-xs mb-4 ${
                      d.highlight ? "text-white/50" : "text-gray-400"
                    }`}
                  >
                    {d.strength}
                  </div>
                  <div
                    className={`flex items-baseline gap-1 ${
                      d.highlight ? "text-white" : "text-forest-800"
                    }`}
                  >
                    <span className="text-3xl font-bold">${d.monthly}</span>
                    <span
                      className={`text-sm ${
                        d.highlight ? "text-white/60" : "text-gray-400"
                      }`}
                    >
                      / month
                    </span>
                  </div>
                  <div
                    className={`text-xs mt-1 ${
                      d.highlight ? "text-rose-300" : "text-forest-700"
                    }`}
                  >
                    ~${d.price} / 8-week supply
                  </div>
                </div>

                <ul className="space-y-2 mb-6 flex-1">
                  {d.bullets.map((b) => (
                    <li
                      key={b}
                      className={`flex items-start gap-2 text-sm ${
                        d.highlight ? "text-white/85" : "text-gray-600"
                      }`}
                    >
                      <span
                        className={`shrink-0 font-bold mt-0.5 ${
                          d.highlight ? "text-rose-300" : "text-forest-700"
                        }`}
                      >
                        ✓
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>

                <Link
                  href={ctaUrl}
                  className={`block text-center font-bold py-3 rounded-full text-sm transition-all active:scale-[.98] ${
                    d.highlight
                      ? "bg-white text-forest-800 hover:bg-cream-200"
                      : "bg-forest-800 text-white hover:bg-forest-700"
                  }`}
                >
                  Start with {d.strength}
                </Link>
              </div>
            </FadeUp>
          ))}
        </div>

        <FadeUp className="mt-8 text-center">
          <p className="text-xs text-gray-400 max-w-xl mx-auto leading-relaxed">
            Consultation fee waived for new patients this month. Final dose is determined by your
            licensed provider. Compounded Tirzepatide is prepared by a licensed 503B pharmacy.
          </p>
        </FadeUp>
      </div>
    </section>
  );
}
