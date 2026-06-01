import { formatDoseOptionLabel, resolvePersistedDose } from "@/lib/product-dose";

describe("resolvePersistedDose", () => {
  const persistedProduct = {
    doses: [
      { id: "tirzepatide_20mg_8_week", label: "Tirzepatide 20mg", strength: "20mg vial", price: 349 },
      { id: "tirzepatide_40mg_8_week", label: "Tirzepatide 40mg", strength: "40mg vial", price: 479 },
    ],
  };

  it("falls back by selected dose index when browser-generated dose IDs do not match server IDs", () => {
    const browserProduct = {
      doses: [
        { id: "generated_starter", label: "2.5mg Weekly", strength: "2.5mg", price: 299 },
        { id: "generated_standard", label: "5mg Weekly", strength: "5mg", price: 399 },
      ],
    };

    const dose = resolvePersistedDose(persistedProduct as any, browserProduct as any, "generated_starter");

    expect(dose?.id).toBe("tirzepatide_20mg_8_week");
  });
});

describe("formatDoseOptionLabel", () => {
  it("uses the launch reorder copy with 8-week prescription text and price", () => {
    expect(formatDoseOptionLabel({
      id: "tirzepatide_20mg_8_week",
      label: "Tirzepatide 20mg",
      strength: "20mg vial",
      price: 349,
      patientDescription: "8-Week Prescription",
    } as any)).toBe("Tirzepatide 20mg - 8-Week Prescription - $349.00");
  });
});
