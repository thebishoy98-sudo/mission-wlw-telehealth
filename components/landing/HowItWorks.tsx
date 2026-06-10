"use client";
import Link from "next/link";
import { FadeUp } from "./FadeUp";

const STEPS = [
  {
    num: "01",
    title: "Complete Your Intake",
    desc: "Fill out a 5-minute health questionnaire online. Answer questions about your goals, health history, and current medications at your own pace.",
  },
  {
    num: "02",
    title: "Meet Your Provider",
    desc: "A board-certified provider reviews your intake and designs a personalized Tirzepatide program. Async consultation or video call, no office visit needed.",
  },
  {
    num: "03",
    title: "Receive Your Medication",
    desc: "Your prescription is sent to a US-based pharmacy and shipped directly to your door in 2 to 5 business days, in discreet packaging.",
  },
  {
    num: "04",
    title: "Track Your Progress",
    desc: "Monthly check-ins with your care team, dosage adjustments as you progress, and ongoing support until you reach your goal weight.",
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
            Start in 4 Easy Steps
          </h2>
          <p className="text-gray-600 max-w-xl mx-auto text-base sm:text-lg">
            From your first click to medication delivered, most patients are up and running within 5 days.
          </p>
        </FadeUp>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-12">
          {STEPS.map((step, i) => (
            <FadeUp key={step.num} delay={i * 0.08}>
              <div className="bg-white rounded-2xl p-6 h-full flex flex-col border border-gray-100 shadow-sm">
                <div className="w-10 h-10 rounded-full bg-forest-800 text-white flex items-center justify-center text-sm font-bold mb-4 shrink-0">
                  {step.num}
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
            Begin Your Journey
          </Link>
        </FadeUp>
      </div>
    </section>
  );
}
