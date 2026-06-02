"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import * as Types from "@/types";
import { formatCurrency } from "@/lib/utils";
import {
  ArrowRight, CheckCircle, Shield, Truck, Star,
  Users, Instagram, Facebook, ClipboardList,
  Stethoscope, Package, Smile, Award,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";

export default function Home() {
  const [products, setProducts] = useState<Types.Product[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/products", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setProducts(payload.products ?? []))
      .catch(() => setProducts([]));
  }, []);

  const steps = [
    {
      icon: ClipboardList,
      title: "Complete your intake",
      body: "Answer a short health questionnaire online. Your clinical consent is prepared only after payment.",
    },
    {
      icon: Stethoscope,
      title: "Instant eligibility check",
      body: "Your responses are reviewed automatically. Eligible patients are processed without delay.",
    },
    {
      icon: Package,
      title: "Prescription filled",
      body: "Your prescription goes directly to our FDA-regulated pharmacy — no extra steps.",
    },
    {
      icon: Smile,
      title: "Free overnight delivery",
      body: "Cold-packed medication arrives at your door with a tracking number sent via text.",
    },
  ];

  const testimonials = [
    {
      name: "Sarah M.",
      location: "Texas",
      weightLost: "28 lbs",
      time: "3 months",
      text: "I've tried everything. Within 3 months on Tirzepatide I was down 28 lbs. The process was so easy — no doctor's office, no waiting.",
      stars: 5,
    },
    {
      name: "James R.",
      location: "Florida",
      weightLost: "22 lbs",
      time: "2 months",
      text: "From filling out the form to getting my first dose took less than 48 hours. The support team is incredible.",
      stars: 5,
    },
    {
      name: "Michelle T.",
      location: "California",
      weightLost: "19 lbs",
      time: "10 weeks",
      text: "Finally a weight loss solution that feels medically backed and not just a gimmick. Down 19 lbs in 10 weeks.",
      stars: 5,
    },
  ];

  const pricingPlans = [
    { dose: "Tirzepatide 20mg", price: 349, note: "8-Week Prescription", popular: false, highlight: "Best for starters" },
    { dose: "Tirzepatide 40mg", price: 479, note: "8-Week Prescription", popular: true, highlight: "Most popular" },
    { dose: "Tirzepatide 60mg", price: 799, note: "8-Week Prescription", popular: false, highlight: "Maximum strength" },
  ];

  const faqs = [
    {
      q: "Am I a good candidate for GLP-1 treatment?",
      a: "Generally, candidates are adults 18+ with a BMI of 27 or higher, or those with a BMI of 25+ with at least one weight-related condition. Complete our quick health questionnaire and our licensed providers will make that determination for you.",
    },
    {
      q: "How long does it take to get started?",
      a: "Our online intake takes about 10 minutes. Once submitted and eligible, your prescription goes directly to our pharmacy — no waiting room, no delays.",
    },
    {
      q: "What results can I expect?",
      a: "Clinical studies show patients on Tirzepatide achieve an average of 15-20% body weight reduction when combined with a healthy diet and exercise.",
    },
    {
      q: "Are there any hidden fees?",
      a: "None. The price you see includes medication, syringes, cold-pack packaging, and free overnight shipping. No enrollment fees, no subscription traps.",
    },
    {
      q: "How is my medication shipped?",
      a: "All medications ship free via overnight delivery with cold-pack packaging to ensure integrity. You'll receive a tracking number via text the moment it ships.",
    },
    {
      q: "How is my health data protected?",
      a: "We use privacy and security safeguards for sensitive health data, including encrypted transport and restricted operational access. Full HIPAA readiness also depends on signed BAAs, production auth, storage, and operating policies.",
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <Navbar variant="customer" />

      {/* ─── HERO ─────────────────────────────────────────────────── */}
      <section className="bg-[#0f1225] text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_#D62B3C_0%,_transparent_55%)] opacity-20 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_#8B1A4A_0%,_transparent_55%)] opacity-15 pointer-events-none" />
        <div className="container-max py-20 sm:py-28 md:py-36 relative">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/8 border border-white/12 rounded-full px-4 py-1.5 text-sm text-white/80 font-medium mb-8">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <span>Trusted by <strong className="text-white">3,200+ patients</strong> &middot; Board-certified providers</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-[3.75rem] font-bold leading-[1.08] tracking-tight mb-6">
              Lose up to{" "}
              <span className="bg-gradient-to-r from-red-400 to-rose-400 bg-clip-text text-transparent">
                20% of your<br />body weight
              </span>{" "}
              — from home.
            </h1>

            <p className="text-lg text-slate-400 leading-relaxed mb-4 max-w-lg">
              Clinically proven GLP-1 therapy. Licensed providers. Free overnight delivery. No office visits — ever.
            </p>

            <div className="flex items-center gap-3 mb-8">
              <span className="text-sm text-slate-500">Starting at</span>
              <span className="text-2xl font-bold text-white">$349</span>
              <span className="text-sm text-slate-500">&middot; Includes shipping &middot; No hidden fees</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/start/info">
                <span className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-bold px-8 py-4 rounded-2xl transition-all text-base w-full sm:w-auto shadow-xl shadow-red-900/40">
                  Start my free intake
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
              <Link href="#pricing">
                <span className="inline-flex items-center justify-center gap-2 bg-white/8 hover:bg-white/12 text-white font-medium px-8 py-4 rounded-2xl transition-all text-base border border-white/10 w-full sm:w-auto">
                  View pricing
                </span>
              </Link>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-8 text-sm text-slate-500">
              <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-rose-400" />Free overnight shipping</span>
              <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-rose-400" />No enrollment fees</span>
              <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-rose-400" />Clinically supervised</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── TRUST BAR ───────────────────────────────────────────── */}
      <section className="bg-white border-b border-gray-100">
        <div className="container-max py-6 sm:py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: Users, label: "3,200+ Patients Served", sub: "And growing every week" },
              { icon: Shield, label: "FDA-Regulated Pharmacy", sub: "Safe, verified medications" },
              { icon: Truck, label: "Free Overnight Shipping", sub: "Cold-packed to your door" },
              { icon: Award, label: "Board-Certified Providers", sub: "Licensed in your state" },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 leading-tight">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ────────────────────────────────────────── */}
      <section id="how-it-works" className="section-padding bg-gray-50">
        <div className="container-max">
          <div className="text-center mb-14">
            <p className="text-rose-600 font-semibold text-sm uppercase tracking-widest mb-3">Simple Process</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">How it works</h2>
            <p className="text-gray-500 mt-3 max-w-md mx-auto">From your first question to delivery at your door — completely online.</p>
          </div>

          <div className="relative">
            <div className="hidden md:block absolute top-10 left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-red-200 via-rose-400 to-red-200" />
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6">
              {steps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={i} className="relative flex flex-col items-center text-center group">
                    <div className="relative z-10 w-20 h-20 bg-white border-2 border-rose-100 group-hover:border-rose-400 rounded-2xl flex flex-col items-center justify-center mb-5 shadow-sm transition-all">
                      <span className="text-xs font-bold text-rose-500 mb-1">STEP {i + 1}</span>
                      <Icon className="w-6 h-6 text-rose-600" />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-2 text-base">{step.title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{step.body}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-center mt-12">
            <Link href="/start/info">
              <span className="inline-flex items-center gap-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-semibold px-8 py-3.5 rounded-2xl transition-all text-sm shadow-lg shadow-red-900/30">
                Start your free intake
                <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── RESULTS / SCIENCE ───────────────────────────────────── */}
      <section className="section-padding bg-white">
        <div className="container-max">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div>
              <p className="text-rose-600 font-semibold text-sm uppercase tracking-widest mb-3">Clinical Results</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-5 leading-tight">
                Real science.<br />Real results.
              </h2>
              <p className="text-gray-500 leading-relaxed mb-8">
                Tirzepatide is a dual-action GLP-1/GIP receptor agonist that works with your body&apos;s natural hormones — reducing appetite, slowing digestion, and regulating blood sugar.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                {[
                  { stat: "15–20%", label: "average body weight reduction" },
                  { stat: "~10 min", label: "to complete your intake" },
                  { stat: "48 hrs", label: "to your door after approval" },
                  { stat: "100%", label: "online — no office visits" },
                ].map(({ stat, label }) => (
                  <div key={label} className="bg-gray-50 rounded-2xl p-4">
                    <p className="text-2xl font-bold text-rose-600 mb-1">{stat}</p>
                    <p className="text-xs text-gray-500 leading-snug">{label}</p>
                  </div>
                ))}
              </div>
              <ul className="space-y-2.5">
                {[
                  "Signals the brain to reduce appetite",
                  "Slows digestion — you feel full longer",
                  "Prompts natural insulin release",
                  "Reduces liver glucose production",
                ].map((point) => (
                  <li key={point} className="flex items-center gap-3 text-sm text-gray-700">
                    <div className="w-5 h-5 bg-rose-50 rounded-full flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-3.5 h-3.5 text-rose-600" />
                    </div>
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pricing preview card */}
            <div className="bg-[#0f1225] rounded-3xl p-8 text-white relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_#D62B3C_0%,_transparent_60%)] opacity-10 pointer-events-none" />
              <div className="relative">
                <p className="text-rose-400 text-sm font-semibold uppercase tracking-widest mb-2">Transparent Pricing</p>
                <h3 className="text-2xl font-bold mb-1">Compound Tirzepatide</h3>
                <p className="text-slate-400 text-sm mb-8">8-week prescriptions &middot; Free overnight shipping included</p>

                <div className="space-y-3">
                  {pricingPlans.map((plan) => (
                    <div key={plan.dose} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${plan.popular ? "bg-gradient-to-r from-red-600/20 to-rose-700/20 border-rose-500/40" : "bg-white/5 border-white/10"}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{plan.dose}</span>
                          {plan.popular && (
                            <span className="text-xs bg-gradient-to-r from-red-600 to-rose-700 text-white px-2 py-0.5 rounded-full font-medium">Popular</span>
                          )}
                        </div>
                        {plan.note && <p className="text-xs text-slate-400 mt-0.5">{plan.note}</p>}
                      </div>
                      <span className="text-2xl font-bold text-white">${plan.price}</span>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-slate-500 mt-5 mb-6 text-center">
                  Includes medication, syringes, cold-pack packaging &amp; overnight shipping. No hidden fees.
                </p>

                <Link href="/start/info" className="block">
                  <span className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-bold py-4 rounded-2xl transition-all text-sm shadow-lg shadow-red-900/40">
                    Begin Free Intake
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── PRICING ─────────────────────────────────────────────── */}
      <section id="pricing" className="section-padding bg-gray-50">
        <div className="container-max">
          <div className="text-center mb-12">
            <p className="text-rose-600 font-semibold text-sm uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Simple, transparent pricing</h2>
            <p className="text-gray-500 mt-3">All plans include medication, syringes, supplies &amp; free overnight shipping.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto items-start">
            {pricingPlans.map((plan) => (
              <div
                key={plan.dose}
                className={`relative bg-white rounded-3xl border overflow-hidden transition-all duration-300 ${
                  plan.popular
                    ? "border-rose-300 shadow-xl shadow-rose-100 sm:scale-105"
                    : "border-gray-200 hover:border-rose-200 hover:shadow-lg"
                }`}
              >
                {plan.popular && (
                  <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white text-xs font-bold text-center py-2 tracking-widest uppercase">
                    Most Popular
                  </div>
                )}
                <div className="p-6 sm:p-7">
                  <p className="text-xs font-semibold text-rose-600 uppercase tracking-widest mb-1">{plan.highlight}</p>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{plan.dose}</h3>
                  <p className="text-xs text-gray-400 mb-5">{plan.note}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                    <span className="text-gray-400 text-sm ml-1">one-time</span>
                  </div>
                  <ul className="space-y-2 mb-7 text-sm text-gray-600">
                    {["Compound Tirzepatide", "Syringes & supplies", "Cold-pack shipping", "Free overnight delivery", "Licensed provider review"].map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/start/info" className="block">
                    <span className={`flex items-center justify-center gap-2 w-full font-semibold py-3.5 rounded-2xl transition-all text-sm ${
                      plan.popular
                        ? "bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white shadow-lg shadow-red-900/30"
                        : "bg-gray-950 hover:bg-gray-800 text-white"
                    }`}>
                      Get Started
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-8">No subscriptions. No hidden fees. Pay once, get treated.</p>
        </div>
      </section>

      {/* ─── TESTIMONIALS ────────────────────────────────────────── */}
      <section className="section-padding bg-white">
        <div className="container-max">
          <div className="text-center mb-12">
            <p className="text-rose-600 font-semibold text-sm uppercase tracking-widest mb-3">Patient Stories</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Real people, real results</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                <div className="inline-flex items-center gap-2 bg-gradient-to-r from-red-50 to-rose-50 border border-rose-100 rounded-full px-3 py-1.5 mb-4">
                  <span className="text-rose-600 font-bold text-sm">&minus;{t.weightLost}</span>
                  <span className="text-gray-500 text-xs">in {t.time}</span>
                </div>
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: t.stars }).map((_, s) => (
                    <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-gray-700 text-sm leading-relaxed mb-5">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-gradient-to-br from-red-400 to-rose-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{t.name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRODUCTS ────────────────────────────────────────────── */}
      {products.length > 0 && (
        <section className="section-padding bg-gray-50">
          <div className="container-max">
            <div className="text-center mb-12">
              <p className="text-rose-600 font-semibold text-sm uppercase tracking-widest mb-3">Treatments</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Available plans</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
              {products.map((product) => (
                <div key={product.id} className="group relative bg-white rounded-3xl border border-gray-200 overflow-hidden hover:border-rose-300 hover:shadow-xl transition-all duration-300">
                  <div className="relative aspect-video bg-gradient-to-br from-rose-50 to-slate-100 overflow-hidden">
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      sizes="(min-width: 640px) 384px, 100vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => {
                        const el = e.currentTarget;
                        el.style.display = "none";
                        const parent = el.parentElement;
                        if (parent) {
                          const div = document.createElement("div");
                          div.className = "w-full h-full flex items-center justify-center text-5xl font-black text-rose-200";
                          div.textContent = product.name.charAt(0);
                          parent.appendChild(div);
                        }
                      }}
                    />
                  </div>
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="text-lg font-bold text-gray-900">{product.name}</h3>
                      <div className="text-right flex-shrink-0">
                        <span className="text-xl font-bold text-rose-600">{formatCurrency(product.startingPrice)}</span>
                        <span className="text-xs text-gray-400 block">starting price</span>
                      </div>
                    </div>
                    <p className="text-gray-500 text-sm leading-relaxed mb-4">{product.description}</p>
                    <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-4 mb-5">{product.eligibilityNote}</p>
                    <Link href="/start/info">
                      <span className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-semibold py-3 rounded-xl transition-all text-sm shadow-md shadow-red-900/20">
                        Get Started
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── CTA BAND ────────────────────────────────────────────── */}
      <section className="bg-gradient-to-r from-red-600 to-rose-700">
        <div className="container-max py-14 sm:py-16 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Ready to start your journey?</h2>
            <p className="text-red-100 text-sm">Free intake &middot; No office visit &middot; Ships overnight</p>
          </div>
          <Link href="/start/info" className="w-full sm:w-auto flex-shrink-0">
            <span className="inline-flex items-center justify-center gap-2 bg-white text-red-700 font-bold px-8 py-4 rounded-2xl hover:bg-red-50 transition-colors text-base w-full sm:w-auto shadow-lg">
              Begin Free Intake
              <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        </div>
      </section>

      {/* ─── FAQ ─────────────────────────────────────────────────── */}
      <section className="section-padding bg-white">
        <div className="container-max max-w-2xl">
          <div className="text-center mb-12">
            <p className="text-rose-600 font-semibold text-sm uppercase tracking-widest mb-3">FAQ</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Common questions</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {faqs.map((faq, i) => (
              <div key={i} className="py-5">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between text-left gap-4 group"
                >
                  <span className="font-semibold text-gray-900 text-sm sm:text-base group-hover:text-rose-700 transition-colors">{faq.q}</span>
                  <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${openFaq === i ? "bg-rose-600 border-rose-600 rotate-45" : "border-gray-300 group-hover:border-rose-400"}`}>
                    <svg className={`w-3 h-3 ${openFaq === i ? "text-white" : "text-gray-400"}`} viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                    </svg>
                  </div>
                </button>
                {openFaq === i && (
                  <p className="mt-4 text-gray-500 text-sm leading-relaxed pr-10">{faq.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CONTACT / SOCIAL ────────────────────────────────────── */}
      <section className="bg-[#0f1225] py-14 sm:py-16">
        <div className="container-max text-center">
          <p className="text-slate-400 text-sm mb-2">Questions? We respond within 24 hours.</p>
          <a href="mailto:service@missionwlw.com" className="inline-block text-rose-400 font-semibold hover:text-rose-300 text-xl mb-8 transition-colors">
            service@missionwlw.com
          </a>
          <div className="flex items-center justify-center gap-6">
            <a href="https://instagram.com/missionwlw" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-slate-500 hover:text-white transition-colors">
              <Instagram className="w-5 h-5" />
              Instagram
            </a>
            <a href="https://facebook.com/missionwlw" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-slate-500 hover:text-white transition-colors">
              <Facebook className="w-5 h-5" />
              Facebook
            </a>
          </div>
        </div>
      </section>

      {/* ─── DISCLAIMER ──────────────────────────────────────────── */}
      <div className="bg-[#0f1225] border-t border-white/5 py-5">
        <div className="container-max">
          <p className="text-xs text-slate-600 text-center leading-relaxed">
            <strong className="text-slate-500">Medical Disclaimer:</strong> GLP-1 medications are contraindicated for patients with a personal or family history of thyroid cancer or MEN 2, and are not suitable during pregnancy or breastfeeding. Results vary. Eligibility, prescription, and dosage decisions are made by licensed providers after clinical review.
          </p>
        </div>
      </div>
    </div>
  );
}
