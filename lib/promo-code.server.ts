import { sql } from "@/lib/db.server";

export type PromoValidation =
  | { valid: true; id: string; code: string; discountAmount: number }
  | { valid: false; error: string };

export async function validatePromoCode(codeInput: string, baseAmount: number): Promise<PromoValidation> {
  const code = codeInput.trim().toUpperCase();
  if (!code || !Number.isFinite(baseAmount) || baseAmount <= 0) {
    return { valid: false, error: "Invalid discount code." };
  }
  const { rows } = await sql`
    SELECT id, code, type, amount, active, max_uses, uses, expires_at
    FROM promo_codes
    WHERE UPPER(code) = ${code}
    LIMIT 1
  `.catch(() => ({ rows: [] as any[] }));
  const promo = rows[0];
  if (!promo || !promo.active) return { valid: false, error: "Invalid discount code." };
  if (promo.expires_at && new Date(promo.expires_at).getTime() <= Date.now()) {
    return { valid: false, error: "This discount code has expired." };
  }
  if (promo.max_uses != null && Number(promo.uses) >= Number(promo.max_uses)) {
    return { valid: false, error: "This discount code has reached its usage limit." };
  }
  const amount = Number(promo.amount);
  const rawDiscount = promo.type === "percent" ? baseAmount * amount / 100 : amount;
  const discountAmount = Math.min(baseAmount, Math.round((rawDiscount + Number.EPSILON) * 100) / 100);
  if (!Number.isFinite(discountAmount) || discountAmount <= 0) {
    return { valid: false, error: "Invalid discount code." };
  }
  return { valid: true, id: promo.id, code: promo.code, discountAmount };
}

export async function consumePromoCode(id: string): Promise<void> {
  await sql`
    UPDATE promo_codes
    SET uses = uses + 1
    WHERE id = ${id}
      AND active = TRUE
      AND (max_uses IS NULL OR uses < max_uses)
  `;
}
