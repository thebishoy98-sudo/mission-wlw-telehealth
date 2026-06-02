"use client";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { FadeUp } from "./FadeUp";

const STATS = [
  { value: "42 lbs", sub: "avg. lost in 6 months", label: "Weight Lost" },
  { value: "94%", sub: "would recommend", label: "Satisfaction" },
  { value: "18%", sub: "avg. of body weight", label: "Body Weight" },
  { value: "3,200+", sub: "patients helped", label: "Community" },
];

const STARS = Array.from({ length: 5 });

export function Hero({ ctaUrl }: { ctaUrl: string }) {
  return (
    <section className="bg-cream-100 pt-10 pb-16 md:pt-20 md:pb-28 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">

          {/* Left */}
          <div>
            <FadeUp>
              <span className="inline-flex items-center gap-1.5 bg-forest-800/10 text-forest-800 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
                FDA-Regulated Compounded Tirzepatide
              </span>
            </FadeUp>

            <FadeUp delay={0.08}>
              <h1 className="text-[2.1rem] leading-[1.1] sm:text-5xl md:text-[3rem] lg:text-[3.4rem] font-bold text-forest-800 tracking-tight mb-4">
                Your Journey to a Healthier, Happier You Starts Here
              </h1>
            </FadeUp>

            <FadeUp delay={0.15}>
              <p className="text-base sm:text-lg text-gray-600 mb-7 leading-relaxed">
                Mission Weight Loss and Wellness connects you with board-certified providers who
                prescribe personalized Tirzepatide programs. Medication delivered to your door
                with no office visits required.
              </p>
            </FadeUp>

            <FadeUp delay={0.22}>
              <div className="flex flex-col sm:flex-row gap-3 mb-7">
                <Link
                  href={ctaUrl}
                  className="bg-forest-800 hover:bg-forest-700 active:scale-[.98] text-white font-bold px-7 py-4 rounded-full text-center transition-all shadow-lg shadow-forest-800/20 text-sm sm:text-base"
                >
                  Start Your Free Assessment
                </Link>
                <a
                  href="#how-it-works"
                  className="border-2 border-forest-800 text-forest-800 font-semibold px-7 py-4 rounded-full text-center hover:bg-forest-800/5 transition-colors text-sm sm:text-base"
                >
                  How It Works
                </a>
              </div>
            </FadeUp>

            <FadeUp delay={0.28}>
              <div className="flex items-center gap-2.5 text-sm text-gray-500">
                <div className="flex gap-0.5">
                  {STARS.map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <span>
                  <strong className="text-gray-800">4.9/5</strong> from 2,800+ patients
                </span>
                <span className="hidden sm:inline text-gray-300">|</span>
                <span className="hidden sm:inline">HIPAA Compliant</span>
              </div>
            </FadeUp>
          </div>

          {/* Right */}
          <FadeUp delay={0.18} className="relative">
            <div className="bg-forest-800 rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-white overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-forest-700/30 to-transparent pointer-events-none" />
              <div className="relative">
                <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-green-300 mb-5">
                  Real Patient Outcomes
                </p>
                <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-7">
                  {STATS.map((s) => (
                    <div key={s.label}>
                      <div className="text-2xl sm:text-3xl font-bold leading-none mb-0.5">{s.value}</div>
                      <div className="text-[11px] text-green-300 mb-0.5">{s.sub}</div>
                      <div className="text-[11px] text-white/50">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-white/20 pt-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <Image
                        src="/tirzepatide-vial.jpg"
                        alt="Tirzepatide"
                        width={36}
                        height={36}
                        className="w-full h-full object-cover rounded-full"
                      />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Compounded Tirzepatide</div>
                      <div className="text-[11px] text-white/55">Licensed 503B Pharmacy</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating badge */}
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-3 -left-3 sm:-bottom-4 sm:-left-4 bg-white rounded-xl sm:rounded-2xl shadow-xl px-3.5 py-2.5"
            >
              <div className="text-[10px] text-gray-400 mb-0.5">Latest result</div>
              <div className="font-bold text-forest-800 text-sm">Sarah M. lost 52 lbs</div>
            </motion.div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}
