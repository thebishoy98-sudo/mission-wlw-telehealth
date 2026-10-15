import { pageContent } from './content';

export function StepsSection() {
  return (
    <section className="steps-section section-pad" id="how-it-works">
      <div className="section-wrap">
        <div className="section-heading centered">
          <div className="section-kicker">Your next steps</div>
          <h2>{pageContent.stepsTitle}</h2>
          <p>{pageContent.stepsDescription}</p>
        </div>
        <div className="steps-grid">
          {pageContent.steps.map((step) => (
            <article className="step-card" key={step.number}>
              <div className="step-top"><span className="step-number">{step.number}</span><span className="step-line" /></div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
