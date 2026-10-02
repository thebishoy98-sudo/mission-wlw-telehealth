"use client";
import Link from "next/link";
import { FadeUp } from "./FadeUp";

const CATEGORIES = ["Recovery & Repair", "Energy & Metabolism"];

export function PeptideShopTeaser() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <div className="bg-forest-800 rounded-2xl sm:rounded-3xl p-6 sm:p-10 flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
            <div className="flex-1">
              <span className="text-[11px] font-bold uppercase tracking-widest text-rose-300 mb-2 block">
                New
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
                Shop Peptides Directly
              </h2>
              <p className="text-white/60 text-sm sm:text-base mb-4 max-w-md">
                Browse by category and order peptides directly to your door &mdash; no medical
                questionnaire or provider review required.
              </p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <span key={c} className="text-[11px] font-semibold text-white/70 bg-white/10 px-3 py-1.5 rounded-full">
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <Link
              href="/peptides"
              className="shrink-0 w-full sm:w-auto text-center bg-red-400 hover:bg-red-300 text-forest-900 font-bold px-7 py-3.5 rounded-full text-sm transition-all active:scale-[.98]"
            >
              Shop Peptides
            </Link>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
