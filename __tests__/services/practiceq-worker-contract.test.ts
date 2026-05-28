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

  it("uses a DOM-level click fallback for PracticeQ custom controls", () => {
    expect(source).toContain("clickPracticeQControlByText");
    expect(source).toContain("dispatchEvent(new MouseEvent(\"mousedown\"");
    expect(source).toContain("start\\s+new\\s+intake\\s+form");
    expect(source).toContain("back\\s+to\\s+questionnaire");
  });

  it("reads PracticeQ question text from the Angular repeat block around answer fields", () => {
    expect(source).toContain('el.closest("[ng-repeat], .question, .panel, fieldset")');
  });

  it("fails the job instead of reporting completed when expected visible answers are not written", () => {
    expect(source).toContain("assertVisiblePracticeQFieldsFilled");
    expect(source).toContain("PracticeQ did not keep the expected answer");
  });

  it("bounds each PracticeQ field inspection so one custom input cannot hang the worker", () => {
    expect(source).toContain("withPracticeQTimeout(");
    expect(source).toContain("PracticeQ skipped a slow field");
  });
});
