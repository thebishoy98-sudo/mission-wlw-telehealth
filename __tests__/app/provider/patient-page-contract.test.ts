import fs from "fs";
import path from "path";

describe("provider patient page", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/provider/patients/[id]/page.tsx"), "utf8");

  it("does not render chart review audit UI", () => {
    expect(source).not.toContain("Chart Review Audit");
    expect(source).not.toContain("Mark Chart as Reviewed");
    expect(source).not.toContain("chartMarkedViewed");
  });

  it("does not render payment or pharmacy fulfillment details in the provider chart sidebar", () => {
    expect(source).not.toContain("Card ending");
    expect(source).not.toContain("LifeFile ID");
    expect(source).not.toContain("Sent to Pharmacy");
    expect(source).not.toContain("No manual action required");
  });
});
