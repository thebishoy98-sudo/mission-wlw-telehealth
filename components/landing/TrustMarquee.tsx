"use client";

const ITEMS = [
  "✓ HIPAA Compliant",
  "✓ Board-Certified Providers",
  "✓ FDA-Approved Medications",
  "✓ Licensed in 40+ States",
  "✓ Same-Week Consultations",
  "✓ Free Discreet Shipping",
  "✓ 30-Day Satisfaction Guarantee",
  "✓ No Hidden Fees",
  "✓ Cancel Anytime",
  "✓ Real Licensed Pharmacies",
];

// Double items so the seamless loop works
const DOUBLED = [...ITEMS, ...ITEMS];

export function TrustMarquee() {
  return (
    <section className="bg-white border-y border-gray-100 py-4 sm:py-5">
      <div className="marquee-track">
        <div className="marquee-content">
          {DOUBLED.map((item, i) => (
            <span
              key={i}
              className="text-xs sm:text-sm text-gray-500 font-medium mx-6 sm:mx-8 whitespace-nowrap"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
