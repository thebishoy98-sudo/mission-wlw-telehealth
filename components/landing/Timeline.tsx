"use client";
import { FadeUp } from "./FadeUp";

const MILESTONES = [
  {
    period: "Day 1–3",
    title: "Consultation & Prescription",
    desc: "Complete your intake, meet your provider, and get a personalized prescription written the same week.",
    icon: "📋",
  },
  {
    period: "Week 1",
    title: "Medication Arrives",
    desc: "Your GLP-1 medication is shipped from a licensed pharmacy and delivered to your door, discreetly.",
    icon: "📦",
  },
  {
    period: "Month 1–2",
    title: "Low-Dose Start",
    desc: "Begin at a low starting dose. Your appetite begins to decrease. Most patients see 5–8 lbs lost.",
    icon: "💊",
  },
  {
    period: "Month 2–4",
    title: "Titration & Momentum",
    desc: "Dose increases gradually. Weight loss accelerates. Patients typically lose 12–20 lbs by this point.",
    icon: "📉",
  },
  {
    period: "Month 4–6",
    title: "Significant Results",
    desc: "Most patients hit 10–18% body weight loss. Energy improves, cravings are minimal.",
    icon: "🏆",
  },
  {
    period: "Month 6+",
    title: "Goal & Maintenance",
    desc: "Reach your target weight. Work with your provider on a maintenance plan to keep results for life.",
    icon: "🌿",
  },
];

export function Timeline() {
  return (
    <section className="bg-cream-100 py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp className="text-center mb-12 sm:mb-16">
          <span className="text-[11px] font-bold uppercase tracking-widest text-forest-700 mb-3 block">
            Your Journey
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-forest-800 tracking-tight mb-4">
            What to Expect
          </h2>
          <p className="text-gray-600 max-w-xl mx-auto text-base sm:text-lg">
            A transparent look at your treatment timeline from first day to goal weight.
          </p>
        </FadeUp>

        <div className="relative">
          {/* Vertical line (desktop) */}
          <div className="hidden sm:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-200 -translate-x-1/2" />

          <div className="space-y-6 sm:space-y-0">
            {MILESTONES.map((m, i) => (
              <FadeUp key={m.period} delay={i * 0.07}>
                <div className={`relative flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-0 ${i % 2 === 0 ? "sm:flex-row" : "sm:flex-row-reverse"}`}>
                  {/* Card */}
                  <div className={`sm:w-[calc(50%-2.5rem)] ${i % 2 === 0 ? "sm:pr-10" : "sm:pl-10"}`}>
                    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xl">{m.icon}</span>
                        <span className="text-[11px] font-bold text-forest-700 uppercase tracking-wider">{m.period}</span>
                      </div>
                      <h3 className="font-bold text-forest-800 mb-1.5 text-sm sm:text-base">{m.title}</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">{m.desc}</p>
                    </div>
                  </div>

                  {/* Center dot */}
                  <div className="hidden sm:flex absolute left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-forest-800 border-4 border-cream-100 z-10" />

                  {/* Empty spacer on other side */}
                  <div className="hidden sm:block sm:w-[calc(50%-2.5rem)]" />
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
