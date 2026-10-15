import { useState } from 'react';
import { pageContent } from './content';

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="faq-section section-pad" id="faq">
      <div className="section-wrap faq-layout">
        <div className="faq-intro">
          <div className="section-kicker">Good to know</div>
          <h2>{pageContent.faqTitle}</h2>
          <p>Clear information can make the first step feel simpler.</p>
          <a href="#about-glp1" className="text-link">Explore the essentials <span aria-hidden="true">↗</span></a>
        </div>
        <div className="faq-list">
          {pageContent.faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            const answerId = `faq-answer-${index}`;
            return (
              <article className={`faq-item${isOpen ? ' is-open' : ''}`} key={faq.question}>
                <h3>
                  <button aria-expanded={isOpen} aria-controls={answerId} onClick={() => setOpenIndex(isOpen ? null : index)}>
                    <span>{faq.question}</span><span className="faq-toggle" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                  </button>
                </h3>
                <div className="faq-answer" id={answerId} hidden={!isOpen}><p>{faq.answer}</p></div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
