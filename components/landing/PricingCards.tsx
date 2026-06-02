"use client";
import Link from "next/link";
import { FadeUp } from "./FadeUp";

interface Medication {
  name: string;
  category: string;
  price: number;
  unit: string;
  badge?: string;
  bullets: string[];
  highlight: boolean;
}

const MEDS: Medication[] = [
  {
    name: "Semaglutide",
    category: "Generic GLP-1",
    price: 149,
    unit: "/month",
    badge: "Best Value",
    bullets: ["Same active ingredient as Ozempic®", "Weekly self-injection", "Compounded at licensed pharmacy", "Provider-adjusted dosing"],
    highlight: true,
  },
  {
    name: "Tirzepatide",
    category: "Generic GLP-1/GIP Dual",
    price: 249,
    unit: "/month",
    badge: "Most Effective",
    bullets: ["Same active ingredient as Zepbound®", "Dual mechanism (GLP-1 + GIP)", "Up to 21% avg. body weight lost", "Weekly self-injection"],
    highlight: true,
  },
  {
    name: "Ozempic®",
    category: "Brand GLP-1",
    price: 1149,
    unit: "/month",
    bullets: ["Brand-name semaglutide", "Weekly pen injection", "Insurance coverage possible", "FDA-approved for type 2 diabetes"],
    highlight: false,
  },
  {
    name: "Wegovy®",
    category: "Brand GLP-1",
    price: 1579,
    unit: "/month",
    bullets: ["FDA-approved for weight loss", "Higher semaglutide dose", "Weekly auto-injector pen", "Insurance coverage possible"],
    highlight: false,
  },
  {
    name: "Mounjaro®",
    category: "Brand Dual Agonist",
    price: 1249,
    unit: "/month",
    bullets: ["Brand-name tirzepatide", "Dual GLP-1 + GIP action", "FDA-approved for type 2 diabetes", "Weekly injection"],
    highlight: false,
  },
  {
    name: "Zepbound®",
    category: "Brand Dual Agonist",
    price: 1249,
    unit: "/month",
    bullets: ["FDA-approved for weight loss", "Brand-name tirzepatide", "Highest average weight loss", "Weekly auto-injector pen"],
    highlight: false,
  },
];

export function PricingCards({ ctaUrl }: { ctaUrl: string }) {
  return (
    <section id="pricing" className="bg-cream-100 py-16 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp className="text-center mb-12 sm:mb-16">
          <span className="text-[11px] font-bold uppercase tracking-widest text-forest-700 mb-3 block">
            Medication Options
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-forest-800 tracking-tight mb-4">
            Choose Your Program
          </h2>
          <p className="text-gray-600 max-w-xl mx-auto text-base sm:text-lg">
            Your provider recommends the best option for your health profile and goals.
            Most patients start with generic compounded options for maximum value.
          </p>
        </FadeUp>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {MEDS.map((m, i) => (
            <FadeUp key={m.name} delay={i * 0.07}>
              <div
                className={`rounded-2xl p-6 h-full flex flex-col relative ${
                  m.highlight
                    ? "bg-forest-800 text-white ring-2 ring-forest-700"
                    : "bg-white text-gray-800 border border-gray-100 shadow-sm"
                }`}
              >
                {m.badge && (
                  <span className="absolute top-4 right-4 bg-white text-forest-800 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                    {m.badge}
                  </span>
                )}

                <div className="mb-4">
                  <div className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${m.highlight ? "text-green-300" : "text-forest-700"}`}>
                    {m.category}
                  </div>
                  <h3 className={`text-xl font-bold mb-3 ${m.highlight ? "text-white" : "text-forest-800"}`}>
                    {m.name}
                  </h3>
                  <div className={`flex items-baseline gap-1 ${m.highlight ? "text-white" : "text-forest-800"}`}>
                    <span className="text-3xl font-bold">${m.price.toLocaleString()}</span>
                    <span className={`text-sm ${m.highlight ? "text-white/60" : "text-gray-400"}`}>{m.unit}</span>
                  </div>
                </div>

                <ul className="space-y-2 mb-6 flex-1">
                  {m.bullets.map((b) => (
                    <li key={b} className={`flex items-start gap-2 text-sm ${m.highlight ? "text-white/85" : "text-gray-600"}`}>
                      <span className={`shrink-0 font-bold mt-0.5 ${m.highlight ? "text-green-300" : "text-forest-700"}`}>✓</span>
                      {b}
                    </li>
                  ))}
                </ul>

                <Link
                  href={ctaUrl}
                  className={`block text-center font-bold py-3 rounded-full text-sm transition-all active:scale-[.98] ${
                    m.highlight
                      ? "bg-white text-forest-800 hover:bg-cream-200"
                      : "bg-forest-800 text-white hover:bg-forest-700"
                  }`}
                >
                  Start with {m.name}
                </Link>
              </div>
            </FadeUp>
          ))}
        </div>

        <FadeUp className="mt-10 text-center">
          <p className="text-xs text-gray-400 max-w-xl mx-auto leading-relaxed">
            All pricing is per month for medication only. Consultation fee waived for new patients this month.
            Provider determines the most appropriate medication based on your health assessment.
            Brand medications may vary by pharmacy availability.
          </p>
        </FadeUp>
      </div>
    </section>
  );
}
