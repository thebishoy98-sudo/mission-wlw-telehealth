import { findPracticeQOrderMatch } from "@/lib/practiceq-order-link";
import type { Order, PracticeQFormSummary } from "@/types";

const order = (overrides: Partial<Order>): Order => ({
  id: "order_1",
  patientId: "patient_1",
  productId: "product_1",
  doseId: "dose_1",
  status: "pending_review",
  paymentStatus: "completed",
  pharmacyStatus: "draft",
  practiceQStatus: "completed",
  quickbooksStatus: "pending",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const form = (overrides: Partial<PracticeQFormSummary>): PracticeQFormSummary => ({
  id: "intake_1",
  status: "Completed",
  practiceQUrl: "https://intakeq.com/#/history/intake_1",
  ...overrides,
});

describe("findPracticeQOrderMatch", () => {
  it("matches a PracticeQ form to an order by external order id first", () => {
    const result = findPracticeQOrderMatch(
      form({ externalClientId: "order_2", clientId: "client_1" }),
      [
        order({ id: "order_1", patientId: "wrong", practiceqClientId: "client_1" }),
        order({ id: "order_2", patientId: "right" }),
      ]
    );

    expect(result?.patientId).toBe("right");
  });

  it("falls back to PracticeQ client id when no external order id matches", () => {
    const result = findPracticeQOrderMatch(
      form({ clientId: "client_1" }),
      [order({ id: "order_1", patientId: "patient_1", practiceqClientId: "client_1" })]
    );

    expect(result?.id).toBe("order_1");
  });

  it("returns null for unlinked PracticeQ forms", () => {
    const result = findPracticeQOrderMatch(
      form({ externalClientId: "missing", clientId: "client_missing" }),
      [order({ id: "order_1", practiceqClientId: "client_1" })]
    );

    expect(result).toBeNull();
  });
});
