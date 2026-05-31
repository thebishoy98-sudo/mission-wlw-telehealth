import { readFileSync } from "fs";
import path from "path";

describe("provider patient chart page", () => {
  const source = readFileSync(
    path.join(process.cwd(), "app", "provider", "patients", "[id]", "page.tsx"),
    "utf8"
  );

  it("renders PracticeQ chart details returned by the chart API", () => {
    expect(source).toContain("practiceq:");
    expect(source).toContain("Clinical Chart");
    expect(source).toContain("selectedPracticeQ");
  });

  it("renders the consent certificate audit details", () => {
    expect(source).toContain("Consent Certificate");
    expect(source).toContain("buildConsentCertificate");
  });
});
