"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
