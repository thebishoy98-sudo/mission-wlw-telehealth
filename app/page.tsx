"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PromoBar } from "@/components/landing/PromoBar";
import { LandingNav } from "@/components/landing/LandingNav";
import { Hero } from "@/components/landing/Hero";
import { TrustMarquee } from "@/components/landing/TrustMarquee";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { WeightLossCalculator } from "@/components/landing/WeightLossCalculator";
import { LifestyleSection } from "@/components/landing/LifestyleSection";
import { Testimonials } from "@/components/landing/Testimonials";
import { Timeline } from "@/components/landing/Timeline";
import { ReviewsCarousel } from "@/components/landing/ReviewsCarousel";
import { PricingCards } from "@/components/landing/PricingCards";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { LandingFooter } from "@/components/landing/LandingFooter";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "ref",
  "aff",
] as const;

function useCta(base = "/start/info") {
  const sp = useSearchParams();
  const p = new URLSearchParams();
  UTM_KEYS.forEach((k) => {
    const v = sp.get(k);
    if (v) p.set(k, v);
  });
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

function LandingPage() {
  const ctaUrl = useCta();
  return (
    <div className="min-h-screen bg-cream-100">
      <PromoBar ctaUrl={ctaUrl} />
      <LandingNav ctaUrl={ctaUrl} />
      <main>
        <Hero ctaUrl={ctaUrl} />
        <TrustMarquee />
        <HowItWorks ctaUrl={ctaUrl} />
        <WeightLossCalculator ctaUrl={ctaUrl} />
        <LifestyleSection ctaUrl={ctaUrl} />
        <Testimonials />
        <Timeline />
        <ReviewsCarousel />
        <PricingCards ctaUrl={ctaUrl} />
        <LandingFaq />
        <LandingFooter ctaUrl={ctaUrl} />
      </main>

      {/* Sticky mobile CTA bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3">
        <Link
          href={ctaUrl}
          className="block bg-forest-800 hover:bg-forest-700 active:scale-[.98] text-white font-bold text-center py-3.5 rounded-full w-full transition-all"
        >
          Start Free Assessment
        </Link>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <LandingPage />
    </Suspense>
  );
}
