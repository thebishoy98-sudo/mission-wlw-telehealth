import { pageContent } from './content';
import { AssessmentButton } from './AssessmentButton';

export function FinalCtaSection() {
  return (
    <section className="final-cta section-wrap">
      <div className="final-cta-deco" aria-hidden="true">✳</div>
      <div className="final-cta-copy">
        <div className="section-kicker light-kicker">Your path, your pace</div>
        <h2>{pageContent.finalTitle}</h2>
        <p>{pageContent.finalDescription}</p>
      </div>
      <AssessmentButton className="button-light">Start my assessment</AssessmentButton>
    </section>
  );
}
