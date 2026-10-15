import { pageContent } from './content';

export function SupervisionSection() {
  return (
    <section className="supervision section-pad" id="why-supervision">
      <div className="section-wrap supervision-layout">
        <div className="supervision-intro">
          <div className="section-kicker light-kicker">The Mission approach</div>
          <h2>{pageContent.supervisionTitle}</h2>
          <p>{pageContent.supervisionDescription}</p>
          <div className="supervision-signoff"><span className="signoff-mark">M</span><span>Wellness, with you in mind.</span></div>
        </div>
        <div className="supervision-list">
          {pageContent.supervisionPoints.map((point, index) => (
            <article className="supervision-point" key={point.title}>
              <span className="point-index">0{index + 1}</span>
              <div><h3>{point.title}</h3><p>{point.description}</p></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
