"use client";
import { useState } from "react";
import Link from "next/link";
import { FadeUp } from "./FadeUp";

export function WeightLossCalculator({ ctaUrl }: { ctaUrl: string }) {
  const [current, setCurrent] = useState(220);
  const [goal, setGoal] = useState(175);

  const toLoose = current - goal;
  const pct = ((toLoose / current) * 100).toFixed(0);
  const weeksLow = Math.round(toLoose / 2);
  const weeksHigh = Math.round(toLoose / 1.25);
  const monthsLow = Math.ceil(weeksLow / 4.3);
  const monthsHigh = Math.ceil(weeksHigh / 4.3);
  const goalCapped = Math.min(goal, current - 5);

  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          {/* Left — Copy */}
          <FadeUp>
            <span className="text-[11px] font-bold uppercase tracking-widest text-forest-700 mb-3 block">
              Weight-Loss Calculator
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-forest-800 tracking-tight mb-4">
              See How Fast You Could Reach Your Goal
            </h2>
            <p className="text-gray-600 text-base sm:text-lg leading-relaxed mb-6">
              GLP-1 medications reduce appetite and improve metabolism, helping most patients lose
              1–2 lbs per week. Enter your numbers to see a realistic timeline.
            </p>
            <ul className="space-y-2 text-sm text-gray-500">
              {[
                "Average 18% body weight lost in 6 months",
                "Results start within 4–8 weeks",
                "Clinically proven, not a crash diet",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="text-forest-700 font-bold shrink-0">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </FadeUp>

          {/* Right — Calculator */}
          <FadeUp delay={0.12}>
            <div className="bg-cream-100 rounded-2xl sm:rounded-3xl p-6 sm:p-8">
              {/* Current weight slider */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-semibold text-forest-800">Current Weight</label>
                  <span className="text-lg font-bold text-forest-800">{current} lbs</span>
                </div>
                <input
                  type="range"
                  min={150}
                  max={400}
                  step={1}
                  value={current}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setCurrent(v);
                    if (goal >= v) setGoal(v - 5);
                  }}
                  className="w-full h-2 rounded-full accent-forest-800 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>150 lbs</span>
                  <span>400 lbs</span>
                </div>
              </div>

              {/* Goal weight slider */}
              <div className="mb-8">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-semibold text-forest-800">Goal Weight</label>
                  <span className="text-lg font-bold text-forest-800">{goalCapped} lbs</span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={current - 5}
                  step={1}
                  value={goalCapped}
                  onChange={(e) => setGoal(Number(e.target.value))}
                  className="w-full h-2 rounded-full accent-forest-800 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>100 lbs</span>
                  <span>{current - 5} lbs</span>
                </div>
              </div>

              {/* Result */}
              <div className="bg-forest-800 text-white rounded-xl p-5 mb-5">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-2xl font-bold">{toLoose}</div>
                    <div className="text-[11px] text-white/60 mt-0.5">lbs to lose</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{pct}%</div>
                    <div className="text-[11px] text-white/60 mt-0.5">body weight</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      {monthsLow === monthsHigh ? `${monthsLow}` : `${monthsLow}–${monthsHigh}`}
                    </div>
                    <div className="text-[11px] text-white/60 mt-0.5">months est.</div>
                  </div>
                </div>
              </div>

              <Link
                href={ctaUrl}
                className="block text-center bg-forest-800 hover:bg-forest-700 active:scale-[.98] text-white font-bold py-3.5 rounded-full transition-all"
              >
                Get My Personalized Plan
              </Link>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}
