"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";

const STORAGE_KEY = "reta_launch_seen";

export function RetatrutideModal({ ctaUrl }: { ctaUrl: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem(STORAGE_KEY)) {
      const t = setTimeout(() => setOpen(true), 900);
      return () => clearTimeout(t);
    }
  }, []);

  const close = () => {
    sessionStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reta-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={close}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: "linear-gradient(145deg, #0d0b07 0%, #1a1508 55%, #0a0904 100%)" }}
      >
        {/* Amber glow top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-amber-400/20 blur-3xl pointer-events-none" />

        {/* Close */}
        <button
          onClick={close}
          className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative px-8 pt-10 pb-8">
          {/* Badge */}
          <div className="flex justify-center mb-5">
            <span className="inline-flex items-center gap-2 bg-amber-400 text-amber-950 text-[10px] font-black uppercase tracking-[0.18em] px-4 py-1.5 rounded-full shadow-lg shadow-amber-400/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-950 animate-pulse" />
              First to Market
            </span>
          </div>

          {/* Vial image */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-3xl bg-amber-400/10 blur-2xl scale-125" />
              <div className="relative bg-white/8 rounded-2xl p-3 border border-amber-400/20">
                <Image
                  src="/retatrutide-vial.jpg"
                  alt="Retatrutide pharmacy-grade vial"
                  width={90}
                  height={140}
                  className="object-contain drop-shadow-2xl"
                  style={{ mixBlendMode: "multiply" }}
                />
              </div>
            </div>
          </div>

          {/* Headline */}
          <h2
            id="reta-modal-title"
            className="text-center text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2 leading-tight"
          >
            Pharmacy-Grade Retatrutide
            <br />
            <span className="text-amber-400">Available Today</span>
          </h2>
          <p className="text-center text-white/55 text-sm leading-relaxed mb-6 max-w-sm mx-auto">
            Mission WLW is one of the first telehealth platforms to offer legitimate 503B
            compounded Retatrutide — the next-generation triple-agonist GLP-1 that outperforms
            every predecessor. Order yours today.
          </p>

          {/* Features */}
          <div className="grid grid-cols-2 gap-2 mb-7">
            {[
              "Triple GLP-1 / GIP / Glucagon",
              "Licensed 503B Pharmacy",
              "Provider prescription included",
              "Free overnight shipping",
            ].map((f) => (
              <div key={f} className="flex items-start gap-2 text-xs text-white/65">
                <span className="text-amber-400 font-bold mt-0.5 shrink-0">✓</span>
                {f}
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={ctaUrl}
              onClick={close}
              className="flex-1 text-center bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold py-3.5 rounded-full text-sm transition-all active:scale-[.98] shadow-lg shadow-amber-400/25"
            >
              Order Retatrutide Now
            </Link>
            <button
              onClick={close}
              className="flex-1 text-center border border-white/15 text-white/60 hover:text-white/90 hover:border-white/30 font-medium py-3.5 rounded-full text-sm transition-all"
            >
              Maybe Later
            </button>
          </div>

          <p className="text-center text-[10px] text-white/25 mt-4">
            Limited quantities. Prescription required. Provider determines final eligibility.
          </p>
        </div>
      </div>
    </div>
  );
}
