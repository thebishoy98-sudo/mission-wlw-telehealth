/** @jest-environment node */
import fs from "fs";

describe("database promo code contract", () => {
  const page = fs.readFileSync("app/start/payment/page.tsx", "utf8");
  const charge = fs.readFileSync("app/api/payments/charge/route.ts", "utf8");
  const validator = fs.readFileSync("lib/promo-code.server.ts", "utf8");

  it("contains no hardcoded promo-code maps", () => {
    expect(page).not.toContain("PROMO_CODES");
    expect(charge).not.toContain("DISCOUNT_CODES");
    expect(page).toContain("/api/promo-codes/validate");
  });

  it("revalidates against the database and consumes usage after payment", () => {
    expect(charge).toContain("validatePromoCode");
    expect(charge).toContain("consumePromoCode");
    expect(validator).toContain("WHERE UPPER(code)");
    expect(validator).toContain("max_uses");
    expect(validator).toContain("expires_at");
  });

  it("submits the undiscounted amount so the server discounts once", () => {
    expect(page).toContain("amount: baseTotal");
    expect(page).not.toContain("amount: total,");
  });
});
