import { pageContent } from './content';
import { AssessmentButton } from './AssessmentButton';
import Image from 'next/image';

export function HeroSection() {
  return (
    <section className="hero section-wrap">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-line" />{pageContent.eyebrow}</div>
        <h1>{pageContent.heroTitle}</h1>
        <p className="hero-description">{pageContent.heroDescription}</p>
        <div className="hero-actions">
          <AssessmentButton>Start my assessment</AssessmentButton>
          <span className="secure-note"><span aria-hidden="true">✳</span> No commitment to treatment</span>
        </div>
        <div className="hero-trust"><span className="trust-dot" />Personalized care begins with understanding you</div>
      </div>
      <div className="hero-art">
        <Image
          className="hero-photo"
          src="/images/glp1/friends.jpeg"
          fill
          sizes="(max-width: 680px) 100vw, 50vw"
          priority
          alt="Three adult friends smiling together outdoors"
        />
        <div className="art-caption"><span className="caption-icon">✳</span><span><strong>Care, considered.</strong><small>Guidance for your next step</small></span></div>
      </div>
    </section>
  );
}
