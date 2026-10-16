"use client";

import { LandingNav } from '@/components/landing/LandingNav';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { EducationSection } from '@/components/glp1/EducationSection';
import { FaqSection } from '@/components/glp1/FaqSection';
import { FinalCtaSection } from '@/components/glp1/FinalCtaSection';
import { HeroSection } from '@/components/glp1/HeroSection';
import { StepsSection } from '@/components/glp1/StepsSection';
import { SupervisionSection } from '@/components/glp1/SupervisionSection';
import { useAssessmentUrl } from '@/lib/useAssessmentUrl';

export function Glp1Page() {
  const ctaUrl = useAssessmentUrl('/glp1/assessment');
  return (
    <div className="min-h-screen bg-cream-100">
      <LandingNav ctaUrl={ctaUrl} education />
      <div className="glp1-content">
        <HeroSection />
        <EducationSection />
        <StepsSection />
        <SupervisionSection />
        <FaqSection />
        <FinalCtaSection />
        <p className="section-wrap pb-10 text-sm text-gray-600">Information on this page is educational and is not a substitute for medical advice, diagnosis, or treatment. Results and experiences vary. Treatment decisions are made with a licensed provider.</p>
      </div>
      <LandingFooter ctaUrl={ctaUrl} education />
    </div>
  );
}
