"use client";
import Image from "next/image";
import Link from "next/link";
import { FadeUp } from "./FadeUp";

const PRODUCTS = [
  {
    name: "Tirzepatide",
    tagline: "GLP-1 & GIP Dual Agonist",
    image: "/tirzepatide-vial.jpg",
    imageAlt: "Mission Weight Loss & Wellness — Tirzepatide Injection vial",
    badge: "Most Popular",
    badgeBg: "bg-rose-500",
    facts: [
      "Up to 22.5% body weight reduction in trials*",
      "Once-weekly subcutaneous injection",
      "Starting at $175 / month",
      "8-week supply — all supplies included",
    ],
    featured: true,
  },
  {
    name: "Semaglutide",
    tagline: "GLP-1 Receptor Agonist",
    image: "/semaglutide-vial.jpg",
    imageAlt: "Mission Weight Loss & Wellness — Semaglutide Injection vial",
    badge: "Available",
    badgeBg: "bg-forest-700",
    facts: [
      "Up to 15% body weight reduction in trials*",
      "Once-weekly subcutaneous injection",
      "Provider-determined dosing",
      "8-week supply — all supplies included",
    ],
    featured: false,
  },
  {
    name: "Retatrutide",
    tagline: "GLP-1 / GIP / Glucagon Triple Agonist",
    image: "/retatrutide-vial.jpg",
    imageAlt: "Mission Weight Loss & Wellness — Retatrutide Injection vial",
    badge: "New",
    badgeBg: "bg-indigo-600",
    facts: [
      "Next-generation triple agonist",
      "Enhanced appetite suppression",
      "Starting at $325 / 8-week supply",
      "8-week supply — all supplies included",
    ],
    featured: false,
  },
];

export function MedicationShowcase({ ctaUrl }: { ctaUrl: string }) {
  return (
    <section className="bg-white py-16 sm:py-24 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp className="text-center mb-12 sm:mb-16">
          <span className="text-[11px] font-bold uppercase tracking-widest text-forest-700 mb-3 block">
            Our Medications
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-forest-800 tracking-tight mb-4">
            Compounded GLP-1 Medications
          </h2>
          <p className="text-gray-600 max-w-xl mx-auto text-base sm:text-lg">
            FDA-regulated compounded medications dispensed by a licensed 503B pharmacy —
            prescription-only, reviewed and approved by your provider.
          </p>
        </FadeUp>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {PRODUCTS.map((p, i) => (
            <FadeUp key={p.name} delay={i * 0.12}>
              <div className="bg-cream-100 rounded-3xl overflow-hidden border border-gray-100 shadow-sm flex flex-col h-full">
                {/* Vial image area */}
                <div className="relative flex items-center justify-center bg-gradient-to-b from-cream-200/80 to-cream-100 py-12 px-8 min-h-[260px] sm:min-h-[300px]">
                  <span
                    className={`absolute top-4 left-4 text-[10px] font-bold uppercase tracking-wider text-white px-3 py-1.5 rounded-full ${p.badgeBg}`}
                  >
                    {p.badge}
                  </span>
                  <Image
                    src={p.image}
                    alt={p.imageAlt}
                    width={180}
                    height={240}
                    className="object-contain drop-shadow-2xl"
                    style={{ maxHeight: "240px", width: "auto" }}
                  />
                </div>

                {/* Content */}
                <div className="p-6 sm:p-8 flex flex-col flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-forest-700 mb-1">
                    {p.tagline}
                  </p>
                  <h3 className="text-2xl font-bold text-forest-800 mb-5">
                    {p.name} Injection
                  </h3>
                  <ul className="space-y-2.5 mb-7 flex-1">
                    {p.facts.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-gray-600">
                        <span className="shrink-0 text-forest-700 font-bold mt-0.5">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={ctaUrl}
                    className={`block text-center font-bold py-3.5 rounded-full text-sm transition-all active:scale-[.98] ${
                      p.featured
                        ? "bg-forest-800 text-white hover:bg-forest-700 shadow-lg shadow-forest-800/15"
                        : "border-2 border-forest-800 text-forest-800 hover:bg-forest-800/5"
                    }`}
                  >
                    Start Free Assessment →
                  </Link>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>

        <FadeUp className="mt-8 sm:mt-10 text-center">
          <p className="text-xs text-gray-400 max-w-lg mx-auto leading-relaxed">
            *Clinical trial data. Individual results vary. All prescriptions issued by licensed US
            providers after review. Compounded medications are not FDA-approved drug products.
          </p>
        </FadeUp>
      </div>
    </section>
  );
}
