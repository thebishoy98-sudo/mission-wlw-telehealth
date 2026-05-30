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
  const remoteServerSource = fs.readFileSync(path.join(process.cwd(), "scripts/practiceq-remote-server.ts"), "utf8");
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

  it("automatically retries failed form-fill jobs that never submitted an intake", () => {
    expect(dbSource).toContain("status = 'failed' AND intake_id IS NULL AND attempts < 10");
  });

  it("lets the Render worker retry failed admin completion jobs with linked intakes", () => {
    expect(dbSource).toContain("getAdminCompletionRetryCandidates");
    expect(dbSource).toContain("last_error LIKE 'PracticeQ admin Set as Completed failed%'");
    expect(remoteServerSource).toContain("retryFailedAdminCompletionJobs");
    expect(remoteServerSource).toContain("completePracticeQIntakeInAdmin(job.intakeId)");
    expect(remoteServerSource).toContain("completePracticeQSession(job.id)");
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

  it("fails fast with a clear message when required patient vitals are missing from the DB", () => {
    expect(workerSource).toContain("missingVitals");
    expect(workerSource).toContain("Missing required patient vitals for IntakeQ");
    expect(workerSource).toContain("Re-seed answers for orderId=");
    expect(workerSource).toContain("findPracticeQAnswerForPrompt(\"What is your height?\"");
    expect(workerSource).toContain("findPracticeQAnswerForPrompt(\"What is your current body weight?\"");
  });

  it("trusts the browser submit when PRACTICEQ_API_KEY is absent rather than failing the job", () => {
    expect(workerSource).toContain("PRACTICEQ_API_KEY not set — skipping API verification, trusting browser submit.");
    expect(workerSource).toContain("process.env.PRACTICEQ_API_KEY");
  });

  it("does not let PracticeQ API verification hang after browser submit succeeds", () => {
    expect(workerSource).toContain("PRACTICEQ_API_VERIFY_TIMEOUT_MS");
    expect(workerSource).toContain("PracticeQ API verification timed out.");
    expect(workerSource).toContain("answer backfill timed out.");
    expect(workerSource).toContain("PracticeQ browser submit finished, but the submitted intake could not be found through the PracticeQ API.");
    // Use platform-neutral checks (file may have \r\n on Windows, \n on Linux)
    expect(workerSource).toContain('status: "failed",');
    expect(workerSource).toContain('error: "PracticeQ browser submit finished');
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

  it("declares the Render env needed for PracticeQ admin browser completion", () => {
    const renderSource = fs.readFileSync(path.join(process.cwd(), "render.yaml"), "utf8");
    expect(renderSource).toContain("PRACTICEQ_ADMIN_SET_COMPLETED");
    // YAML booleans are unquoted in render.yaml (value: true, not value: "true")
    expect(renderSource).toContain("value: true");
    expect(renderSource).toContain("PRACTICEQ_ADMIN_EMAIL");
    expect(renderSource).toContain("PRACTICEQ_ADMIN_PASSWORD");
    expect(renderSource).toContain("PRACTICEQ_ADMIN_STORAGE_STATE_JSON");
  });

  it("does not report completion when PracticeQ admin completion fails", () => {
    expect(workerSource).toContain("PracticeQ admin Set as Completed failed");
  });

  it("uses the PracticeQ admin browser path to mark intakes completed", () => {
    expect(workerSource).not.toContain("markPracticeQIntakeCompletedViaApi(");
    expect(workerSource).toContain("setPracticeQIntakeCompletedInAdmin(");
    expect(workerSource).toContain("PRACTICEQ_ADMIN_SET_COMPLETED");
  });

  it("logs into PracticeQ admin from a clean browser before marking completion", () => {
    // Admin portal is app.intakeq.com — navigating to /signin directly avoids redirect to patient portal
    expect(workerSource).toContain("app.intakeq.com");
    expect(workerSource).toContain("/signin");
    expect(workerSource).toContain(".col-md-2.hidden-print");
    expect(workerSource).toContain(".modal-dialog button");
  });

  it("uses the exact PracticeQ Set as Completed admin action selector", () => {
    // Primary selector: Angular ng-click attribute on the Set as Completed link
    expect(workerSource).toContain('ng-click="setAsCompleted()"');
    // Text fallback for when the ng-click locator doesn't resolve
    expect(workerSource).toContain("set\\s+as\\s+completed");
  });

  it("enters the IntakeQ intro page before filling questions", () => {
    expect(workerSource).toContain("resolvePracticeQIntroPage");
    expect(workerSource).toContain("fill\\s+this\\s+out\\s+by\\s+hand");
  });

  it("polls PracticeQ status after admin Set as Completed", async () => {
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

  it("trusts the admin browser when the PracticeQ page visibly shows completed", () => {
    expect(workerSource).toContain("practiceQAdminPageShowsCompleted");
    expect(workerSource).toContain("await waitForPracticeQCompletedStatus(matchedIntake.id).catch(() => false);");
    expect(workerSource).toContain('return { ...result, status: "completed", intakeId: matchedIntake.id };');
    expect(workerSource).toContain("return practiceQAdminPageShowsCompleted(page);");
  });

  it("binds the remote health route before loading heavy PracticeQ worker modules", () => {
    expect(remoteServerSource).not.toContain('from "@/services/practiceq-worker"');
    expect(remoteServerSource).not.toContain('from "@/lib/db.server"');

    const healthIndex = remoteServerSource.indexOf('url.pathname === "/health"');
    const moduleLoadIndex = remoteServerSource.indexOf("await loadRemoteServerModules()");

    expect(healthIndex).toBeGreaterThanOrEqual(0);
    expect(moduleLoadIndex).toBeGreaterThan(healthIndex);
  });
});
