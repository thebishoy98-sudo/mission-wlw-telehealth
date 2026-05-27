import {
  buildPracticeQFillPlan,
  findPracticeQAnswerForPrompt,
  shouldStopForPatientConsent,
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
    const plan = buildPracticeQFillPlan(patient, answers, questions);

    expect(plan).toEqual(
      expect.arrayContaining([
        { prompt: "First Name", value: "Bishoy" },
        { prompt: "Last Name", value: "Kamel" },
        { prompt: "Email", value: "thebishoy98@gmail.com" },
        { prompt: "What is your height?", value: "5 ft 11 in" },
        { prompt: "What is your current body weight?", value: "215" },
      ])
    );
  });

  it("finds answers by normalized PracticeQ prompt text", () => {
    const plan = buildPracticeQFillPlan(patient, answers, questions);

    expect(findPracticeQAnswerForPrompt("What is your current body weight?", plan)).toBe("215");
    expect(findPracticeQAnswerForPrompt("Phone Number", plan)).toBe("7328228376");
    expect(findPracticeQAnswerForPrompt("Unknown prompt", plan)).toBeNull();
  });

  it("detects patient consent and signature prompts as hard stop points", () => {
    expect(shouldStopForPatientConsent("Please sign your consent below")).toBe(true);
    expect(shouldStopForPatientConsent("Telehealth consent and signature")).toBe(true);
    expect(shouldStopForPatientConsent("What is your height?")).toBe(false);
  });
});

