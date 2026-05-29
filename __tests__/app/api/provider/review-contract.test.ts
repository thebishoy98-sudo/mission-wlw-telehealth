import fs from "fs";
import path from "path";

describe("provider review route", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/provider/review/route.ts"), "utf8");

  it("does not perform identity approval or pharmacy dispatch from provider approval", () => {
    expect(source).not.toContain("getIdentityGate(");
    expect(source).not.toContain("shouldRetryPracticeQCompletionAfterIdentityApproval");
    expect(source).not.toContain("completePracticeQSession");
    expect(source).not.toContain("identityReviewRequired: false");
  });

  it("marks provider-approved charts as viewed separately from identity verification", () => {
    expect(source).toContain("chartViewedAt: now");
    expect(source).toContain("chartViewedBy: reviewedBy");
    expect(source).not.toContain("identityReviewRequired: false");
  });
});
