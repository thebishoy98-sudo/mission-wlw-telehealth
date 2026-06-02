import fs from "fs";
import path from "path";

describe("identity review route contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/identity/review/route.ts"), "utf8");

  it("uses the current identity approval retry path instead of the legacy waiting_identity status", () => {
    expect(source).not.toContain("waiting_identity");
    expect(source).toContain("shouldRetryPracticeQCompletionAfterIdentityApproval");
    expect(source).toContain("completePracticeQSession(job.id)");
    expect(source).not.toContain("createPracticeQAutomationJob");
  });
});
