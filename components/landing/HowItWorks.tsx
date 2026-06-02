"use client";
import Link from "next/link";
import { FadeUp } from "./FadeUp";

const STEPS = [
  {
    num: "01",
    icon: "📋",
    title: "Complete Your Intake",
    desc: "Fill out a brief 5-minute health questionnaire. Answer questions about your goals, health history, and current medications — all online, on your schedule.",
  },
  {
    num: "02",
    icon: "👩‍⚕️",
    title: "Meet Your Provider",
    desc: "A board-certified provider reviews your intake and designs a personalized GLP-1 program. Async or video — no in-person visit required.",
  },
  {
    num: "03",
    icon: "📦",
    title: "Receive Your Medication",
    desc: "Your prescription is sent to a licensed pharmacy and shipped directly to your door in 2–5 business days, discreetly packaged.",
  },
  {
    num: "04",
    icon: "📈",
    title: "Track Your Progress",
    desc: "Monthly check-ins with your care team, dosage adjustments as needed, and ongoing support until you reach your goal weight.",
  },
];

export function HowItWorks({ ctaUrl }: { ctaUrl: string }) {
  return (
    <section id="how-it-works" className="bg-cream-100 py-16 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp className="text-center mb-12 sm:mb-16">
          <span className="text-[11px] font-bold uppercase tracking-widest text-forest-700 mb-3 block">
            Simple Process
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-forest-800 tracking-tight mb-4">
            Start Losing Weight in 4 Steps
          </h2>
          <p className="text-gray-600 max-w-xl mx-auto text-base sm:text-lg">
            From first click to medication delivered — most patients start within 5 days.
          </p>
        </FadeUp>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-12">
          {STEPS.map((step, i) => (
            <FadeUp key={step.num} delay={i * 0.08}>
              <div className="bg-white rounded-2xl p-6 h-full flex flex-col border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{step.icon}</span>
                  <span className="text-xs font-bold text-gray-300 tracking-widest">{step.num}</span>
                </div>
                <h3 className="text-base font-bold text-forest-800 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed flex-1">{step.desc}</p>
              </div>
            </FadeUp>
          ))}
        </div>

        <FadeUp className="text-center">
          <Link
            href={ctaUrl}
            className="inline-block bg-forest-800 hover:bg-forest-700 active:scale-[.98] text-white font-bold px-8 py-4 rounded-full transition-all shadow-lg shadow-forest-800/20"
          >
            Begin Your Journey →
          </Link>
        </FadeUp>
      </div>
    </section>
  );
}
