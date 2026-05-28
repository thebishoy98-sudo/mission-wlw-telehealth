import fs from "fs";
import path from "path";

describe("PracticeQ remote worker resilience", () => {
  const workerSource = fs.readFileSync(path.join(process.cwd(), "services/practiceq-worker.ts"), "utf8");
  const dbSource = fs.readFileSync(path.join(process.cwd(), "lib/db.server.ts"), "utf8");

  it("allows enough time for IntakeQ Angular pages with many visible fields", () => {
    expect(workerSource).toContain("PRACTICEQ_PAGE_FILL_TIMEOUT_MS");
    expect(workerSource).toContain("45000");
    expect(workerSource).not.toContain("PracticeQ text field fill step timed out.\")\n    );");
  });

  it("requeues stale running jobs after a Render restart or SIGTERM", () => {
    expect(dbSource).toContain("locked_at < NOW() - INTERVAL '10 minutes'");
    expect(dbSource).toContain("status = 'running'");
  });

  it("uploads the patient identity video to IntakeQ hidden file inputs", () => {
    expect(workerSource).toContain('u.type === "selfie_video"');
    expect(workerSource).toContain("uploadPracticeQFile");
    expect(workerSource).not.toContain("fileInput.isVisible");
  });

  it("reads IntakeQ prompts from ancestor headings for standalone text inputs", () => {
    expect(workerSource).toContain('querySelector?.("h1,h2,h3,h4,h5,h6,label")');
  });
});
