"use client";
import Link from "next/link";
import { FadeUp } from "./FadeUp";

const BENEFITS = [
  {
    title: "Dedicated Provider Care",
    desc: "Monthly check-ins with a board-certified provider who adjusts your plan as you progress.",
  },
  {
    title: "Personalized Dosage",
    desc: "We start at a low dose and titrate carefully, maximizing results while keeping side effects minimal.",
  },
  {
    title: "Delivered to Your Door",
    desc: "A US-based pharmacy ships your medication directly to you every 8 weeks in discreet packaging.",
  },
  {
    title: "Always-On Support",
    desc: "Message your care team anytime. Patient coordinators respond within 24 hours.",
  },
  {
    title: "Clinically Proven",
    desc: "Tirzepatide is clinically proven to reduce appetite and support significant long-term weight loss.",
  },
  {
    title: "Private and Secure",
    desc: "All health data is HIPAA-encrypted. We never sell your data or share it with employers.",
  },
];

const METRICS = [
  { value: "3,200+", label: "Active Patients" },
  { value: "94%", label: "Satisfaction Rate" },
  { value: "18%", label: "Avg. Body Weight Lost" },
  { value: "5 days", label: "Avg. Time to Start" },
];

export function LifestyleSection({ ctaUrl }: { ctaUrl: string }) {
  return (
    <section className="bg-cream-100 py-16 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp className="text-center mb-12 sm:mb-16">
          <span className="text-[11px] font-bold uppercase tracking-widest text-forest-700 mb-3 block">
            Why Mission WLW
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-forest-800 tracking-tight mb-4">
            More Than a Medication. A Complete Wellness System.
          </h2>
          <p className="text-gray-600 max-w-xl mx-auto text-base sm:text-lg">
            We combine medical expertise, personalized care, and clinical-grade medication into one seamless program.
          </p>
        </FadeUp>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 mb-16">
          {BENEFITS.map((b, i) => (
            <FadeUp key={b.title} delay={i * 0.06}>
              <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-100 shadow-sm h-full">
                <div className="w-2 h-2 rounded-full bg-forest-800 mb-4" />
                <h3 className="font-bold text-forest-800 mb-1.5 text-sm sm:text-base">{b.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{b.desc}</p>
              </div>
            </FadeUp>
          ))}
        </div>

        <FadeUp>
          <div className="bg-forest-800 rounded-2xl sm:rounded-3xl p-6 sm:p-10">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 text-white text-center">
              {METRICS.map((m) => (
                <div key={m.label}>
                  <div className="text-2xl sm:text-4xl font-bold mb-1">{m.value}</div>
                  <div className="text-xs sm:text-sm text-white/60">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </FadeUp>

        <FadeUp className="text-center mt-10">
          <Link
            href={ctaUrl}
            className="inline-block bg-forest-800 hover:bg-forest-700 active:scale-[.98] text-white font-bold px-8 py-4 rounded-full transition-all shadow-lg shadow-forest-800/20"
          >
            Join the Mission Community
          </Link>
        </FadeUp>
      </div>
    </section>
  );
}
