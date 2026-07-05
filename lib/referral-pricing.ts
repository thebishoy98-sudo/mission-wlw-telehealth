export type ReferralDiscountSource = "promo" | "referral" | null;

export interface ReferralPricingInput {
  baseAmount: number;
  promoDiscount?: number;
  referralDiscount?: number;
  availableCredit?: number;
  minimumCharge?: number;
}

export interface ReferralPricing {
  discountSource: ReferralDiscountSource;
  discountAmount: number;
  creditApplied: number;
  chargeAmount: number;
}

function validMoney(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round((value + Number.EPSILON) * 100) / 100
    : 0;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateReferralPricing(input: ReferralPricingInput): ReferralPricing {
  const baseAmount = validMoney(input.baseAmount);
  const promoDiscount = Math.min(baseAmount, validMoney(input.promoDiscount));
  const referralDiscount = Math.min(baseAmount, validMoney(input.referralDiscount));
  const availableCredit = validMoney(input.availableCredit);
  const minimumCharge = validMoney(input.minimumCharge) || 0.5;

  let discountSource: ReferralDiscountSource = null;
  let discountAmount = 0;
  if (referralDiscount > 0 && referralDiscount >= promoDiscount) {
    discountSource = "referral";
    discountAmount = referralDiscount;
  } else if (promoDiscount > 0) {
    discountSource = "promo";
    discountAmount = promoDiscount;
  }

  const afterDiscount = Math.max(minimumCharge, money(baseAmount - discountAmount));
  const creditCapacity = Math.max(0, money(afterDiscount - minimumCharge));
  const creditApplied = Math.min(availableCredit, creditCapacity);

  return {
    discountSource,
    discountAmount,
    creditApplied,
    chargeAmount: money(afterDiscount - creditApplied),
  };
}
