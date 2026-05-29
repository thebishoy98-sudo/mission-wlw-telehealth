import fs from "fs";
import path from "path";
import { waitForPracticeQCompletedStatus } from "@/services/practiceq-worker";

jest.mock("playwright", () => ({
  chromium: {
    launch: jest.fn(),
  },
}));

jest.mock("@/lib/db.server", () => ({
  orderDb: {},
  patientDb: {},
  answerDb: {},
  questionDb: {},
  consentDb: {},
  uploadDb: {},
  practiceqAutomationJobDb: {},
}));

jest.mock("@/services/practiceq", () => ({
  getIntakeById: jest.fn(),
  getIntakeSummaryFeed: jest.fn(),
  markPracticeQIntakeCompletedViaApi: jest.fn(),
  populateAndUpdatePracticeQIntake: jest.fn(),
}));

describe("PracticeQ remote worker resilience", () => {
  const workerSource = fs.readFileSync(path.join(process.cwd(), "services/practiceq-worker.ts"), "utf8");
  const dbSource = fs.readFileSync(path.join(process.cwd(), "lib/db.server.ts"), "utf8");

  it("allows enough time for IntakeQ Angular pages with many visible fields", () => {
    expect(workerSource).toContain("PRACTICEQ_PAGE_FILL_TIMEOUT_MS");
    expect(workerSource).toContain("PRACTICEQ_CONSENT_TIMEOUT_MS");
    expect(workerSource).toContain("45000");
    expect(workerSource).toContain("60000");
    expect(workerSource).not.toContain("PracticeQ text field fill step timed out.\")\n    );");
  });

  it("requeues stale running jobs after a Render restart or SIGTERM", () => {
    expect(dbSource).toContain("locked_at < NOW() - INTERVAL '10 minutes'");
    expect(dbSource).toContain("status = 'running'");
  });

  it("uploads the patient identity video to IntakeQ hidden file inputs", () => {
    expect(workerSource).toContain('u.type === "selfie_video"');
    expect(workerSource).toContain("uploadPracticeQFile");
    expect(workerSource).toContain("10000");
    expect(workerSource).not.toContain("fileInput.isVisible");
    expect(workerSource).toContain("question?.Attachments");
  });

  it("reads IntakeQ prompts from ancestor headings for standalone text inputs", () => {
    expect(workerSource).toContain('querySelector?.("h1,h2,h3,h4,h5,h6,label")');
  });

  it("does not let PracticeQ API verification hang after browser submit succeeds", () => {
    expect(workerSource).toContain("PRACTICEQ_API_VERIFY_TIMEOUT_MS");
    expect(workerSource).toContain("PracticeQ API verification timed out.");
    expect(workerSource).toContain("answer backfill timed out.");
    expect(workerSource).toContain("PracticeQ browser submit finished, but the submitted intake could not be found through the PracticeQ API.");
    expect(workerSource).toContain('status: "failed",\n      error: "PracticeQ browser submit finished');
  });

  it("allows the real IntakeQ none option to be clicked when configured", () => {
    expect(workerSource).not.toContain("none apply to me)$/i.test(value)) continue");
  });

  it("can optionally mark fully answered PracticeQ admin forms as completed", () => {
    expect(workerSource).toContain("PRACTICEQ_ADMIN_COMPLETE_TIMEOUT_MS");
    expect(workerSource).toContain("PRACTICEQ_ADMIN_SET_COMPLETED");
    expect(workerSource).toContain("PRACTICEQ_ADMIN_STORAGE_STATE");
    expect(workerSource).toContain("PRACTICEQ_ADMIN_EMAIL");
    expect(workerSource).toMatch(/set\\s\+as\\s\+completed/i);
  });

  it("does not report completion when PracticeQ admin completion fails", () => {
    expect(workerSource).toContain("PracticeQ admin Set as Completed failed");
  });

  it("tries PracticeQ API completion before falling back to admin Set as Completed", () => {
    const apiCompletionIndex = workerSource.indexOf("markPracticeQIntakeCompletedViaApi(");
    const adminCompletionIndex = workerSource.indexOf("setPracticeQIntakeCompletedInAdmin(");

    expect(apiCompletionIndex).toBeGreaterThanOrEqual(0);
    expect(adminCompletionIndex).toBeGreaterThan(apiCompletionIndex);
  });

  it("logs into PracticeQ admin from a clean browser before marking completion", () => {
    expect(workerSource).toContain("https://intakeq.com/signin/");
    expect(workerSource).toContain(".col-md-2.hidden-print");
    expect(workerSource).toContain(".modal-dialog button");
  });

  it("uses the exact PracticeQ Set as Completed admin action selector", () => {
    expect(workerSource).toContain('title="Change the status of this form to Completed"');
    expect(workerSource).toContain('ng-click="setAsCompleted()"');
  });

  it("enters the IntakeQ intro page before filling questions", () => {
    expect(workerSource).toContain("resolvePracticeQIntroPage");
    expect(workerSource).toContain("fill\\s+this\\s+out\\s+by\\s+hand");
  });

  it("polls PracticeQ after admin Set as Completed before failing the job", async () => {
    const fetchIntake = jest
      .fn()
      .mockResolvedValueOnce({ Status: "Draft" })
      .mockResolvedValueOnce({ Status: "Completed" });

    await expect(
      waitForPracticeQCompletedStatus("intake_1", fetchIntake, {
        attempts: 2,
        delayMs: 1,
      })
    ).resolves.toBe(true);

    expect(fetchIntake).toHaveBeenCalledTimes(2);
    expect(fetchIntake).toHaveBeenCalledWith("intake_1");
  });
});
