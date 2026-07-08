import { calculateReferralPricing } from "@/lib/referral-pricing";

describe("calculateReferralPricing", () => {
  it("uses the promo when it is larger than the referral discount", () => {
    expect(calculateReferralPricing({
      baseAmount: 299,
      promoDiscount: 75,
      referralDiscount: 50,
      availableCredit: 0,
    })).toEqual({
      discountSource: "promo",
      discountAmount: 75,
      creditApplied: 0,
      chargeAmount: 224,
    });
  });

  it("uses the referral when it is at least as large as the promo", () => {
    expect(calculateReferralPricing({
      baseAmount: 299,
      promoDiscount: 50,
      referralDiscount: 50,
      availableCredit: 0,
    })).toEqual({
      discountSource: "referral",
      discountAmount: 50,
      creditApplied: 0,
      chargeAmount: 249,
    });
  });

  it("applies owned credit after the winning acquisition discount", () => {
    expect(calculateReferralPricing({
      baseAmount: 299,
      promoDiscount: 25,
      referralDiscount: 50,
      availableCredit: 80,
    })).toEqual({
      discountSource: "referral",
      discountAmount: 50,
      creditApplied: 80,
      chargeAmount: 169,
    });
  });

  it("preserves the payment floor and leaves excess credit unspent", () => {
    expect(calculateReferralPricing({
      baseAmount: 40,
      referralDiscount: 0,
      promoDiscount: 0,
      availableCredit: 50,
    })).toEqual({
      discountSource: null,
      discountAmount: 0,
      creditApplied: 39.5,
      chargeAmount: 0.5,
    });
  });

  it("allows a full promo discount to produce a comped zero-dollar checkout", () => {
    expect(calculateReferralPricing({
      baseAmount: 455,
      promoDiscount: 455,
      referralDiscount: 0,
      availableCredit: 0,
      minimumCharge: 0,
    })).toEqual({
      discountSource: "promo",
      discountAmount: 455,
      creditApplied: 0,
      chargeAmount: 0,
    });
  });

  it("ignores invalid discounts and balances", () => {
    expect(calculateReferralPricing({
      baseAmount: 100,
      promoDiscount: Number.NaN,
      referralDiscount: -50,
      availableCredit: -10,
    })).toEqual({
      discountSource: null,
      discountAmount: 0,
      creditApplied: 0,
      chargeAmount: 100,
    });
  });
});
