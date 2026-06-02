"use client";

const REVIEWS = [
  { name: "Maria R.", loc: "Georgia", rating: 5, text: "Down 38 lbs in 5 months. My confidence is back and I actually enjoy exercise now. The provider team is so caring." },
  { name: "Tom B.", loc: "Ohio", rating: 5, text: "Lost 29 lbs without feeling deprived. Semaglutide finally quieted the food noise I've dealt with my whole life." },
  { name: "Lisa C.", loc: "New York", rating: 5, text: "Tried Ozempic from my GP but couldn't afford it. Mission WLW's compounded version works just as well at a fraction of the price." },
  { name: "James W.", loc: "Arizona", rating: 5, text: "52 lbs down in 8 months. My blood pressure normalized, my sleep improved, and I came off two medications. Life-changing." },
  { name: "Priya S.", loc: "Illinois", rating: 5, text: "As a nurse, I was skeptical but the science is clear. Lost 24 lbs in 4 months. Provider checks in every month without fail." },
  { name: "Michael T.", loc: "Nevada", rating: 4, text: "Had mild nausea the first week but it passed. Now in month 4, down 31 lbs. Provider helped me through the adjustment quickly." },
  { name: "Angela D.", loc: "North Carolina", rating: 5, text: "I'm 58 and had given up on losing weight. Mission WLW changed that. Down 44 lbs and shopping for new clothes every month." },
  { name: "Carlos M.", loc: "Colorado", rating: 5, text: "The intake process was super easy. Had my prescription the next day, medication arrived in 3 days. Results speak for themselves." },
];

// Triple for seamless loop
const TRIPLED = [...REVIEWS, ...REVIEWS, ...REVIEWS];

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5 mb-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className={`w-3.5 h-3.5 fill-current ${i < rating ? "text-yellow-400" : "text-gray-200"}`}
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export function ReviewsCarousel() {
  return (
    <section id="reviews" className="bg-white py-16 sm:py-24 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-10 sm:mb-14 text-center">
        <span className="text-[11px] font-bold uppercase tracking-widest text-forest-700 mb-3 block">
          Patient Reviews
        </span>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-forest-800 tracking-tight mb-3">
          What Our Patients Say
        </h2>
        <p className="text-gray-500 text-sm">
          Verified reviews from active Mission WLW patients
        </p>
      </div>

      <div className="reviews-track">
        <div className="reviews-content py-2">
          {TRIPLED.map((r, i) => (
            <div
              key={i}
              className="bg-cream-100 rounded-2xl p-5 flex-shrink-0 w-72 sm:w-80"
            >
              <StarRow rating={r.rating} />
              <p className="text-sm text-gray-700 leading-relaxed mb-4 line-clamp-4">
                &ldquo;{r.text}&rdquo;
              </p>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-forest-800 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {r.name.charAt(0)}
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-800">{r.name}</div>
                  <div className="text-[10px] text-gray-400">{r.loc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
