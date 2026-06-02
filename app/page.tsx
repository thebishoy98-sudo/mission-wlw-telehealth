"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle,
  Shield,
  Truck,
  Star,
  Users,
  Award,
  ClipboardList,
  Stethoscope,
  Package,
  Calendar,
  Wallet,
  MessageCircle,
  ChevronDown,
} from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";

// ─── UTM passthrough ─────────────────────────────────────────
const UTM_KEYS = [
  "utm_source", "utm_medium", "utm_campaign",
  "utm_content", "utm_term", "ref", "aff",
] as const;

function useCta(base = "/start/info") {
  const sp = useSearchParams();
  const p = new URLSearchParams();
  UTM_KEYS.forEach((k) => { const v = sp.get(k); if (v) p.set(k, v); });
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

// ─── Reusable CTA button ─────────────────────────────────────
function CtaButton({
  url, size = "md", full = false, light = false, children,
}: {
  url: string; size?: "sm" | "md" | "lg"; full?: boolean; light?: boolean; children: React.ReactNode;
}) {
  const base = "inline-flex items-center justify-center gap-2 font-bold transition-all focus-visible:outline-2 focus-visible:outline-rose-400 rounded-2xl";
  const sz = size === "lg" ? "px-10 py-5 text-lg" : size === "sm" ? "px-5 py-2.5 text-sm" : "px-7 py-3.5 text-sm";
  const color = light
    ? "bg-white text-red-700 hover:bg-red-50 shadow-lg"
    : "bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white shadow-lg shadow-red-900/25";
  return (
    <Link href={url} className={full ? "block w-full" : ""}>
      <span className={`${base} ${sz} ${color} ${full ? "w-full" : ""}`}>
        {children}
        <ArrowRight className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      </span>
    </Link>
  );
}

// ─── Star row ────────────────────────────────────────────────
function Stars({ n = 5 }: { n?: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${n} out of 5 stars`}>
      {Array.from({ length: n }).map((_, i) => (
        <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" aria-hidden="true" />
      ))}
    </div>
  );
}

// ─── Page data ───────────────────────────────────────────────
const STEPS = [
  {
    icon: ClipboardList,
    label: "STEP 1",
    title: "Answer a quick health quiz",
    body: "Takes about 5 minutes. Your answers help our licensed providers determine if treatment is right for you.",
  },
  {
    icon: Stethoscope,
    label: "STEP 2",
    title: "Provider reviews your intake",
    body: "A US-licensed provider reviews your information. Medication is only dispensed if clinically appropriate — never automatically.",
  },
  {
    icon: Package,
    label: "STEP 3",
    title: "Delivered to your door",
    body: "Your prescription ships free via overnight delivery in cold-pack packaging. Tracking number sent by text.",
  },
];

const BENEFITS = [
  {
    icon: Stethoscope,
    title: "Doctor-supervised care",
    body: "Every treatment plan is reviewed by a US-licensed provider before your order is filled. Your safety comes first.",
  },
  {
    icon: Calendar,
    title: "Fully online",
    body: "No office visits, no waiting rooms. Complete everything from your phone, on your schedule.",
  },
  {
    icon: Wallet,
    title: "Transparent pricing",
    body: "All-inclusive — medication, supplies, and free overnight shipping. No hidden fees, no enrollment charges.",
  },
  {
    icon: MessageCircle,
    title: "Ongoing support",
    body: "Reach our care team by message whenever you have questions. We're with you every step of the way.",
  },
];

const PRICING = [
  {
    dose: "Tirzepatide 20mg",
    price: 349,
    note: "8-Week Supply",
    highlight: "Best for starters",
    popular: false,
    includes: ["Compound Tirzepatide", "Syringes & supplies", "Cold-pack packaging", "Free overnight delivery", "Licensed provider review"],
  },
  {
    dose: "Tirzepatide 40mg",
    price: 479,
    note: "8-Week Supply",
    highlight: "Most popular",
    popular: true,
    includes: ["Compound Tirzepatide", "Syringes & supplies", "Cold-pack packaging", "Free overnight delivery", "Licensed provider review"],
  },
  {
    dose: "Tirzepatide 60mg",
    price: 799,
    note: "8-Week Supply",
    highlight: "Maximum strength",
    popular: false,
    includes: ["Compound Tirzepatide", "Syringes & supplies", "Cold-pack packaging", "Free overnight delivery", "Licensed provider review"],
  },
];

const TESTIMONIALS = [
  {
    name: "[REPLACE — Real Patient Name]",
    location: "[State]",
    quote: "[REPLACE WITH REAL, CONSENTED TESTIMONIAL — paste actual patient quote here after obtaining written consent.]",
    result: "[−X lbs] in [X weeks]*",
    stars: 5,
    initial: "P",
  },
  {
    name: "[REPLACE — Real Patient Name]",
    location: "[State]",
    quote: "[REPLACE WITH REAL, CONSENTED TESTIMONIAL — paste actual patient quote here after obtaining written consent.]",
    result: "[−X lbs] in [X weeks]*",
    stars: 5,
    initial: "P",
  },
  {
    name: "[REPLACE — Real Patient Name]",
    location: "[State]",
    quote: "[REPLACE WITH REAL, CONSENTED TESTIMONIAL — paste actual patient quote here after obtaining written consent.]",
    result: "[−X lbs] in [X weeks]*",
    stars: 5,
    initial: "P",
  },
];

const FAQS = [
  {
    q: "Who is eligible for GLP-1 treatment?",
    a: "Generally, adults 18+ with a BMI of 27 or higher, or a BMI of 25+ with at least one weight-related health condition may be considered. Final eligibility is determined by a licensed provider after reviewing your individual health intake.",
  },
  {
    q: "Does completing checkout guarantee a prescription?",
    a: "No. Purchasing does not automatically result in a prescription. A US-licensed provider reviews every intake individually and medication is only prescribed and dispensed if clinically appropriate for you.",
  },
  {
    q: "How does the prescription process work?",
    a: "After you complete your health intake, a licensed provider reviews your information. If approved, your prescription is sent directly to our FDA-regulated compounding pharmacy and ships to your door — no extra steps.",
  },
  {
    q: "What are the possible side effects?",
    a: "GLP-1 medications may cause nausea, vomiting, diarrhea, constipation, and injection-site reactions. Rare but serious risks include pancreatitis and gallbladder disease. GLP-1s are contraindicated in patients with a personal or family history of medullary thyroid carcinoma or MEN 2. See full safety information in the footer.",
  },
  {
    q: "How fast does shipping arrive?",
    a: "Approved orders ship free via overnight delivery in cold-pack packaging to preserve medication integrity. You'll receive a tracking number by text the moment your order ships.",
  },
  {
    q: "Can I cancel or pause my plan?",
    a: "Yes. Contact our care team at service@missionwlw.com at any time to pause, adjust, or cancel. There are no long-term contracts or cancellation fees.",
  },
  {
    q: "What does the price include?",
    a: "Everything: compound medication, syringes and supplies, cold-pack packaging, and free overnight shipping. No enrollment fees, no subscription traps — you pay once per prescription period.",
  },
];

// ─── Main landing page ───────────────────────────────────────
function LandingPage() {
  const ctaUrl = useCta();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-white pb-20 sm:pb-0">
      <LandingHeader ctaUrl={ctaUrl} />

      {/* ── 1. HERO ─────────────────────────────────────────── */}
      <section className="bg-[#0f1225] text-white overflow-hidden relative" aria-label="Hero">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_#D62B3C_0%,_transparent_55%)] opacity-25 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_#8B1A4A_0%,_transparent_55%)] opacity-20 pointer-events-none" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 relative">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              {/* Social proof pill */}
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-4 py-1.5 text-sm text-white/80 font-medium mb-6">
                <Stars n={5} />
                <span>
                  Rated <strong className="text-white">[REPLACE: X.X]/5</strong> by{" "}
                  <strong className="text-white">[REPLACE: X,XXX]+</strong> patients
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl font-bold leading-[1.1] tracking-tight mb-5">
                Medically supported<br className="hidden sm:block" /> weight loss —{" "}
                <span className="bg-gradient-to-r from-red-400 to-rose-400 bg-clip-text text-transparent">
                  from home.*
                </span>
              </h1>

              <p className="text-lg text-slate-300 leading-relaxed mb-2 max-w-lg">
                GLP-1 therapy with US-licensed providers, an FDA-regulated compounding pharmacy, and free overnight delivery. No office visit, ever.
              </p>
              <p className="text-xs text-slate-600 mb-8">
                *Results vary. Medication requires provider review and is only dispensed if clinically appropriate.
              </p>

              <div className="flex items-baseline gap-3 mb-8">
                <span className="text-sm text-slate-500">Treatment plans starting at</span>
                <span className="text-3xl font-bold text-white">$349</span>
                <span className="text-sm text-slate-500">· includes shipping</span>
              </div>

              <CtaButton url={ctaUrl} size="lg">Check My Eligibility — Free</CtaButton>

              {/* Microbadges */}
              <div className="flex flex-wrap gap-x-5 gap-y-2.5 mt-7 text-sm text-slate-400">
                {[
                  "Free overnight shipping",
                  "No enrollment fees",
                  "No insurance needed",
                ].map((label) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-rose-400 flex-shrink-0" aria-hidden="true" />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Hero image slot */}
            <div className="hidden md:flex items-center justify-center">
              {/*
                PLACEHOLDER: Replace this div with an <Image> component.
                Recommended: lifestyle photo of a woman, warm/natural tones, 600×800 px.
                Example:
                  <Image src="/hero-photo.jpg" alt="Woman feeling confident after weight loss" width={480} height={560} className="rounded-3xl object-cover w-full max-w-sm" />
              */}
              <div className="w-full max-w-sm aspect-[3/4] bg-white/5 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-3 text-slate-600 p-6">
                <Users className="w-10 h-10 opacity-30" aria-hidden="true" />
                <p className="text-sm text-center leading-relaxed opacity-50">
                  [REPLACE WITH HERO IMAGE]<br />
                  Recommended: lifestyle photo, 600×800 px
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. TRUST BAR ────────────────────────────────────── */}
      <section className="bg-white border-b border-gray-100" aria-label="Trust signals">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-8">
            {[
              { icon: Users,  stat: "[X,XXX+]",  label: "Patients served",     note: "[REPLACE WITH REAL DATA]" },
              { icon: Star,   stat: "[X.X / 5]", label: "Average rating",      note: "[REPLACE WITH REAL DATA]" },
              { icon: Shield, stat: "FDA",        label: "Regulated pharmacy",  note: "Verified compounding" },
              { icon: Award,  stat: "Licensed",   label: "US providers",        note: "All active states" },
            ].map(({ icon: Icon, stat, label, note }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-rose-600" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 leading-tight">{stat}</p>
                  <p className="text-xs text-gray-700 leading-snug">{label}</p>
                  <p className="text-xs text-gray-400">{note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. HOW IT WORKS ─────────────────────────────────── */}
      <section id="how-it-works" className="py-20 md:py-28 bg-gray-50" aria-labelledby="hiw-heading">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-rose-600 font-semibold text-sm uppercase tracking-widest mb-3">Simple Process</p>
            <h2 id="hiw-heading" className="text-3xl sm:text-4xl font-bold text-gray-900">
              Three steps to get started
            </h2>
            <p className="text-gray-500 mt-3 max-w-md mx-auto">
              Completely online. No waiting room, no office visit — ever.
            </p>
          </div>

          <div className="relative">
            <div
              className="hidden md:block absolute top-12 left-[16.5%] right-[16.5%] h-px bg-gradient-to-r from-transparent via-rose-300 to-transparent"
              aria-hidden="true"
            />
            <ol className="grid sm:grid-cols-3 gap-8 md:gap-10 list-none p-0 m-0">
              {STEPS.map(({ icon: Icon, label, title, body }) => (
                <li key={label} className="flex flex-col items-center text-center">
                  <div className="relative z-10 w-24 h-24 bg-white border-2 border-rose-100 hover:border-rose-400 rounded-2xl flex flex-col items-center justify-center mb-5 shadow-sm transition-colors">
                    <span className="text-xs font-bold text-rose-400 mb-1">{label}</span>
                    <Icon className="w-7 h-7 text-rose-600" aria-hidden="true" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{body}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="text-center mt-12">
            <CtaButton url={ctaUrl}>Start My Free Intake</CtaButton>
          </div>
        </div>
      </section>

      {/* ── 4. BENEFITS ─────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-white" aria-labelledby="benefits-heading">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-rose-600 font-semibold text-sm uppercase tracking-widest mb-3">Why Mission</p>
            <h2 id="benefits-heading" className="text-3xl sm:text-4xl font-bold text-gray-900">
              Care built around your life
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {BENEFITS.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="bg-gray-50 rounded-2xl p-6 border border-gray-100 hover:border-rose-200 hover:shadow-md transition-all"
              >
                <div className="w-11 h-11 bg-gradient-to-br from-red-600 to-rose-700 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-white" aria-hidden="true" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. PRICING CARD ─────────────────────────────────── */}
      <section id="pricing" className="py-20 md:py-28 bg-gray-50" aria-labelledby="pricing-heading">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-rose-600 font-semibold text-sm uppercase tracking-widest mb-3">Pricing</p>
            <h2 id="pricing-heading" className="text-3xl sm:text-4xl font-bold text-gray-900">
              Transparent, all-inclusive pricing
            </h2>
            <p className="text-gray-500 mt-3">
              Every plan includes medication, syringes &amp; supplies, cold-pack packaging, and free overnight shipping.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 items-start">
            {PRICING.map((plan) => (
              <div
                key={plan.dose}
                className={`relative bg-white rounded-3xl border overflow-hidden transition-all ${
                  plan.popular
                    ? "border-rose-300 shadow-2xl shadow-rose-100 sm:scale-105 sm:-mx-1"
                    : "border-gray-200 hover:border-rose-200 hover:shadow-lg"
                }`}
              >
                {plan.popular && (
                  <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white text-xs font-bold text-center py-2.5 tracking-widest uppercase">
                    Most Popular
                  </div>
                )}
                <div className="p-6 sm:p-7">
                  <p className="text-xs font-semibold text-rose-600 uppercase tracking-widest mb-1">{plan.highlight}</p>
                  <h3 className="text-lg font-bold text-gray-900">{plan.dose}</h3>
                  <p className="text-xs text-gray-400 mb-5">{plan.note}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                    <span className="text-gray-400 text-sm ml-1">one-time</span>
                  </div>
                  <ul className="space-y-2 mb-7 text-sm text-gray-600">
                    {plan.includes.map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-rose-500 flex-shrink-0" aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <CtaButton url={ctaUrl} full light={!plan.popular}>
                    {plan.popular ? "Check Eligibility" : "Get Started"}
                  </CtaButton>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-gray-400 mt-8">
            Subject to provider review and eligibility. Medication is dispensed only after a licensed provider approves your intake.
            Results vary.* No hidden fees.
          </p>
        </div>
      </section>

      {/* ── 6. TESTIMONIALS ─────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-white" aria-labelledby="testimonials-heading">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-4">
            <p className="text-rose-600 font-semibold text-sm uppercase tracking-widest mb-3">Patient Stories</p>
            <h2 id="testimonials-heading" className="text-3xl sm:text-4xl font-bold text-gray-900">
              Hear from our patients
            </h2>
          </div>
          <p className="text-center text-xs text-gray-400 mb-12">
            [REPLACE ALL TESTIMONIALS WITH REAL, CONSENTED PATIENT STORIES. Individual results vary.*]
          </p>

          <div className="grid sm:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <figure
                key={i}
                className="bg-gray-50 rounded-2xl p-6 border border-gray-100 flex flex-col"
              >
                <div className="inline-flex items-center bg-rose-50 border border-rose-100 rounded-full px-3 py-1.5 mb-4 self-start">
                  <span className="text-rose-600 font-bold text-sm">{t.result}</span>
                </div>
                <Stars n={t.stars} />
                <blockquote className="text-gray-700 text-sm leading-relaxed my-4 flex-1">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="flex items-center gap-3 mt-auto">
                  <div
                    className="w-9 h-9 bg-gradient-to-br from-red-400 to-rose-600 rounded-full flex items-center justify-center flex-shrink-0"
                    aria-hidden="true"
                  >
                    {/* PLACEHOLDER: replace span with <Image> of consented patient photo */}
                    <span className="text-white font-bold text-sm">{t.initial}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.location}</p>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. ELIGIBILITY CTA ──────────────────────────────── */}
      <section
        className="bg-gradient-to-r from-red-600 to-rose-700"
        aria-labelledby="cta-heading"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
          <h2 id="cta-heading" className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to start your journey?
          </h2>
          <p className="text-red-100 mb-8 max-w-lg mx-auto text-base leading-relaxed">
            GLP-1 therapy with licensed providers, all-inclusive pricing, and overnight delivery — completely from home.
          </p>
          <CtaButton url={ctaUrl} size="lg" light>
            Check My Eligibility — Free
          </CtaButton>
          <p className="text-red-200 text-xs mt-5 max-w-md mx-auto">
            Medication requires a provider consultation and is only dispensed if a licensed clinician deems it clinically appropriate.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Truck className="w-4 h-4 text-red-300" aria-hidden="true" />
            <span className="text-red-200 text-sm">Free overnight delivery · No office visit required</span>
          </div>
        </div>
      </section>

      {/* ── 8. FAQ ──────────────────────────────────────────── */}
      <section id="faq" className="py-20 md:py-28 bg-white" aria-labelledby="faq-heading">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-rose-600 font-semibold text-sm uppercase tracking-widest mb-3">FAQ</p>
            <h2 id="faq-heading" className="text-3xl sm:text-4xl font-bold text-gray-900">Common questions</h2>
          </div>

          <dl className="divide-y divide-gray-100">
            {FAQS.map((faq, i) => (
              <div key={i} className="py-5">
                <dt>
                  <button
                    type="button"
                    aria-expanded={open === i}
                    aria-controls={`faq-answer-${i}`}
                    onClick={() => setOpen(open === i ? null : i)}
                    className="w-full flex items-center justify-between text-left gap-4 group rounded-lg"
                  >
                    <span className="font-semibold text-gray-900 text-sm sm:text-base group-hover:text-rose-700 transition-colors">
                      {faq.q}
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 flex-shrink-0 text-gray-400 transition-transform duration-200 ${
                        open === i ? "rotate-180 text-rose-600" : "group-hover:text-rose-500"
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                </dt>
                <dd
                  id={`faq-answer-${i}`}
                  hidden={open !== i}
                  className="mt-4 text-gray-500 text-sm leading-relaxed pr-8"
                >
                  {faq.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 9. FOOTER ───────────────────────────────────────── */}
      <footer className="bg-[#0f1225]">
        {/* Contact strip */}
        <div className="border-b border-white/5 py-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-slate-500 text-sm mb-2">Questions? Our team responds within 24 hours.</p>
            <a
              href="mailto:service@missionwlw.com"
              className="text-rose-400 hover:text-rose-300 font-semibold text-lg transition-colors"
            >
              service@missionwlw.com
            </a>
          </div>
        </div>

        {/* Links row */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-gray-600 text-sm">
            &copy; 2026 Mission Wellness &amp; Weight Loss. All rights reserved.
          </p>
          <nav aria-label="Footer" className="flex items-center gap-5 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
            <a href="mailto:service@missionwlw.com" className="hover:text-white transition-colors">Contact</a>
          </nav>
        </div>

        {/* Important Safety Information */}
        <div className="border-t border-white/5 py-6">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mb-3">
              Important Safety Information
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong className="text-slate-500">Not medical advice.</strong> This website is for informational
              purposes only and does not constitute medical advice, diagnosis, or treatment. A prescription is
              required; medication is dispensed only after a licensed provider reviews your intake and determines
              treatment is clinically appropriate — completing checkout does not guarantee a prescription.{" "}
              <strong className="text-slate-500">Possible side effects</strong> include nausea, vomiting,
              diarrhea, constipation, and injection-site reactions. Rare but serious risks include pancreatitis
              and gallbladder disease. GLP-1 medications are contraindicated in patients with a personal or
              family history of medullary thyroid carcinoma or Multiple Endocrine Neoplasia syndrome type 2
              (MEN 2), and are not appropriate during pregnancy or breastfeeding. Consult a licensed physician
              before starting any new treatment.{" "}
              <strong className="text-slate-500">*Results vary.</strong> Individual outcomes depend on factors
              including diet, physical activity, adherence, and overall health status.{" "}
              <strong className="text-slate-500">
                [PLACEHOLDER — have licensed legal counsel review and finalize this disclosure before launch.]
              </strong>
            </p>
          </div>
        </div>
      </footer>

      {/* ── STICKY MOBILE CTA ───────────────────────────────── */}
      <div
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-gray-200 px-4 py-3 shadow-2xl"
        aria-hidden="false"
      >
        <Link href={ctaUrl}>
          <span className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-red-600 to-rose-700 text-white font-bold py-4 rounded-2xl text-base">
            Check My Eligibility — Free
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </span>
        </Link>
        <p className="text-center text-xs text-gray-400 mt-1.5">Starting at $349 · Free overnight shipping</p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <LandingPage />
    </Suspense>
  );
}
