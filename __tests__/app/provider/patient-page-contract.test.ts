import fs from "fs";
import path from "path";

describe("provider patient page", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/provider/patients/[id]/page.tsx"), "utf8");

  it("renders chart review audit UI separately from identity verification", () => {
    expect(source).toContain("Chart Review Audit");
    expect(source).toContain("Mark Chart as Reviewed");
    expect(source).toContain("mark_chart_viewed");
    expect(source).toContain("api/provider/patients");
  });

  it("does not render payment or pharmacy fulfillment details in the provider chart sidebar", () => {
    expect(source).not.toContain("Card ending");
    expect(source).not.toContain("LifeFile ID");
    expect(source).not.toContain("Sent to Pharmacy");
    expect(source).not.toContain("No manual action required");
  });

  it("does not call pharmacy dispatch from approval until PracticeQ is ready", () => {
    expect(source).toContain("canDispatchPharmacy");
    expect(source).toContain('practiceQStatus === "completed"');
    expect(source).toContain('practiceQStatus === "submitted"');
    expect(source).toMatch(/if \(!canDispatchPharmacy\)/);
  });
});
