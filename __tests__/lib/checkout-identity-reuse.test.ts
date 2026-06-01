import { resolveReusableCheckoutIdentity } from "@/lib/checkout-identity-reuse";
import type { Order } from "@/types";

const order = (overrides: Partial<Order>): Order => ({
  id: "order_current",
  patientId: "patient_1",
  productId: "tirzepatide",
  doseId: "tirzepatide_20mg_8_week",
  status: "draft",
  paymentStatus: "pending",
  pharmacyStatus: "draft",
  practiceQStatus: "pending",
  quickbooksStatus: "pending",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  ...overrides,
});

describe("resolveReusableCheckoutIdentity", () => {
  it("reuses prior verified identity for a returning patient even when reorder metadata is absent", () => {
    const result = resolveReusableCheckoutIdentity({
      patientId: "patient_1",
      currentOrderId: "order_current",
      isReorder: false,
      reorderSourceOrderId: "",
      patientOrders: [
        order({ id: "order_current", identityStatus: "missing" }),
        order({
          id: "order_previous",
          status: "sent_to_pharmacy",
          paymentStatus: "completed",
          pharmacyStatus: "submitted",
          identityStatus: "verified",
          createdAt: "2026-05-31T00:00:00.000Z",
        }),
      ],
    });

    expect(result).toMatchObject({
      reused: true,
      sourceOrderId: "order_previous",
      identityStatus: "verified",
    });
    expect(result.summary).toContain("previous verified order");
  });

  it("does not reuse identity for a brand-new patient without a prior allowed order", () => {
    const result = resolveReusableCheckoutIdentity({
      patientId: "patient_1",
      currentOrderId: "order_current",
      isReorder: false,
      reorderSourceOrderId: "",
      patientOrders: [
        order({ id: "order_current", identityStatus: "missing" }),
        order({
          id: "order_previous",
          status: "pending_review",
          paymentStatus: "completed",
          pharmacyStatus: "draft",
          identityStatus: "missing",
          createdAt: "2026-05-31T00:00:00.000Z",
        }),
      ],
    });

    expect(result.reused).toBe(false);
  });

  it("reuses an owned explicit reorder source without requiring a new upload", () => {
    const result = resolveReusableCheckoutIdentity({
      patientId: "patient_1",
      currentOrderId: "order_current",
      isReorder: true,
      reorderSourceOrderId: "order_source",
      patientOrders: [
        order({ id: "order_current", identityStatus: "missing" }),
        order({
          id: "order_source",
          status: "approved",
          paymentStatus: "completed",
          pharmacyStatus: "draft",
          identityStatus: "missing",
          createdAt: "2026-05-31T00:00:00.000Z",
        }),
      ],
    });

    expect(result).toMatchObject({
      reused: true,
      sourceOrderId: "order_source",
      identityStatus: "manual_approved",
    });
  });
});
