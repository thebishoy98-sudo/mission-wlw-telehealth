import {
  answerMatchesPracticeQChoice,
  buildPracticeQFillPlan,
  findPracticeQAnswerForPrompt,
  formatPracticeQDate,
  requiresUnhandledPatientConsent,
} from "@/services/practiceq-browser-fill";
import type { Patient, Question, QuestionnaireAnswer } from "@/types";

const patient: Patient = {
  id: "patient_robust",
  firstName: "Bishoy",
  lastName: "Kamel",
  dateOfBirth: "1998-04-14",
  gender: "male",
  phone: "7328228376",
  email: "thebishoy98@gmail.com",
  address: { street1: "123 Main St", city: "Orlando", state: "FL", zipCode: "32801", country: "US" },
  shippingAddress: { street1: "123 Ship St", city: "Miami", state: "FL", zipCode: "33101", country: "US" },
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z",
};

describe("PracticeQ browser fill robustness", () => {
  it("resolves 1000 generated PracticeQ prompts back to their Mission answers", () => {
    const questions: Question[] = Array.from({ length: 1000 }, (_, index) => ({
      id: `q_${index}`,
      category: "screening",
      text: `Reliability prompt ${index}: Current medication dose?`,
      type: "text",
      required: true,
      displayOrder: index,
    }));
    const answers: QuestionnaireAnswer[] = questions.map((question, index) => ({
      id: `a_${index}`,
      orderId: "order_robust",
      questionId: question.id,
      answer: `answer-${index}`,
      createdAt: "2026-05-27T00:00:00.000Z",
    }));

    const plan = buildPracticeQFillPlan(patient, answers, questions, { signedName: "Bishoy Kamel" });
    let checked = 0;

    for (let index = 0; index < questions.length; index += 1) {
      const promptVariant = ` ${questions[index].text.replace(":", " : ")} `;
      expect(findPracticeQAnswerForPrompt(promptVariant, plan)).toBe(`answer-${index}`);
      checked += 1;
    }

    expect(checked).toBe(1000);
  });

  it("matches 10000 generated exact choice labels and rejects their mismatches", () => {
    let checked = 0;

    for (let index = 0; index < 10000; index += 1) {
      expect(answerMatchesPracticeQChoice(`Option ${index}`, `Option ${index}`)).toBe(true);
      expect(answerMatchesPracticeQChoice(`Option ${index}`, `Different ${index}`)).toBe(false);
      checked += 1;
    }

    expect(checked).toBe(10000);
  });

  it("formats 10000 generated ISO dates into PracticeQ slash dates", () => {
    let checked = 0;

    for (let index = 0; index < 10000; index += 1) {
      const year = 1950 + (index % 80);
      const month = (index % 12) + 1;
      const day = (index % 28) + 1;
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      expect(formatPracticeQDate(iso)).toBe(`${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`);
      checked += 1;
    }

    expect(checked).toBe(10000);
  });

  it("does not block consent-like pages when Mission already has signed consent", () => {
    const unsignedPlan = buildPracticeQFillPlan(patient, [], []);
    const signedPlan = buildPracticeQFillPlan(patient, [], [], { signedName: "Bishoy Kamel" });
    const consentTexts = [
      "Telehealth consent and signature",
      "Patient consent for medical treatment",
      "Consent and Signature",
      "Please sign your consent",
      "I consent to treatment",
    ];

    for (const text of consentTexts) {
      expect(requiresUnhandledPatientConsent(text, unsignedPlan)).toBe(true);
      expect(requiresUnhandledPatientConsent(text, signedPlan)).toBe(false);
    }
  });
});
