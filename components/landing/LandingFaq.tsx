"use client";
import { useState } from "react";
import { FadeUp } from "./FadeUp";

const FAQS = [
  {
    q: "Am I eligible for GLP-1 medications?",
    a: "Most adults with a BMI of 27+ and at least one weight-related health condition (like high blood pressure, pre-diabetes, or high cholesterol) or a BMI of 30+ qualify. Your provider reviews your full health history during the intake process.",
  },
  {
    q: "How quickly will I see results?",
    a: "Most patients notice reduced appetite within the first 1–2 weeks. Visible weight loss typically begins in weeks 3–6. Significant results (10%+ body weight lost) are usually seen by month 3–5 of consistent treatment.",
  },
  {
    q: "Is this covered by insurance?",
    a: "Our compounded semaglutide and tirzepatide programs are self-pay, starting at $149/month — far below insurance-billed brand prices. Brand medications (Ozempic®, Wegovy®, etc.) may have insurance coverage depending on your plan.",
  },
  {
    q: "Do I need to come in person?",
    a: "No. Our entire process is online. Your provider consultation happens via secure video or asynchronous message review. Medication is shipped directly to your home.",
  },
  {
    q: "What are the side effects?",
    a: "The most common side effects are mild nausea, reduced appetite, and occasional fatigue — especially in the first few weeks. These typically pass as your body adjusts. We start at a low dose and increase gradually to minimize discomfort.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. There are no contracts or cancellation fees. You can pause or cancel your program at any time from your patient portal. Monthly subscriptions are billed on a rolling basis.",
  },
  {
    q: "How is my health data protected?",
    a: "All data is HIPAA-encrypted and stored on secure, HIPAA-compliant servers. We never sell your data to third parties, advertisers, or employers. Your health history stays private.",
  },
];

export function LandingFaq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-white py-16 sm:py-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp className="text-center mb-12">
          <span className="text-[11px] font-bold uppercase tracking-widest text-forest-700 mb-3 block">
            FAQ
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-forest-800 tracking-tight">
            Common Questions
          </h2>
        </FadeUp>

        <div className="space-y-2">
          {FAQS.map((item, i) => (
            <FadeUp key={i} delay={i * 0.04}>
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left text-forest-800 font-semibold text-sm sm:text-base hover:bg-cream-100 transition-colors"
                  aria-expanded={open === i}
                >
                  <span className="pr-4">{item.q}</span>
                  <span className={`text-forest-700 transition-transform shrink-0 ${open === i ? "rotate-180" : ""}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </button>
                {open === i && (
                  <div className="px-5 pb-5 text-sm text-gray-600 leading-relaxed border-t border-gray-50 pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}
