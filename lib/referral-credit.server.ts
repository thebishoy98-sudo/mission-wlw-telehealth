import { sql } from "@/lib/db.server";
import { generateId } from "@/lib/utils";

export const PATIENT_REFERRAL_AMOUNT = 50;

export interface ReferralOffer {
  affiliateId: string;
  code: string;
  referrerPatientId: string;
  discountAmount: number;
  creditAmount: number;
}

export interface ReferralRewardInput {
  affiliateId: string;
  referrerPatientId: string;
  referredPatientId: string;
  referredOrderId: string;
  discountAmount: number;
  creditAmount: number;
}

export interface PatientReferral {
  affiliateId: string;
  code: string;
  patientId: string;
}

let schemaReady = false;

export async function ensureReferralCreditSchema(): Promise<void> {
  if (schemaReady) return;
  await sql`ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS patient_id TEXT REFERENCES patients(id)`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliates_patient_referral_owner
    ON affiliates(patient_id)
    WHERE created_by = 'patient-referral' AND patient_id IS NOT NULL
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS referral_redemptions (
      id TEXT PRIMARY KEY,
      affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
      referrer_patient_id TEXT NOT NULL REFERENCES patients(id),
      referred_patient_id TEXT NOT NULL UNIQUE REFERENCES patients(id),
      referred_order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
      discount_amount NUMERIC(10,2) NOT NULL CHECK (discount_amount > 0),
      credit_amount NUMERIC(10,2) NOT NULL CHECK (credit_amount > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS referral_credit_ledger (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      order_id TEXT REFERENCES orders(id),
      redemption_id TEXT REFERENCES referral_redemptions(id),
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earned','spent','reversed')),
      amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_credit_one_earning
    ON referral_credit_ledger(redemption_id)
    WHERE transaction_type = 'earned'
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_credit_one_spend_per_order
    ON referral_credit_ledger(order_id)
    WHERE transaction_type = 'spent'
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_referral_credit_patient
    ON referral_credit_ledger(patient_id, created_at)
  `;
  schemaReady = true;
}

export async function getReferralOffer(
  codeInput: string | null | undefined,
  referredPatientId: string,
  currentOrderId?: string
): Promise<ReferralOffer | null> {
  const code = codeInput?.trim();
  if (!code || !referredPatientId) return null;
  await ensureReferralCreditSchema();

  const { rows } = await sql`
    SELECT
      a.id,
      a.code,
      a.patient_id,
      a.created_by,
      (
        SELECT COUNT(*)
        FROM payments p
        WHERE p.patient_id = ${referredPatientId}
          AND p.status = 'completed'
          AND (${currentOrderId ?? null}::text IS NULL OR p.order_id <> ${currentOrderId ?? null})
      ) AS prior_paid_orders
    FROM affiliates a
    WHERE LOWER(a.code) = LOWER(${code})
      AND a.created_by = 'patient-referral'
      AND a.patient_id IS NOT NULL
    LIMIT 1
  `;
  const affiliate = rows[0];
  if (
    !affiliate ||
    affiliate.patient_id === referredPatientId ||
    Number(affiliate.prior_paid_orders) > 0
  ) {
    return null;
  }

  return {
    affiliateId: String(affiliate.id),
    code: String(affiliate.code),
    referrerPatientId: String(affiliate.patient_id),
    discountAmount: PATIENT_REFERRAL_AMOUNT,
    creditAmount: PATIENT_REFERRAL_AMOUNT,
  };
}

export async function getPatientReferral(patientId: string): Promise<PatientReferral | null> {
  if (!patientId) return null;
  await ensureReferralCreditSchema();
  const { rows } = await sql`
    SELECT id, code, patient_id
    FROM affiliates
    WHERE patient_id = ${patientId}
      AND created_by = 'patient-referral'
    LIMIT 1
  `;
  const referral = rows[0];
  return referral
    ? {
        affiliateId: String(referral.id),
        code: String(referral.code),
        patientId: String(referral.patient_id),
      }
    : null;
}

function referralSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20) || "friend";
}

export async function createOrGetPatientReferral(input: {
  patientId: string;
  displayName: string;
  orderId: string;
}): Promise<PatientReferral> {
  const existing = await getPatientReferral(input.patientId);
  if (existing) return existing;

  const code = `ref-${referralSlug(input.displayName)}-${input.orderId.slice(-5)}`;
  await sql`
    UPDATE affiliates
    SET patient_id = ${input.patientId}
    WHERE LOWER(code) = LOWER(${code})
      AND created_by = 'patient-referral'
      AND patient_id IS NULL
  `;
  await sql`
    INSERT INTO affiliates (id, code, name, patient_id, created_by)
    VALUES (
      ${generateId()}, ${code}, ${`${input.displayName} (Referral)`},
      ${input.patientId}, 'patient-referral'
    )
    ON CONFLICT DO NOTHING
  `;
  const created = await getPatientReferral(input.patientId);
  if (!created) throw new Error("Could not create patient referral.");
  return created;
}

export async function getReferralBalance(patientId: string): Promise<number> {
  if (!patientId) return 0;
  await ensureReferralCreditSchema();
  const { rows } = await sql`
    SELECT COALESCE(SUM(
      CASE
        WHEN transaction_type = 'earned' THEN amount
        WHEN transaction_type IN ('spent', 'reversed') THEN -amount
        ELSE 0
      END
    ), 0) AS balance
    FROM referral_credit_ledger
    WHERE patient_id = ${patientId}
  `;
  const balance = Number(rows[0]?.balance ?? 0);
  return Number.isFinite(balance) ? Math.max(0, balance) : 0;
}

export async function recordReferralReward(input: ReferralRewardInput): Promise<boolean> {
  if (
    !input.affiliateId ||
    !input.referrerPatientId ||
    !input.referredPatientId ||
    !input.referredOrderId ||
    input.referrerPatientId === input.referredPatientId ||
    input.discountAmount <= 0 ||
    input.creditAmount <= 0
  ) {
    return false;
  }
  await ensureReferralCreditSchema();
  const redemptionId = generateId();
  const ledgerId = generateId();
  const { rows } = await sql`
    WITH inserted_redemption AS (
      INSERT INTO referral_redemptions (
        id, affiliate_id, referrer_patient_id, referred_patient_id,
        referred_order_id, discount_amount, credit_amount
      )
      VALUES (
        ${redemptionId}, ${input.affiliateId}, ${input.referrerPatientId},
        ${input.referredPatientId}, ${input.referredOrderId},
        ${input.discountAmount}, ${input.creditAmount}
      )
      ON CONFLICT DO NOTHING
      RETURNING id, referrer_patient_id, referred_order_id, credit_amount
    ),
    inserted_credit AS (
      INSERT INTO referral_credit_ledger (
        id, patient_id, order_id, redemption_id, transaction_type, amount
      )
      SELECT
        ${ledgerId}, referrer_patient_id, referred_order_id, id, 'earned', credit_amount
      FROM inserted_redemption
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT id FROM inserted_credit
  `;
  return rows.length > 0;
}

export async function recordReferralCreditSpend(input: {
  patientId: string;
  orderId: string;
  amount: number;
}): Promise<boolean> {
  if (
    !input.patientId ||
    !input.orderId ||
    !Number.isFinite(input.amount) ||
    input.amount <= 0
  ) {
    return false;
  }
  await ensureReferralCreditSchema();
  const amount = Math.round((input.amount + Number.EPSILON) * 100) / 100;
  const { rows } = await sql`
    WITH patient_lock AS (
      SELECT pg_advisory_xact_lock(hashtext(${input.patientId}))
    ),
    available AS (
      SELECT COALESCE(SUM(
        CASE
          WHEN transaction_type = 'earned' THEN amount
          WHEN transaction_type IN ('spent', 'reversed') THEN -amount
          ELSE 0
        END
      ), 0) AS balance
      FROM referral_credit_ledger, patient_lock
      WHERE patient_id = ${input.patientId}
    )
    INSERT INTO referral_credit_ledger (
      id, patient_id, order_id, transaction_type, amount
    )
    SELECT ${generateId()}, ${input.patientId}, ${input.orderId}, 'spent', ${amount}
    FROM available
    WHERE balance >= ${amount}
    ON CONFLICT (order_id) WHERE transaction_type = 'spent' DO NOTHING
    RETURNING id
  `;
  return rows.length > 0;
}
