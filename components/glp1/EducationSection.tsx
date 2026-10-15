import { pageContent } from './content';

export function EducationSection() {
  return (
    <section className="education section-pad" id="about-glp1">
      <div className="section-wrap education-grid">
        <div>
          <div className="section-kicker">The essentials</div>
          <h2>{pageContent.educationTitle}</h2>
        </div>
        <div className="education-copy">
          {pageContent.educationParagraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          <div className="medical-note"><span aria-hidden="true">ⓘ</span><span>Only a qualified healthcare professional can determine whether a medication is appropriate for you.</span></div>
        </div>
      </div>
    </section>
  );
}
