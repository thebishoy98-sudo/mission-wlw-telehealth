"use client";
import { FadeUp } from "./FadeUp";

const STORIES = [
  {
    initials: "SM",
    name: "Sarah M.",
    location: "Florida",
    before: 268,
    after: 216,
    months: 7,
    medication: "Tirzepatide",
    quote:
      "I had tried every diet under the sun. Within 8 weeks on Tirzepatide I stopped craving junk food entirely. My provider was so attentive and adjusted my dose twice to keep me on track.",
    stars: 5,
  },
  {
    initials: "DK",
    name: "David K.",
    location: "Texas",
    before: 312,
    after: 247,
    months: 9,
    medication: "Tirzepatide",
    quote:
      "As a type-2 diabetic, I was skeptical. Not only did I lose 65 lbs, my A1C dropped from 8.1 to 5.9. My doctor was shocked. Mission WLW changed my life.",
    stars: 5,
  },
  {
    initials: "JL",
    name: "Jennifer L.",
    location: "California",
    before: 198,
    after: 162,
    months: 5,
    medication: "Semaglutide",
    quote:
      "The process was incredibly easy. Intake took 10 minutes, I had a consultation the same day, and my medication arrived 4 days later. Down 36 lbs and feeling incredible.",
    stars: 5,
  },
  {
    initials: "MR",
    name: "Marcus R.",
    location: "Georgia",
    before: 285,
    after: 218,
    months: 8,
    medication: "Retatrutide",
    quote:
      "I switched from Tirzepatide to Retatrutide after hearing it was new. The difference was noticeable within 3 weeks. My cravings dropped to basically zero. 67 lbs in 8 months is something I thought was impossible.",
    stars: 5,
  },
  {
    initials: "TC",
    name: "Tanya C.",
    location: "Ohio",
    before: 241,
    after: 194,
    months: 6,
    medication: "Tirzepatide",
    quote:
      "I tried Ozempic through another platform and it did nothing for me. Switched to Mission WLW and Tirzepatide and it was night and day. The provider actually read my chart and customized my dose.",
    stars: 5,
  },
  {
    initials: "PG",
    name: "Patricia G.",
    location: "New York",
    before: 223,
    after: 178,
    months: 7,
    medication: "Retatrutide",
    quote:
      "At 54, I had given up on losing the weight I had carried for 15 years. Retatrutide through Mission WLW gave me my confidence back. The support and check-ins made all the difference.",
    stars: 5,
  },
];

const BG_COLORS = [
  "bg-forest-800",
  "bg-forest-700",
  "bg-red-700",
  "bg-forest-800",
  "bg-forest-700",
  "bg-red-700",
];

export function Testimonials() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp className="text-center mb-12 sm:mb-16">
          <span className="text-[11px] font-bold uppercase tracking-widest text-forest-700 mb-3 block">
            Success Stories
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-forest-800 tracking-tight mb-4">
            Real People. Real Results.
          </h2>
          <p className="text-gray-600 max-w-xl mx-auto text-base sm:text-lg">
            Genuine patient outcomes from Mission WLW members.
          </p>
        </FadeUp>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {STORIES.map((s, i) => (
            <FadeUp key={s.name} delay={i * 0.07}>
              <div className="bg-cream-100 rounded-2xl p-6 h-full flex flex-col">
                {/* Stars */}
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: s.stars }).map((_, j) => (
                    <svg key={j} className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                  <span className="ml-2 text-[10px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                    {s.medication}
                  </span>
                </div>

                <blockquote className="text-sm sm:text-base text-gray-700 leading-relaxed mb-6 flex-1 italic">
                  &ldquo;{s.quote}&rdquo;
                </blockquote>

                {/* Before / After */}
                <div className="bg-white rounded-xl p-4 mb-4 flex items-center justify-between">
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-0.5">Before</div>
                    <div className="text-lg font-bold text-gray-700">{s.before} lbs</div>
                  </div>
                  <div className="text-gray-300 text-lg font-light">to</div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-0.5">After</div>
                    <div className="text-lg font-bold text-forest-800">{s.after} lbs</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-0.5">In</div>
                    <div className="text-lg font-bold text-forest-700">{s.months} mo.</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full ${BG_COLORS[i]} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                    {s.initials}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{s.name}</div>
                    <div className="text-xs text-gray-400">{s.location}</div>
                  </div>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}
