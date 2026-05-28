import {
  answerMatchesPracticeQChoice,
  buildPracticeQFillPlan,
  formatPracticeQDate,
  findPracticeQChoiceForLabel,
  findPracticeQAnswerForPrompt,
  requiresUnhandledPatientConsent,
} from "@/services/practiceq-browser-fill";
import type { Patient, Question, QuestionnaireAnswer } from "@/types";

const patient: Patient = {
  id: "patient_1",
  firstName: "Bishoy",
  lastName: "Kamel",
  dateOfBirth: "1998-04-14",
  gender: "male",
  phone: "7328228376",
  email: "thebishoy98@gmail.com",
  address: { street1: "123 Main St", city: "Orlando", state: "FL", zipCode: "32801", country: "US" },
  shippingAddress: { street1: "123 Main St", city: "Orlando", state: "FL", zipCode: "32801", country: "US" },
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z",
};

const questions: Question[] = [
  { id: "height", category: "screening", text: "What is your height?", type: "text", required: true, displayOrder: 1 },
  { id: "weight", category: "screening", text: "What is your current body weight?", type: "text", required: true, displayOrder: 2 },
];

const answers: QuestionnaireAnswer[] = [
  { id: "a1", orderId: "order_1", questionId: "height", answer: "5 ft 11 in", createdAt: "2026-05-27T00:00:00.000Z" },
  { id: "a2", orderId: "order_1", questionId: "weight", answer: "215", createdAt: "2026-05-27T00:00:00.000Z" },
];

describe("PracticeQ browser fill plan", () => {
  it("maps Mission demographics and questionnaire answers into prompt/value pairs", () => {
    const plan = buildPracticeQFillPlan(patient, answers, questions, { signedName: "Bishoy Kamel" });

    expect(plan).toEqual(
      expect.arrayContaining([
        { prompt: "First Name", value: "Bishoy" },
        { prompt: "Last Name", value: "Kamel" },
        { prompt: "Date of Birth", value: "4/14/1998" },
        { prompt: "Email", value: "thebishoy98@gmail.com" },
        { prompt: "What is your height?", value: "5 ft 11 in" },
        { prompt: "What is your current body weight?", value: "215" },
        { prompt: "Print your name", value: "Bishoy Kamel" },
        { prompt: "Initials", value: "BK" },
        { prompt: "I consent to treatment", value: "I consent" },
      ])
    );
  });

  it("finds answers by normalized PracticeQ prompt text", () => {
    const plan = buildPracticeQFillPlan(patient, answers, questions);

    expect(findPracticeQAnswerForPrompt("What is your current body weight?", plan)).toBe("215");
    expect(findPracticeQAnswerForPrompt("Phone Number", plan)).toBe("7328228376");
    expect(findPracticeQAnswerForPrompt("Unknown prompt", plan)).toBeNull();
  });

  it("formats browser date input values for PracticeQ's M/D/YYYY field", () => {
    expect(formatPracticeQDate("1998-04-14")).toBe("4/14/1998");
    expect(formatPracticeQDate("4/14/1998")).toBe("4/14/1998");
  });

  it("matches radio and checkbox labels against the answer for their containing PracticeQ question", () => {
    const plan = buildPracticeQFillPlan(patient, [
      ...answers,
      { id: "a_gender", orderId: "order_1", questionId: "gender", answer: "male", createdAt: "2026-05-27T00:00:00.000Z" },
      { id: "a_conditions", orderId: "order_1", questionId: "conditions", answer: "I'm Pregnant, History of Diabetes", createdAt: "2026-05-27T00:00:00.000Z" },
    ], [
      ...questions,
      { id: "gender", category: "demographics", text: "Gender", type: "radio", required: true, displayOrder: 3 },
      { id: "conditions", category: "medical_history", text: "Select any that apply to you?", type: "checkbox", required: true, displayOrder: 4 },
    ], { signedName: "Bishoy Kamel" });

    expect(findPracticeQChoiceForLabel("Male", "2. Gender Male Female", plan)).toBe(true);
    expect(findPracticeQChoiceForLabel("Female", "2. Gender Male Female", plan)).toBe(false);
    expect(findPracticeQChoiceForLabel("I'm Pregnant", "6. Select any that apply to you?", plan)).toBe(true);
    expect(findPracticeQChoiceForLabel("History of Diabetes", "6. Select any that apply to you?", plan)).toBe(true);
    expect(findPracticeQChoiceForLabel("I'm Breastfeeding", "6. Select any that apply to you?", plan)).toBe(false);
  });

  it("recognizes close PracticeQ option wording for Mission medical answers", () => {
    expect(answerMatchesPracticeQChoice("Currently pregnant, breastfeeding, or planning pregnancy", "I'm Pregnant")).toBe(true);
    expect(answerMatchesPracticeQChoice("Personal or family history of medullary thyroid cancer or MEN 2", "History of Multiple Endocrine Neoplasia Syndrome Type 2 (MEN 2)")).toBe(true);
    expect(answerMatchesPracticeQChoice("History of Diabetes", "I'm Pregnant")).toBe(false);
    expect(answerMatchesPracticeQChoice("None of the above", "History of Diabetes")).toBe(false);
    expect(answerMatchesPracticeQChoice("None apply to me", "History of Diabetes")).toBe(false);
  });

  it("only blocks consent pages when Mission does not have a signed consent to use", () => {
    const consentText = "CONSENT FOR MEDICAL TREATMENT I consent to treatment by Mission Weight Loss";
    expect(requiresUnhandledPatientConsent(consentText, buildPracticeQFillPlan(patient, answers, questions))).toBe(true);
    expect(requiresUnhandledPatientConsent(consentText, buildPracticeQFillPlan(patient, answers, questions, { signedName: "Bishoy Kamel" }))).toBe(false);
    expect(requiresUnhandledPatientConsent("What is your height?", buildPracticeQFillPlan(patient, answers, questions))).toBe(false);
  });
});

