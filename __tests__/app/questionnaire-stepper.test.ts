/**
 * Contract tests for the one-at-a-time questionnaire stepper.
 * Verifies structural requirements without running the React component.
 */
import fs from "fs";
import path from "path";

const source = fs.readFileSync(
  path.join(process.cwd(), "app/start/questionnaire/page.tsx"),
  "utf8"
);

describe("questionnaire stepper — source contracts", () => {
  it("has a step state variable", () => {
    expect(source).toContain("useState(0)");
  });

  it("advances step on next when answer is present", () => {
    expect(source).toContain("setStep(step + 1)");
  });

  it("decrements step on back", () => {
    expect(source).toContain("setStep(step - 1)");
  });

  it("navigates to /start/info when back is pressed on step 0", () => {
    expect(source).toContain('router.push("/start/info")');
    expect(source).toContain("step === 0");
  });

  it("shows inline error when required question skipped", () => {
    expect(source).toContain("stepError");
    expect(source).toContain("Please answer this question");
  });

  it("shows progress bar with percent width", () => {
    expect(source).toContain("progress}%");
  });

  it("shows question index label", () => {
    expect(source).toContain("step + 1}");
    expect(source).toContain("of {total}");
  });

  it("last step shows Continue instead of Next", () => {
    expect(source).toContain("isLast");
    expect(source).toContain('"Continue"');
    expect(source).toContain("Next →");
  });

  it("runs eligibility check only on final submit (finalize)", () => {
    expect(source).toContain("const finalize");
    expect(source).toContain("checkEligibility");
  });

  it("persists answers on each input change via answersRef", () => {
    expect(source).toContain("answersRef.current = next");
    expect(source).toContain("saveIntakeState({ questionnaireAnswers: next })");
  });

  it("ineligible screen back button returns to last question not step 0", () => {
    expect(source).toContain("setStep(questions.length - 1)");
  });
});
