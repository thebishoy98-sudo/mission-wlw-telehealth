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

    const source = `${hero}\n${pricingCards}\n${retatrutideModal}`;

    expect(source).not.toContain("Licensed 503B Pharmacy");
    expect(source).not.toMatch(/503B\s+compounded Retatrutide/);
    expect(source).not.toContain("Licensed 503B compounding pharmacy");
    expect(source).toContain("US-Based Pharmacy");
  });
});
