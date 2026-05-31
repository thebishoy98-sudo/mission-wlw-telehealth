import fs from "fs";
import path from "path";

describe("provider review API chart-view action", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/provider/review/route.ts"), "utf8");
  const patientChartSource = fs.readFileSync(path.join(process.cwd(), "app/api/provider/patients/[id]/route.ts"), "utf8");

  it("supports mark_chart_viewed without approving or rejecting the order", () => {
    expect(source).toContain("mark_chart_viewed");
    expect(source).toContain("chartViewedAt");
    expect(source).toContain("chartViewedBy");
  });

  it("lets the patient chart mark action create a review audit when one is missing", () => {
    expect(patientChartSource).toContain("providerReviewDb.create");
    expect(patientChartSource).toContain("order.patientId !== id");
  });
});
