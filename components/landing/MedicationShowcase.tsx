"use client";
import Image from "next/image";
import Link from "next/link";
import { FadeUp } from "./FadeUp";

const PRODUCTS = [
  {
    name: "Retatrutide",
    tagline: "GLP-1 / GIP / Glucagon Triple Agonist",
    image: "/retatrutide-vial.jpg",
    imageAlt: "Mission Weight Loss & Wellness — Retatrutide Injection vial",
    badge: "FIRST TO MARKET",
    badgeCls: "bg-amber-400 text-amber-950",
    cardStyle: {
      background: "linear-gradient(145deg, #13100a 0%, #1c1608 60%, #0e0c06 100%)",
    },
    accentCls: "border-amber-400/25 shadow-2xl shadow-amber-400/10",
    taglineCls: "text-amber-400",
    checkCls: "text-amber-400",
    ctaCls: "bg-amber-400 text-amber-950 hover:bg-amber-300 shadow-lg shadow-amber-400/20",
    facts: [
      "Next-generation triple agonist formula",
      "Superior appetite suppression vs GLP-1 alone",
      "Starting at $325 / 8-week supply",
      "All supplies & overnight shipping included",
    ],
  },
  {
    name: "Tirzepatide",
    tagline: "GLP-1 & GIP Dual Agonist",
    image: "/tirzepatide-vial.jpg",
    imageAlt: "Mission Weight Loss & Wellness — Tirzepatide Injection vial",
    badge: "Most Popular",
    badgeCls: "bg-rose-500 text-white",
    cardStyle: {
      background: "linear-gradient(145deg, #0e1118 0%, #0c1020 100%)",
    },
    accentCls: "border-white/8 shadow-xl shadow-black/50",
    taglineCls: "text-white/40",
    checkCls: "text-white/40",
    ctaCls: "border border-white/20 text-white hover:bg-white/10",
    facts: [
      "Up to 22.5% body weight reduction in trials*",
      "Once-weekly subcutaneous injection",
      "Starting at $175 / month",
      "8-week supply — all supplies included",
    ],
  },
  {
    name: "Semaglutide",
    tagline: "GLP-1 Receptor Agonist",
    image: "/semaglutide-vial.jpg",
    imageAlt: "Mission Weight Loss & Wellness — Semaglutide Injection vial",
    badge: "Available",
    badgeCls: "bg-emerald-600 text-white",
    cardStyle: {
      background: "linear-gradient(145deg, #0e1118 0%, #0c1020 100%)",
    },
    accentCls: "border-white/8 shadow-xl shadow-black/50",
    taglineCls: "text-white/40",
    checkCls: "text-white/40",
    ctaCls: "border border-white/20 text-white hover:bg-white/10",
    facts: [
      "Up to 15% body weight reduction in trials*",
      "Once-weekly subcutaneous injection",
      "Provider-determined dosing",
      "8-week supply — all supplies included",
    ],
  },
];

export function MedicationShowcase({ ctaUrl }: { ctaUrl: string }) {
  return (
    <section className="py-20 sm:py-28 overflow-hidden" style={{ background: "#080b10" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp className="text-center mb-14 sm:mb-20">
          <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400 mb-3 block">
            Our Medications
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-4">
            Compounded GLP-1 Medications
          </h2>
          <p className="text-white/50 max-w-xl mx-auto text-base sm:text-lg">
            FDA-regulated compounded medications dispensed by a licensed 503B pharmacy —
            prescription-only, reviewed and approved by your provider.
          </p>
        </FadeUp>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {PRODUCTS.map((p, i) => (
            <FadeUp key={p.name} delay={i * 0.12}>
              <div
                className={`relative rounded-3xl overflow-hidden border flex flex-col h-full ${p.accentCls}`}
                style={p.cardStyle}
              >
                {/* Vial image area */}
                <div className="relative flex items-center justify-center py-12 px-8 min-h-[260px] sm:min-h-[300px]">
                  {/* Ambient glow */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-48 rounded-full opacity-20 blur-3xl bg-white" />
                  </div>
                  <span
                    className={`absolute top-4 left-4 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full ${p.badgeCls}`}
                  >
                    {p.badge}
                  </span>
                  {/* White backing panel so mix-blend-mode:multiply removes JPG white bg */}
                  <div className="relative flex items-center justify-center w-[160px] h-[220px]">
                    <div className="absolute inset-0 rounded-2xl bg-white/95" />
                    <Image
                      src={p.image}
                      alt={p.imageAlt}
                      width={160}
                      height={220}
                      className="relative object-contain"
                      style={{ maxHeight: "220px", width: "auto", mixBlendMode: "multiply" }}
                    />
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 sm:p-8 flex flex-col flex-1">
                  <p className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${p.taglineCls}`}>
                    {p.tagline}
                  </p>
                  <h3 className="text-2xl font-bold text-white mb-5">
                    {p.name} Injection
                  </h3>
                  <ul className="space-y-2.5 mb-7 flex-1">
                    {p.facts.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-white/65">
                        <span className={`shrink-0 font-bold mt-0.5 ${p.checkCls}`}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={ctaUrl}
                    className={`block text-center font-bold py-3.5 rounded-full text-sm transition-all active:scale-[.98] ${p.ctaCls}`}
                  >
                    Start Free Assessment →
                  </Link>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>

        <FadeUp className="mt-8 sm:mt-10 text-center">
          <p className="text-xs text-white/25 max-w-lg mx-auto leading-relaxed">
            *Clinical trial data. Individual results vary. All prescriptions issued by licensed US
            providers after review. Compounded medications are not FDA-approved drug products.
          </p>
        </FadeUp>
      </div>
    </section>
  );
}
