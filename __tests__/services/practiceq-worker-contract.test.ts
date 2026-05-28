import fs from "fs";
import path from "path";

describe("PracticeQ worker background submission contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "services/practiceq-worker.ts"), "utf8");

  it("does not expose a patient handoff when background submission is possible", () => {
    expect(source).toContain("submitPracticeQInBackground");
    expect(source).toContain("PracticeQ form requires patient consent/signature");
  });

  it("opens and signs PracticeQ consent documents before advancing the questionnaire", () => {
    expect(source).toContain("completeVisibleConsentDocument");
    expect(source).toContain("read\\s*&?\\s*sign");
    expect(source).toContain("submit signature|click to sign");
  });

  it("reads PracticeQ question text from the Angular repeat block around answer fields", () => {
    expect(source).toContain('el.closest("[ng-repeat], .question, .panel, fieldset")');
  });
});
