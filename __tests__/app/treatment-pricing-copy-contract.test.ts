import fs from "fs";
import path from "path";

describe("treatment pricing copy", () => {
  const startInfoSource = fs.readFileSync(path.join(process.cwd(), "app/start/info/page.tsx"), "utf8");
  const pricingCardsSource = fs.readFileSync(path.join(process.cwd(), "components/landing/PricingCards.tsx"), "utf8");
  const paymentSource = fs.readFileSync(path.join(process.cwd(), "app/start/payment/page.tsx"), "utf8");
  const faqSource = fs.readFileSync(path.join(process.cwd(), "components/landing/LandingFaq.tsx"), "utf8");
  const heroSource = fs.readFileSync(path.join(process.cwd(), "components/landing/Hero.tsx"), "utf8");
  const stickyCtaSource = fs.readFileSync(path.join(process.cwd(), "components/landing/StickyCtaBar.tsx"), "utf8");

  it("shows start treatment cards as 4-week treatment advertising prices", () => {
    expect(startInfoSource).toContain("formatCurrency(p.startingPrice / 2)");
    expect(startInfoSource).toContain("/ 4-week treatment");
    expect(startInfoSource).not.toContain("fromMonthly");
    expect(startInfoSource).not.toContain(">/mo<");
  });

  it("advertises public Retatrutide pricing as half-price 4-week treatment", () => {
    expect(pricingCardsSource).toContain("fromTreatment: 162.5");
    expect(pricingCardsSource).not.toContain("fromMonthly: 250");
    expect(pricingCardsSource).not.toContain("/ month");
    expect(paymentSource).toContain("From $162.50 per 4-week treatment.");
    expect(faqSource).toContain("Retatrutide starts at $162.50");
    expect(faqSource).not.toContain("$499 and above for Retatrutide");
  });

  it("does not advertise monthly landing prices for 4-week treatment programs", () => {
    expect(heroSource).toContain("From $149.50 / 4-week treatment");
    expect(stickyCtaSource).toContain("From $149.50 / 4-week treatment");
    expect(heroSource).not.toContain("/ month");
    expect(stickyCtaSource).not.toContain("/month");
  });
});
