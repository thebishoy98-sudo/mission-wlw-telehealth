import * as db from "@/lib/db";
import type { PracticeQAutomationJob } from "@/types";

const makeJob = (): PracticeQAutomationJob => ({
  id: "pq_job_1",
  orderId: "order_1",
  patientId: "patient_1",
  status: "queued",
  attempts: 0,
  practiceQStartUrl: "https://intakeq.com/new/yjvht0?Name=Test+Patient&Email=test%40example.com",
  handoffToken: "handoff_secret",
  handoffExpiresAt: "2026-05-27T00:30:00.000Z",
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z",
});

describe("practiceqAutomationJobDb", () => {
  it("stores queued jobs and returns them in queue order", () => {
    const job = db.practiceqAutomationJobDb.create(makeJob());

    expect(job.status).toBe("queued");
    expect(db.practiceqAutomationJobDb.getByOrder("order_1")).toMatchObject({ id: "pq_job_1" });
    expect(db.practiceqAutomationJobDb.getQueued()).toEqual([expect.objectContaining({ id: "pq_job_1" })]);
  });

  it("updates job status without losing handoff details", () => {
    db.practiceqAutomationJobDb.create(makeJob());

    const updated = db.practiceqAutomationJobDb.update("pq_job_1", {
      status: "awaiting_patient_signature",
      handoffUrl: "https://intakeq.com/new/yjvht0",
    });

    expect(updated).toMatchObject({
      status: "awaiting_patient_signature",
      handoffUrl: "https://intakeq.com/new/yjvht0",
    });
    expect(db.practiceqAutomationJobDb.getQueued()).toHaveLength(0);
  });
});
