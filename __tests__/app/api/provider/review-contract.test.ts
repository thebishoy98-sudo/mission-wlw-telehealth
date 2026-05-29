import fs from "fs";
import path from "path";

describe("provider review route", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/provider/review/route.ts"), "utf8");

  it("retries completed PracticeQ jobs after provider approval when identity is already approved", () => {
    expect(source).toContain("getIdentityGate(dispatchOrder).canDispatch");
    expect(source).toContain("shouldRetryPracticeQCompletionAfterIdentityApproval(dispatchOrder)");
    expect(source).toContain("dbServer.practiceqAutomationJobDb.getByOrder(orderId)");
    expect(source).toContain("completePracticeQSession(job.id)");
  });

  it("marks provider-approved charts as viewed separately from identity verification", () => {
    expect(source).toContain("chartViewedAt: now");
    expect(source).toContain("chartViewedBy: reviewedBy");
    expect(source).toContain("identityReviewRequired: false");
  });
});
