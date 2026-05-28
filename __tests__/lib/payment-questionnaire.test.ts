import { validatePaymentQuestionnaire } from "@/lib/payment-questionnaire";
import type { Question, QuestionnaireAnswer } from "@/types";

const questions: Question[] = [
  {
    id: "height",
    category: "medical",
    text: "What is your height?",
    type: "text",
    required: true,
    displayOrder: 1,
  },
  {
    id: "allergies",
    category: "medical",
    text: "Any Allergies to medication?",
    type: "textarea",
    required: true,
    displayOrder: 2,
  },
];

describe("validatePaymentQuestionnaire", () => {
  it("rejects payment when required questionnaire answers are missing", () => {
    const result = validatePaymentQuestionnaire([], questions);

    expect(result.complete).toBe(false);
    expect(result.missingQuestions).toEqual(["What is your height?", "Any Allergies to medication?"]);
  });

  it("accepts payment when required questionnaire answers are present", () => {
    const answers: QuestionnaireAnswer[] = [
      { id: "a1", orderId: "order_1", questionId: "height", answer: "5'10\"", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "a2", orderId: "order_1", questionId: "allergies", answer: "None", createdAt: "2026-01-01T00:00:00.000Z" },
    ];

    const result = validatePaymentQuestionnaire(answers, questions);

    expect(result.complete).toBe(true);
    expect(result.missingQuestions).toEqual([]);
  });
});
