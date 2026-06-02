"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Shield, Stethoscope } from "lucide-react";

interface LandingHeaderProps {
  ctaUrl: string;
}

export function LandingHeader({ ctaUrl }: LandingHeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm">
      {/* Trust strip */}
      <div className="bg-gradient-to-r from-[#022859] to-[#0d3d87] text-white text-center text-xs font-medium py-2 px-4">
        <span className="flex items-center justify-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3 h-3" aria-hidden="true" />
            US-licensed providers
          </span>
          <span className="text-white/50" aria-hidden="true">·</span>
          <span>No insurance needed</span>
          <span className="text-white/50" aria-hidden="true">·</span>
          <span className="flex items-center gap-1.5">
            <Stethoscope className="w-3 h-3" aria-hidden="true" />
            FDA-regulated pharmacy
          </span>
        </span>
      </div>

      {/* Header bar */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
        <Link href="/" aria-label="Mission Weight Loss & Wellness — home">
          <Image
            src="/mission-logo.jpeg"
            alt="Mission Weight Loss & Wellness"
            width={160}
            height={49}
            className="h-9 w-auto"
            priority
          />
        </Link>

        <Link href={ctaUrl}>
          <span className="inline-flex items-center gap-2 bg-gradient-to-r from-[#bf0536] to-[#d90b57] hover:from-[#a5042f] hover:to-[#c0084d] text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all shadow-md active:opacity-90">
            Check My Eligibility
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        </Link>
      </div>
    </header>
  );
}
