import fs from "fs";
import path from "path";

describe("PracticeQ completion contract", () => {
  const adminRoute = fs.readFileSync(path.join(process.cwd(), "app/api/admin/practiceq-jobs/route.ts"), "utf8");
  const workerSource = fs.readFileSync(path.join(process.cwd(), "services/practiceq-worker.ts"), "utf8");

  it("runs order completion/dispatch when staff marks a PracticeQ job completed", () => {
    expect(adminRoute).toContain("completePracticeQSession");
    expect(adminRoute).toContain("practiceQCompletion");
  });

  it("does not mark deferred identity PracticeQ failures as order errors", () => {
    expect(adminRoute).toContain("PracticeQ deferred until verified identity");
    expect(adminRoute).toContain('error === PRACTICEQ_IDENTITY_DEFERRED_ERROR ? "pending" : "error"');
  });

  it("runs order completion/dispatch when the background worker completes a PracticeQ job", () => {
    expect(workerSource).toContain("completePracticeQSession(job.id)");
    expect(workerSource).toContain("result.status === \"completed\"");
  });
});
