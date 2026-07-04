import {
  buildPriorMedUploadUrl,
  createPriorMedUploadToken,
  getPriorMedGate,
  getStartingDoseId,
  isStartingDose,
  patientHasEstablishedHistory,
  requiresPriorMedProof,
} from "@/lib/prior-med";
import { tirzepatideProduct, semaglutideProduct } from "@/data/products";
import type { Order } from "@/types";

describe("prior-med gate", () => {
  it("identifies the lowest dose as the starting dose (by weekly mg)", () => {
    expect(getStartingDoseId(tirzepatideProduct)).toBe("tirzepatide_20mg_8_week");
    expect(isStartingDose(tirzepatideProduct, "tirzepatide_20mg_8_week")).toBe(true);
    expect(isStartingDose(tirzepatideProduct, "tirzepatide_40mg_8_week")).toBe(false);
    expect(isStartingDose(tirzepatideProduct, "tirzepatide_60mg_8_week")).toBe(false);
  });

  it("falls back to the first dose when weekly mg is absent", () => {
    expect(getStartingDoseId(semaglutideProduct)).toBe("semaglutide_2mg_8_week");
    expect(isStartingDose(semaglutideProduct, "semaglutide_4mg_8_week")).toBe(false);
  });

  it("fails open when product or dose context is missing", () => {
    expect(isStartingDose(null, "anything")).toBe(true);
    expect(isStartingDose(tirzepatideProduct, undefined)).toBe(true);
  });

  it("requires proof for a non-starting dose ordered by a new patient", () => {
    expect(
      requiresPriorMedProof({
        product: tirzepatideProduct,
        doseId: "tirzepatide_40mg_8_week",
        isRefill: false,
        hasEstablishedHistory: false,
      })
    ).toBe(true);
  });

  it("does not require proof for the starting dose", () => {
    expect(
      requiresPriorMedProof({
        product: tirzepatideProduct,
        doseId: "tirzepatide_20mg_8_week",
        isRefill: false,
        hasEstablishedHistory: false,
      })
    ).toBe(false);
  });

  it("exempts refills and established patients", () => {
    expect(
      requiresPriorMedProof({ product: tirzepatideProduct, doseId: "tirzepatide_60mg_8_week", isRefill: true })
    ).toBe(false);
    expect(
      requiresPriorMedProof({
        product: tirzepatideProduct,
        doseId: "tirzepatide_60mg_8_week",
        hasEstablishedHistory: true,
      })
    ).toBe(false);
  });

  it("treats prior dispatched orders as established history", () => {
    const orders = [
      { id: "o1", status: "shipped", pharmacyStatus: "shipped" },
      { id: "o2", status: "pending_review", pharmacyStatus: "draft" },
    ] as Array<Pick<Order, "id" | "status" | "pharmacyStatus">>;
    expect(patientHasEstablishedHistory(orders)).toBe(true);
    expect(patientHasEstablishedHistory(orders, "o1")).toBe(false); // exclude the only dispatched one
    expect(patientHasEstablishedHistory([{ id: "o2", status: "pending_review", pharmacyStatus: "draft" }])).toBe(false);
  });

  it("gates dispatch on prior-med status", () => {
    expect(getPriorMedGate({}).canDispatch).toBe(true); // undefined = no gate
    expect(getPriorMedGate({ priorMedStatus: "not_required" }).canDispatch).toBe(true);
    expect(getPriorMedGate({ priorMedStatus: "approved" }).canDispatch).toBe(true);
    expect(getPriorMedGate({ priorMedStatus: "pending_upload" }).canDispatch).toBe(false);
    expect(getPriorMedGate({ priorMedStatus: "submitted" }).canDispatch).toBe(false);
    expect(getPriorMedGate({ priorMedStatus: "rejected" }).canDispatch).toBe(false);
  });

  it("creates opaque upload tokens and URLs", () => {
    expect(createPriorMedUploadToken("o1")).toMatch(/^rx_o1_/);
    expect(buildPriorMedUploadUrl("https://example.com/", "rx_123")).toBe(
      "https://example.com/upload-prescription/rx_123"
    );
  });
});
