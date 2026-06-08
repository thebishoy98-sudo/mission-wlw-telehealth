"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FadeUp } from "./FadeUp";

const PRODUCTS = [
  {
    id: "product_retatrutide",
    label: "Retatrutide",
    tagline: "Triple GLP-1 Agonist",
    img: "/retatrutide-vial.jpg",
    badge: "First to Market",
    fromMonthly: 250,
    fromSupply: 499,
    highlight: true,
    bullets: [
      "Newest triple-agonist GLP-1",
      "Syringes & supplies included",
      "Free overnight shipping",
      "Provider-reviewed prescription",
    ],
  },
  {
    id: "product_tirzepatide",
    label: "Tirzepatide",
    tagline: "Dual GLP-1 / GIP Agonist",
    img: "/tirzepatide-vial.jpg",
    badge: "Most Popular",
    fromMonthly: 175,
    fromSupply: 349,
    highlight: false,
    bullets: [
      "Proven weight loss results",
      "Syringes & supplies included",
      "Free overnight shipping",
      "Provider-reviewed prescription",
    ],
  },
  {
    id: "product_semaglutide",
    label: "Semaglutide",
    tagline: "GLP-1 Receptor Agonist",
    img: "/semaglutide-vial.jpg",
    badge: "Available",
    fromMonthly: 149,
    fromSupply: 299,
    highlight: false,
    bullets: [
      "Well-established GLP-1 therapy",
      "Syringes & supplies included",
      "Free overnight shipping",
      "Provider-reviewed prescription",
    ],
  },
];

function productCtaUrl(base: string, productId: string) {
  try {
    const url = new URL(base, "http://x");
    url.searchParams.set("productId", productId);
    return url.pathname + (url.search ? url.search : "");
  } catch {
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}productId=${productId}`;
  }
}

export function PricingCards({ ctaUrl }: { ctaUrl: string }) {
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    const PROMO_EXPIRY_KEY = "promo_expiry_ts";
    let expiry: number;
    try {
      const stored = sessionStorage.getItem(PROMO_EXPIRY_KEY);
      expiry = stored && Number(stored) > Date.now()
        ? Number(stored)
        : Date.now() + 24 * 60 * 60 * 1000;
      if (!stored || Number(stored) <= Date.now()) {
        sessionStorage.setItem(PROMO_EXPIRY_KEY, String(expiry));
      }
    } catch {
      expiry = Date.now() + 24 * 60 * 60 * 1000;
    }
    const fmt = (ms: number) => {
      if (ms <= 0) return "00:00:00";
      const s = Math.floor(ms / 1000);
      return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
        .map((n) => String(n).padStart(2, "0")).join(":");
    };
    const tick = () => setCountdown(fmt(expiry - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section id="pricing" className="bg-cream-100 py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Retatrutide launch banner */}
        <FadeUp className="mb-10">
          <div
            className="relative rounded-2xl overflow-hidden px-5 py-5 sm:px-8 sm:py-6 flex flex-col sm:flex-row sm:items-center gap-4"
            style={{ background: "linear-gradient(135deg, #011a38 0%, #022859 60%, #01152e 100%)" }}
          >
            <div className="absolute top-0 right-0 w-64 h-full bg-red-400/5 blur-3xl pointer-events-none" />
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="shrink-0 bg-white/8 rounded-xl p-1.5 border border-red-400/20">
                <Image
                  src="/retatrutide-vial.jpg"
                  alt="Retatrutide vial"
                  width={36}
                  height={56}
                  className="object-contain"
                  style={{ mixBlendMode: "normal" }}
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] bg-red-400 text-forest-900 px-2 py-0.5 rounded-full">
                    Now Available
                  </span>
                </div>
                <p className="text-white font-bold text-sm sm:text-base">
                  Retatrutide - Pharmacy-Grade, First to Market
                </p>
                <p className="text-white/45 text-xs mt-0.5 leading-relaxed">
                  Triple-agonist GLP-1 · Licensed 503B compounding pharmacy · Ships today
                </p>
              </div>
            </div>
            <Link
              href={productCtaUrl(ctaUrl, "product_retatrutide")}
              className="w-full sm:w-auto text-center shrink-0 bg-red-400 hover:bg-red-300 text-forest-900 font-bold px-5 py-2.5 rounded-full text-sm transition-all active:scale-[.98] shadow-lg shadow-red-400/15"
            >
              Order Now
            </Link>
          </div>
        </FadeUp>

        <FadeUp className="text-center mb-12 sm:mb-16">
          <span className="text-[11px] font-bold uppercase tracking-widest text-forest-700 mb-3 block">
            Pricing
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-forest-800 tracking-tight mb-4">
            GLP-1 Weight Loss Programs
          </h2>
          <p className="text-gray-600 max-w-xl mx-auto text-base sm:text-lg">
            8-week prescription with all supplies included. Your provider selects the right
            medication and dose during your consultation.
          </p>
        </FadeUp>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {PRODUCTS.map((p, i) => (
            <FadeUp key={p.id} delay={i * 0.08}>
              <div
                className={`rounded-2xl p-6 h-full flex flex-col ${
                  p.highlight
                    ? "bg-forest-800 text-white ring-2 ring-red-400/40"
                    : "bg-white text-gray-800 border border-gray-100 shadow-sm"
                }`}
              >
                <div className="mb-5">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div
                      className={`min-w-0 pt-1 text-[11px] font-bold uppercase tracking-widest ${
                        p.highlight ? "text-red-400" : "text-forest-700"
                      }`}
                    >
                      {p.tagline}
                    </div>
                    <span
                      className={`shrink-0 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                        p.highlight
                          ? "bg-red-400 text-forest-900"
                          : "bg-forest-800/10 text-forest-800"
                      }`}
                    >
                      {p.badge}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`shrink-0 rounded-xl p-1 ${p.highlight ? "bg-white/10" : "bg-gray-50"}`}>
                      <Image
                        src={p.img}
                        alt={`${p.label} vial`}
                        width={32}
                        height={52}
                        className="object-contain"
                        style={{ maxHeight: "52px", width: "auto" }}
                      />
                    </div>
                    <h3
                      className={`text-xl font-bold ${
                        p.highlight ? "text-red-400" : "text-forest-800"
                      }`}
                    >
                      {p.label}
                    </h3>
                  </div>
                  <div
                    className={`flex items-baseline gap-1 ${
                      p.highlight ? "text-white" : "text-forest-800"
                    }`}
                  >
                    <span className="text-3xl font-bold">${p.fromMonthly}</span>
                    <span
                      className={`text-sm ${
                        p.highlight ? "text-white/60" : "text-gray-400"
                      }`}
                    >
                      / month
                    </span>
                  </div>
                  <div
                    className={`text-xs mt-1 ${
                      p.highlight ? "text-red-400/80" : "text-forest-700"
                    }`}
                  >
                    from ${p.fromSupply} / 8-week supply
                  </div>
                </div>

                <ul className="space-y-2 mb-6 flex-1">
                  {p.bullets.map((b) => (
                    <li
                      key={b}
                      className={`flex items-start gap-2 text-sm ${
                        p.highlight ? "text-white/85" : "text-gray-600"
                      }`}
                    >
                      <span
                        className={`shrink-0 font-bold mt-0.5 ${
                          p.highlight ? "text-red-400" : "text-forest-700"
                        }`}
                      >
                        &#10003;
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>

                <Link
                  href={productCtaUrl(ctaUrl, p.id)}
                  className={`block text-center font-bold py-3 rounded-full text-sm transition-all active:scale-[.98] ${
                    p.highlight
                      ? "bg-red-400 text-forest-900 hover:bg-red-300 shadow-lg shadow-red-400/15"
                      : "bg-forest-800 text-white hover:bg-forest-700"
                  }`}
                >
                  Get Started
                </Link>
              </div>
            </FadeUp>
          ))}
        </div>

        <FadeUp className="mt-8 text-center">
          {countdown && (
            <div className="inline-flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-xs font-semibold px-4 py-2 rounded-full mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Consultation fee waiver expires in{" "}
              <span className="font-mono">{countdown}</span>
            </div>
          )}
          <p className="text-xs text-gray-400 max-w-xl mx-auto leading-relaxed">
            Consultation fee waived for new patients this month. Final medication and dose
            are determined by your licensed provider. All medications are compounded by a
            licensed 503B pharmacy.
          </p>
        </FadeUp>
      </div>
    </section>
  );
}
