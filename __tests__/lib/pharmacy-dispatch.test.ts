import { normalizeOrderForPharmacyDispatch, practiceQReadyForPharmacy } from "@/lib/pharmacy-dispatch";
import type { Order, Product } from "@/types";

const product: Product = {
  id: "product_tirzepatide",
  name: "Tirzepatide",
  slug: "tirzepatide",
  description: "",
  startingPrice: 349,
  image: "",
  doses: [
    {
      id: "tirzepatide_20mg_8_week",
      label: "Tirzepatide 20mg",
      price: 349,
      quantity: 1,
      strength: "20mg vial",
      weeklyDoseMg: 2.5,
      durationWeeks: 8,
      injectionUnits: 12.5,
      prescriptionLabel: "Inject 12.5 units weekly.",
      patientDescription: "2.5mg weekly",
    },
    {
      id: "tirzepatide_40mg_8_week",
      label: "Tirzepatide 40mg",
      price: 479,
      quantity: 1,
      strength: "40mg vial",
      weeklyDoseMg: 5,
      durationWeeks: 8,
      injectionUnits: 25,
      prescriptionLabel: "Inject 25 units weekly.",
      patientDescription: "5mg weekly",
    },
  ],
  eligibilityNote: "",
  isActive: true,
  faqs: [],
  createdAt: "2026-01-01T00:00:00.000Z",
};

const order: Order = {
  id: "order_1",
  patientId: "patient_1",
  productId: "product_tirzepatide",
  doseId: "browser_generated_dose",
  status: "approved",
  paymentStatus: "completed",
  pharmacyStatus: "draft",
  practiceQStatus: "submitted",
  quickbooksStatus: "invoiced",
  identityStatus: "verified",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("pharmacy dispatch guards", () => {
  it("does not block pharmacy dispatch on PracticeQ status", () => {
    expect(practiceQReadyForPharmacy({ ...order, practiceQStatus: "pending" })).toBe(true);
    expect(practiceQReadyForPharmacy({ ...order, practiceQStatus: "error" })).toBe(true);
    expect(practiceQReadyForPharmacy({ ...order, practiceQStatus: "submitted" })).toBe(true);
    expect(practiceQReadyForPharmacy({ ...order, practiceQStatus: "completed" })).toBe(true);
  });

  it("repairs an old browser-generated dose id from saved PracticeQ dose text", () => {
    const result = normalizeOrderForPharmacyDispatch(order, product, ["2.5mg Weekly"]);

    expect(result.normalizedOrder?.doseId).toBe("tirzepatide_20mg_8_week");
    expect(result.repaired).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("returns a specific reason when dose cannot be resolved", () => {
    const result = normalizeOrderForPharmacyDispatch(order, product);

    expect(result.normalizedOrder).toBeNull();
    expect(result.reason).toBe("missing dose");
  });
});
