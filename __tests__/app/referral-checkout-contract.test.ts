import fs from "fs";

describe("referral checkout contract", () => {
  const charge = fs.readFileSync("app/api/payments/charge/route.ts", "utf8");
  const paymentPage = fs.readFileSync("app/start/payment/page.tsx", "utf8");

  it("calculates referral eligibility and owned credit from the canonical patient", () => {
    const patientIndex = charge.indexOf('return NextResponse.json({ error: "Patient not found"');
    const offerIndex = charge.indexOf("getReferralOffer(");
    const balanceIndex = charge.indexOf("getReferralBalance(");
    const pricingIndex = charge.indexOf("calculateReferralPricing(", balanceIndex);

    expect(patientIndex).toBeGreaterThan(-1);
    expect(offerIndex).toBeGreaterThan(patientIndex);
    expect(balanceIndex).toBeGreaterThan(patientIndex);
    expect(pricingIndex).toBeGreaterThan(balanceIndex);
    expect(charge).toContain("order.refCode");
  });

  it("uses only the winning promo or referral discount", () => {
    expect(charge).toContain('pricing.discountSource === "promo"');
    expect(charge).toContain('pricing.discountSource === "referral"');
    expect(charge).toContain("validatedPromoId =");
  });

  it("earns and spends referral credit only after payment persistence", () => {
    const paymentIndex = charge.indexOf('"payment create"');
    const rewardIndex = charge.indexOf("recordReferralReward(");
    const spendIndex = charge.indexOf("recordReferralCreditSpend(");

    expect(rewardIndex).toBeGreaterThan(paymentIndex);
    expect(spendIndex).toBeGreaterThan(paymentIndex);
  });

  it("submits the captured referral code and displays server pricing in the response", () => {
    expect(paymentPage).toContain("refCode: intakeState.refCode");
    expect(charge).toContain("referralDiscount:");
    expect(charge).toContain("creditApplied:");
  });
});
