import fs from "fs";
import path from "path";

describe("identity review route contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/identity/review/route.ts"), "utf8");
  const orchestrationSource = fs.readFileSync(
    path.join(process.cwd(), "services/practiceq-automation-orchestration.ts"),
    "utf8"
  );

  it("uses the current identity approval retry path instead of the legacy waiting_identity status", () => {
    expect(source).not.toContain("waiting_identity");
    expect(source).toContain("resumePracticeQAfterIdentityApproval");
    expect(orchestrationSource).toContain("shouldRetryPracticeQCompletionAfterIdentityApproval");
    expect(orchestrationSource).toContain("completePracticeQSession(job.id)");
    expect(source).not.toContain("createPracticeQAutomationJob");
  });

  it("queues a new PracticeQ job when no prior job exists for the order", () => {
    expect(orchestrationSource).toContain("queuePracticeQAutomationForOrder");
    expect(orchestrationSource).toContain("createPracticeQAutomationJob(order, patient)");
    expect(orchestrationSource).toContain('"queued"');
  });

  it("skips creating a duplicate when the patient already has an active job elsewhere", () => {
    expect(orchestrationSource).toContain("skipped_active_patient_job");
    expect(orchestrationSource).toContain("getActiveByPatient");
  });

  it("requeues a previously failed job rather than creating a new one", () => {
    expect(orchestrationSource).toContain('"requeued"');
    expect(orchestrationSource).toContain('status === "failed"');
  });

  it("wakes the remote worker after queuing a job", () => {
    expect(orchestrationSource).toContain("wakeRemoteWorker()");
    expect(orchestrationSource).toContain("wakePracticeQRemoteWorker");
  });
});
