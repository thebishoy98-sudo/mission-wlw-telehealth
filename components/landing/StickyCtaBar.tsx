"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export function StickyCtaBar({ ctaUrl }: { ctaUrl: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 420);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* Mobile: full-width bottom bar */}
      <div className="fixed bottom-0 inset-x-0 z-50 sm:hidden bg-forest-800 shadow-2xl safe-bottom">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Start losing weight today</p>
            <p className="text-white/60 text-xs">From $175/month · No waiting</p>
          </div>
          <Link
            href={ctaUrl}
            className="bg-white text-forest-800 font-bold text-sm px-5 py-2.5 rounded-full active:scale-95 transition-transform shrink-0 ml-3"
          >
            Get Started →
          </Link>
        </div>
      </div>
      {/* Desktop: floating bottom-right card */}
      <div className="hidden sm:flex fixed bottom-6 right-6 z-50 items-center gap-4 bg-forest-800 shadow-2xl rounded-2xl px-5 py-4 border border-white/10">
        <div>
          <p className="text-white font-semibold text-sm leading-tight">Start losing weight today</p>
          <p className="text-white/55 text-xs mt-0.5">From $175/month · No waiting</p>
        </div>
        <Link
          href={ctaUrl}
          className="shrink-0 bg-white text-forest-800 font-bold text-sm px-4 py-2.5 rounded-full hover:bg-white/90 transition-all active:scale-95 whitespace-nowrap"
        >
          Get Started →
        </Link>
      </div>
    </>
  );
}
