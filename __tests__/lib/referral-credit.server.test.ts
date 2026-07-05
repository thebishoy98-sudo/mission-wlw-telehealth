const mockSql = jest.fn();

jest.mock("@/lib/db.server", () => ({
  sql: (...args: unknown[]) => mockSql(...args),
}));

import {
  getReferralBalance,
  getReferralOffer,
  recordReferralReward,
  recordReferralCreditSpend,
} from "@/lib/referral-credit.server";

function queryText(strings: TemplateStringsArray): string {
  return strings.join(" ").replace(/\s+/g, " ").trim();
}

describe("referral credit database service", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const query = queryText(strings);
      if (query.includes("FROM affiliates a")) {
        return Promise.resolve({
          rows: [{
            id: "affiliate-1",
            code: "ref-owner-123",
            patient_id: "owner-1",
            created_by: "patient-referral",
            prior_paid_orders: "0",
          }],
        });
      }
      if (query.includes("AS balance")) return Promise.resolve({ rows: [{ balance: "75.50" }] });
      if (query.includes("inserted_redemption")) return Promise.resolve({ rows: [{ id: "redemption-1" }] });
      if (query.includes("INSERT INTO referral_credit_ledger") && query.includes("'spent'")) {
        return Promise.resolve({ rows: [{ id: "spend-1" }] });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  it("returns the $50 offer for a patient-owned code on a friend's first order", async () => {
    await expect(getReferralOffer(" REF-OWNER-123 ", "friend-1")).resolves.toEqual({
      affiliateId: "affiliate-1",
      code: "ref-owner-123",
      referrerPatientId: "owner-1",
      discountAmount: 50,
      creditAmount: 50,
    });
  });

  it("rejects self-referrals", async () => {
    await expect(getReferralOffer("ref-owner-123", "owner-1")).resolves.toBeNull();
  });

  it("rejects a friend who already has a completed payment", async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const query = queryText(strings);
      if (query.includes("FROM affiliates a")) {
        return Promise.resolve({
          rows: [{
            id: "affiliate-1",
            code: "ref-owner-123",
            patient_id: "owner-1",
            created_by: "patient-referral",
            prior_paid_orders: "1",
          }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(getReferralOffer("ref-owner-123", "friend-1")).resolves.toBeNull();
  });

  it("returns the real ledger balance", async () => {
    await expect(getReferralBalance("owner-1")).resolves.toBe(75.5);
  });

  it("records one atomic redemption and earned-credit event", async () => {
    await expect(recordReferralReward({
      affiliateId: "affiliate-1",
      referrerPatientId: "owner-1",
      referredPatientId: "friend-1",
      referredOrderId: "order-1",
      discountAmount: 50,
      creditAmount: 50,
    })).resolves.toBe(true);

    const rewardQuery = mockSql.mock.calls
      .map(([strings]) => queryText(strings))
      .find((query) => query.includes("inserted_redemption"));
    expect(rewardQuery).toContain("ON CONFLICT DO NOTHING");
    expect(rewardQuery).toContain("INSERT INTO referral_credit_ledger");
  });

  it("records a credit spend idempotently by order", async () => {
    await expect(recordReferralCreditSpend({
      patientId: "owner-1",
      orderId: "order-2",
      amount: 50,
    })).resolves.toBe(true);

    const spendQuery = mockSql.mock.calls
      .map(([strings]) => queryText(strings))
      .find((query) => query.includes("'spent'"));
    expect(spendQuery).toContain("ON CONFLICT");
  });
});
