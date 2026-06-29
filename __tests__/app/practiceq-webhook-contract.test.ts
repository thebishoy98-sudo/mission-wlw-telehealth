import fs from "fs";
import path from "path";

describe("PracticeQ webhook dispatch contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/webhooks/practiceq/route.ts"), "utf8");

  it("preserves an existing pharmacy dispatch when PracticeQ approves the chart", () => {
    expect(source).toContain("const preservePharmacyState");
    expect(source).toContain("...(preservePharmacyState");
    expect(source).toContain('status: "approved" as const');
    expect(source).toContain('pharmacyStatus: "draft" as const');
    expect(source).not.toContain("const approvalUpdate = {\n        status:");
    expect(source).toContain('pharmacyUpdate = { status: "sent_to_pharmacy" as const, pharmacyStatus: "submitted" as const }');
    expect(source).toContain('pharmacyErrorUpdate = { status: "approved" as const, pharmacyStatus: "error" as const }');
  });

  it("passes server-resolved patient and product data into production pharmacy dispatch", () => {
    expect(source).toContain("normalizeOrderForPharmacyDispatch(order, product");
    expect(source).toContain("pharmacy.createPharmacyOrder(normalized.normalizedOrder, { patient, product })");
  });
});
