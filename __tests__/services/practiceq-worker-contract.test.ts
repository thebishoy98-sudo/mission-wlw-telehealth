import fs from "fs";
import path from "path";

describe("PracticeQ worker background submission contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "services/practiceq-worker.ts"), "utf8");

  it("does not expose a patient handoff when background submission is possible", () => {
    expect(source).toContain("submitPracticeQInBackground");
    expect(source).toContain("PracticeQ form requires patient consent/signature");
  });
});
