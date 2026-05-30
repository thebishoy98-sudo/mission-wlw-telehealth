import { submitPracticeQInBackground } from "@/services/practiceq-worker";

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
  populateAndUpdatePracticeQIntake: jest.fn(),
}));

function pageWithText(text: string, url = "https://intakeq.com/intake/intake_123") {
  return {
    url: jest.fn(() => url),
    locator: jest.fn(() => ({
      innerText: jest.fn().mockResolvedValue(text),
    })),
    waitForFunction: jest.fn().mockResolvedValue(undefined),
  } as any;
}

describe("submitPracticeQInBackground", () => {
  const completedPhrases = [
    "Thank you. Your form has been successfully submitted.",
    "Your intake has been received.",
    "Your form is complete.",
    "Form is complete.",
    "Successfully submitted.",
    "Submitted.",
    "Received your form.",
  ];

  it("treats an intake that PracticeQ already submitted at the beginning as completed", async () => {
    const result = await submitPracticeQInBackground(
      pageWithText("Thank you. Your form has been successfully submitted."),
      { stoppedForPatientConsent: false },
      []
    );

    expect(result).toEqual({
      status: "completed",
      handoffUrl: undefined,
      intakeId: "intake_123",
    });
  });

  it.each(completedPhrases)("treats early PracticeQ terminal text as completed: %s", async (text) => {
    const page = pageWithText(text);

    const result = await submitPracticeQInBackground(page, { stoppedForPatientConsent: false }, []);

    expect(result).toEqual({ status: "completed", handoffUrl: undefined, intakeId: "intake_123" });
    expect(page.locator).toHaveBeenCalledWith("body");
  });

  it("fails instead of submitting when PracticeQ is blocked on unsigned patient consent", async () => {
    const result = await submitPracticeQInBackground(
      pageWithText("Consent and Signature Please sign your consent to treatment."),
      { stoppedForPatientConsent: true },
      []
    );

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/requires patient consent\/signature/i);
  });
});
