"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { formatCurrency } from "@/lib/utils";
import { ArrowRight, CheckCircle, Shield, Truck, Star, Users, Instagram, Facebook } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";

export default function Home() {
  const [products, setProducts] = useState<Types.Product[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    setProducts(db.productDb.getActive());
  }, []);

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
      a: "Clinical studies show patients on Tirzepatide (GLP-1/GIP dual agonist) achieve an average of 15–20% body weight reduction when combined with a healthy diet and exercise.",
    },
    {
      q: "Are there any upfront costs?",
      a: "You pay when you submit your order. Because we've streamlined the process, eligible patients are processed immediately — no surprise fees, no enrollment charges.",
    },
    {
      q: "What medications do you offer?",
      a: "We offer compound Tirzepatide in multiple dose strengths (6-week supply plans), Oral GLP-1, and Men's Sexual Health options including Sildenafil and Tadalafil.",
    },
    {
      q: "How is my medication shipped?",
      a: "All medications ship free via overnight delivery with cold-pack packaging to ensure integrity. You'll receive a tracking number via text the moment it ships.",
    },
    {
      q: "How is my health data protected?",
      a: "All data is HIPAA-compliant, encrypted in transit and at rest. We never sell or share your information with third parties.",
    },
    {
      q: "What if I have side effects?",
      a: "Our support team — many of whom are patients themselves — is available to discuss dosage guidance and side effects. Reach us anytime at service@missionwlw.com.",
    },
  ];

  const pricingPlans = [
    { dose: "2.5 mg", weeks: "6-Week Plan", price: 299, note: "Starting dose" },
    { dose: "5 mg", weeks: "6-Week Plan", price: 349, note: "Most popular" },
    { dose: "7.5 mg", weeks: "6-Week Plan", price: 399, note: "" },
    { dose: "10 mg", weeks: "6-Week Plan", price: 479, note: "" },
  ];

  return (
    <div className="min-h-screen bg-white">
      <Navbar variant="customer" />

      {/* ─── HERO ─────────────────────────────────────────────────── */}
      <section className="bg-gray-950 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-900/20 to-transparent pointer-events-none" />
        <div className="container-max py-20 sm:py-28 md:py-36 relative">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-teal-900/60 border border-teal-700/50 rounded-full px-4 py-1.5 text-sm text-teal-300 font-medium mb-8">
              <Star className="w-3.5 h-3.5 fill-teal-400 text-teal-400" />
              Board-certified providers · FDA-regulated pharmacies
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.1] tracking-tight mb-6">
              Your journey to a healthier,
              <br />
              <span className="text-teal-400">happier you starts here.</span>
            </h1>
            <p className="text-lg text-gray-400 leading-relaxed mb-10 max-w-xl">
              Medical weight management with GLP-1 therapy — personalized, supervised, and shipped directly to your door. No office visits. No waiting.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/start/info">
                <span className="inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-500 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors text-base w-full sm:w-auto">
                  Get Started Today
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
              <Link href="/products">
                <span className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors text-base border border-white/10 w-full sm:w-auto">
                  View Treatments
                </span>
              </Link>
            </div>
            <p className="mt-5 text-sm text-gray-500">
              Free overnight shipping · No enrollment fees · Licensed providers
            </p>
          </div>
        </div>
      </section>

      {/* ─── TRUST BAR ───────────────────────────────────────────── */}
      <section className="border-b border-gray-100 bg-white">
        <div className="container-max py-6 sm:py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 sm:gap-8">
            {[
              { icon: Users, label: "Board-Certified Providers", sub: "Expert care you can trust" },
              { icon: Shield, label: "FDA-Regulated Pharmacies", sub: "Safe, high-quality medications" },
              { icon: Truck, label: "Direct-to-Door Shipping", sub: "Free overnight, no clinic visits" },
              { icon: CheckCircle, label: "Full Medical Supervision", sub: "Personalized support every step" },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-start sm:items-center gap-3">
                <div className="w-9 h-9 bg-teal-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-gray-900">{label}</p>
                  <p className="text-xs text-gray-400 hidden sm:block">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ────────────────────────────────────────── */}
      <section className="section-padding bg-white">
        <div className="container-max">
          <div className="mb-10 sm:mb-14">
            <p className="text-teal-600 font-semibold text-sm uppercase tracking-widest mb-3">Simple Process</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">How it works</h2>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { n: "01", title: "Complete your intake", body: "Answer health questions securely online — takes about 10 minutes from any device." },
              { n: "02", title: "Instant eligibility check", body: "Our system evaluates your responses automatically. Eligible patients are processed without delay." },
              { n: "03", title: "Prescription filled", body: "Your prescription goes directly to our FDA-regulated pharmacy partner." },
              { n: "04", title: "Free overnight delivery", body: "Your medication arrives at your door with cold-pack packaging and a tracking number via text." },
            ].map((step) => (
              <div key={step.n}>
                <p className="text-5xl font-black text-gray-100 mb-4 select-none">{step.n}</p>
                <h3 className="font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SCIENCE SECTION ─────────────────────────────────────── */}
      <section className="section-padding bg-gray-50">
        <div className="container-max">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-teal-600 font-semibold text-sm uppercase tracking-widest mb-3">The Science</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-5">
                The science behind effective weight management
              </h2>
              <p className="text-gray-500 text-base leading-relaxed mb-6">
                Tirzepatide is a dual-action GLP-1/GIP receptor agonist that mimics natural hormones regulating hunger, digestion, and glucose levels. Clinical studies show an average of <strong className="text-gray-700">15–20% body weight reduction</strong> when combined with diet and exercise.
              </p>
              <ul className="space-y-3">
                {[
                  "Signals the brain to reduce appetite",
                  "Slows stomach digestion, promoting fullness",
                  "Prompts the pancreas to release insulin naturally",
                  "Directs the liver to produce less glucose",
                ].map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm text-gray-700">
                    <CheckCircle className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-8">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-6">Pricing</p>
              <div className="space-y-4">
                {pricingPlans.map((plan) => (
                  <div key={plan.dose} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="font-semibold text-gray-900">{plan.dose} &mdash; {plan.weeks}</p>
                      {plan.note && <p className="text-xs text-teal-600 font-medium mt-0.5">{plan.note}</p>}
                    </div>
                    <p className="text-xl font-bold text-gray-900">${plan.price}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-4">Includes medication, syringes, cold-pack packaging &amp; free overnight shipping. No hidden fees.</p>
              <Link href="/start/info" className="mt-5 block">
                <span className="flex items-center justify-center gap-2 w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
                  Start Your Intake
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── PRODUCTS ────────────────────────────────────────────── */}
      {products.length > 0 && (
        <section className="section-padding bg-white">
          <div className="container-max">
            <div className="mb-10 sm:mb-12">
              <p className="text-teal-600 font-semibold text-sm uppercase tracking-widest mb-3">Treatments</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Available plans</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-6 max-w-3xl">
              {products.map((product) => (
                <div key={product.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:border-teal-300 hover:shadow-lg transition-all duration-200 group">
                  <div className="aspect-video bg-gradient-to-br from-teal-50 to-gray-100 flex items-center justify-center overflow-hidden">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const el = e.currentTarget;
                        el.style.display = "none";
                        const parent = el.parentElement;
                        if (parent) {
                          const div = document.createElement("div");
                          div.className = "text-5xl font-black text-teal-200 select-none";
                          div.textContent = product.name.charAt(0);
                          parent.appendChild(div);
                        }
                      }}
                    />
                  </div>
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <h3 className="text-lg sm:text-xl font-bold text-gray-900">{product.name}</h3>
                      <span className="text-teal-600 font-bold text-lg whitespace-nowrap">{formatCurrency(product.startingPrice)}<span className="text-xs text-gray-400 font-normal">/plan</span></span>
                    </div>
                    <p className="text-gray-500 text-sm leading-relaxed mb-4">{product.description}</p>
                    <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-4 mb-5">{product.eligibilityNote}</p>
                    <Link href="/start/info">
                      <span className="flex items-center justify-center gap-2 w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">
                        Get Started
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
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
      <section className="bg-teal-600">
        <div className="container-max py-14 sm:py-16 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Ready to start your journey?</h2>
            <p className="text-teal-100">Complete your intake in under 10 minutes.</p>
          </div>
          <Link href="/start/info" className="w-full sm:w-auto flex-shrink-0">
            <span className="inline-flex items-center justify-center gap-2 bg-white text-teal-700 font-bold px-8 py-4 rounded-xl hover:bg-teal-50 transition-colors text-base w-full sm:w-auto">
              Begin Intake
              <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        </div>
      </section>

      {/* ─── FAQ ─────────────────────────────────────────────────── */}
      <section className="section-padding bg-white">
        <div className="container-max max-w-2xl">
          <div className="mb-10">
            <p className="text-teal-600 font-semibold text-sm uppercase tracking-widest mb-3">FAQ</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Frequently Asked Questions</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {faqs.map((faq, i) => (
              <div key={i} className="py-5">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between text-left gap-4"
                >
                  <span className="font-semibold text-gray-900 text-sm sm:text-base">{faq.q}</span>
                  <span className={`w-5 h-5 flex-shrink-0 text-teal-600 transition-transform duration-200 ${openFaq === i ? "rotate-45" : ""}`}>
                    <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/></svg>
                  </span>
                </button>
                {openFaq === i && (
                  <p className="mt-3 text-gray-500 text-sm leading-relaxed">{faq.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CONTACT / SOCIAL ────────────────────────────────────── */}
      <section className="bg-gray-50 border-t border-gray-100 py-12 sm:py-16">
        <div className="container-max text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Get in touch</h2>
          <p className="text-gray-500 mb-6">Our team responds within 24 hours.</p>
          <a href="mailto:service@missionwlw.com" className="inline-block text-teal-600 font-semibold hover:text-teal-700 text-lg mb-8">
            service@missionwlw.com
          </a>
          <div className="flex items-center justify-center gap-5">
            <a href="https://instagram.com/missionwlw" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
              <Instagram className="w-5 h-5" />
              @missionwlw
            </a>
            <a href="https://facebook.com/missionwlw" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
              <Facebook className="w-5 h-5" />
              @missionwlw
            </a>
          </div>
        </div>
      </section>

      {/* ─── DISCLAIMER ──────────────────────────────────────────── */}
      <div className="bg-white border-t border-gray-100 py-5">
        <div className="container-max">
          <p className="text-xs text-gray-400 text-center">
            <strong className="text-gray-500">Medical Disclaimer:</strong> This platform is for demonstration purposes. No real medical advice is provided. Eligibility, prescription, and dosage decisions are made by licensed providers. Results vary. GLP-1 medications are contraindicated for patients with personal or family history of thyroid cancer or MEN 2, and are not suitable for use during pregnancy or breastfeeding.
          </p>
        </div>
      </div>
    </div>
  );
}
