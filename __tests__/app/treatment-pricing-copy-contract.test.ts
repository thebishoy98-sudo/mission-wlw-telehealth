import fs from "fs";
import path from "path";

describe("treatment pricing copy", () => {
  const startInfoSource = fs.readFileSync(path.join(process.cwd(), "app/start/info/page.tsx"), "utf8");
  const pricingCardsSource = fs.readFileSync(path.join(process.cwd(), "components/landing/PricingCards.tsx"), "utf8");
  const paymentSource = fs.readFileSync(path.join(process.cwd(), "app/start/payment/page.tsx"), "utf8");
  const faqSource = fs.readFileSync(path.join(process.cwd(), "components/landing/LandingFaq.tsx"), "utf8");
  const heroSource = fs.readFileSync(path.join(process.cwd(), "components/landing/Hero.tsx"), "utf8");
  const stickyCtaSource = fs.readFileSync(path.join(process.cwd(), "components/landing/StickyCtaBar.tsx"), "utf8");

  it("shows start treatment cards as 8-week supply pricing from the product catalog", () => {
    expect(startInfoSource).toContain("formatCurrency(p.startingPrice)");
    expect(startInfoSource).toContain("/ 8-week supply");
    expect(startInfoSource).not.toContain("fromMonthly");
    expect(startInfoSource).not.toContain(">/mo<");
  });

  it("keeps public Retatrutide pricing aligned to the catalog", () => {
    expect(pricingCardsSource).toContain("fromSupply: 325");
    expect(pricingCardsSource).not.toContain("fromMonthly: 250");
    expect(pricingCardsSource).not.toContain("/ month");
    expect(paymentSource).toContain("From $325 per 8-week supply.");
    expect(faqSource).toContain("Retatrutide starts at $325");
    expect(faqSource).not.toContain("$499 and above for Retatrutide");
  });

  it("does not advertise monthly landing prices for 8-week programs", () => {
    expect(heroSource).toContain("From $299 / 8-week supply");
    expect(stickyCtaSource).toContain("From $299 / 8-week supply");
    expect(heroSource).not.toContain("/ month");
    expect(stickyCtaSource).not.toContain("/month");
  });
});
