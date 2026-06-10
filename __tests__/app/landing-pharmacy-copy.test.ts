import { readFileSync } from "fs";
import path from "path";

describe("landing pharmacy copy", () => {
  it("uses US-based pharmacy copy instead of Licensed 503B Pharmacy labels", () => {
    const hero = readFileSync(path.join(process.cwd(), "components", "landing", "Hero.tsx"), "utf8");
    const pricingCards = readFileSync(path.join(process.cwd(), "components", "landing", "PricingCards.tsx"), "utf8");
    const retatrutideModal = readFileSync(
      path.join(process.cwd(), "components", "landing", "RetatrutideModal.tsx"),
      "utf8"
    );
    const howItWorks = readFileSync(path.join(process.cwd(), "components", "landing", "HowItWorks.tsx"), "utf8");
    const timeline = readFileSync(path.join(process.cwd(), "components", "landing", "Timeline.tsx"), "utf8");
    const lifestyle = readFileSync(path.join(process.cwd(), "components", "landing", "LifestyleSection.tsx"), "utf8");
    const footer = readFileSync(path.join(process.cwd(), "components", "landing", "LandingFooter.tsx"), "utf8");
    const faq = readFileSync(path.join(process.cwd(), "components", "landing", "LandingFaq.tsx"), "utf8");
    const terms = readFileSync(path.join(process.cwd(), "app", "terms", "page.tsx"), "utf8");

    const source = [
      hero,
      pricingCards,
      retatrutideModal,
      howItWorks,
      timeline,
      lifestyle,
      footer,
      faq,
      terms,
    ].join("\n");

    expect(source).not.toContain("Licensed 503B Pharmacy");
    expect(source).not.toMatch(/503B\s+compounded Retatrutide/);
    expect(source).not.toContain("Licensed 503B compounding pharmacy");
    expect(source).not.toContain("503B");
    expect(source).toContain("US-Based Pharmacy");
    expect(source).toContain("US-based pharmacy");
  });
});
