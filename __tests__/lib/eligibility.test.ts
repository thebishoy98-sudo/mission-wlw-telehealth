import { checkEligibility, validateCompleteness } from "@/lib/eligibility";
import type { Question, QuestionnaireAnswer } from "@/types";

const makeAnswer = (questionId: string, answer: string): QuestionnaireAnswer => ({
  id: `ans_${questionId}`,
  orderId: "order_1",
  questionId,
  answer,
  createdAt: new Date().toISOString(),
});

const makeQuestion = (
  id: string,
  text: string,
  required = true,
  disqualifying?: string
): Question => ({
  id,
  category: "medical_history",
  text,
  type: "radio",
  options: ["Yes", "No"],
  required,
  displayOrder: 1,
  disqualifying,
});

describe("checkEligibility", () => {
  const questions: Question[] = [
    makeQuestion("q_thyroid", "Do you have a history of thyroid cancer or MEN2?", true, "Yes"),
    makeQuestion("q_pregnant", "Are you currently pregnant or nursing?", true, "Yes"),
    makeQuestion("q_bmi", "Is your BMI over 27?", true),
  ];

  it("returns eligible when no disqualifying answers", () => {
    const answers = [
      makeAnswer("q_thyroid", "No"),
      makeAnswer("q_pregnant", "No"),
      makeAnswer("q_bmi", "Yes"),
    ];
    const result = checkEligibility(answers, questions);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("disqualifies patient with thyroid cancer history", () => {
    const answers = [
      makeAnswer("q_thyroid", "Yes"),
      makeAnswer("q_pregnant", "No"),
    ];
    const result = checkEligibility(answers, questions);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("thyroid");
    expect(result.disqualifyingQuestion).toBe("Do you have a history of thyroid cancer or MEN2?");
  });

  it("disqualifies patient who is pregnant", () => {
    const answers = [
      makeAnswer("q_thyroid", "No"),
      makeAnswer("q_pregnant", "Yes"),
    ];
    const result = checkEligibility(answers, questions);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("pregnancy");
  });

  it("is case-insensitive for disqualifying values", () => {
    const answers = [makeAnswer("q_thyroid", "yes")];
    const result = checkEligibility(answers, questions);
    expect(result.eligible).toBe(false);
  });

  it("returns eligible when disqualifying question is answered negatively", () => {
    const answers = questions.map((q) => makeAnswer(q.id, "No"));
    const result = checkEligibility(answers, questions);
    expect(result.eligible).toBe(true);
  });

  it("handles empty answers gracefully", () => {
    const result = checkEligibility([], questions);
    expect(result.eligible).toBe(true);
  });

  it("handles empty questions gracefully", () => {
    const answers = [makeAnswer("q_thyroid", "Yes")];
    const result = checkEligibility(answers, []);
    expect(result.eligible).toBe(true);
  });

  it("only disqualifies on exact match, not partial", () => {
    const answers = [makeAnswer("q_thyroid", "Yes, but mild")];
    const result = checkEligibility(answers, questions);
    // "yes, but mild" !== "yes", so should not disqualify
    expect(result.eligible).toBe(true);
  });

  it("detects a disqualifying value inside a comma-separated multi-select answer", () => {
    const multiQuestions: Question[] = [
      makeQuestion(
        "q_conditions",
        "Select any that apply to you?",
        true,
        "Personal or family history of medullary thyroid cancer or MEN 2"
      ),
    ];
    const answers = [
      makeAnswer(
        "q_conditions",
        "Diabetes, Personal or family history of medullary thyroid cancer or MEN 2"
      ),
    ];

    const result = checkEligibility(answers, multiQuestions);

    expect(result.eligible).toBe(false);
  });

  it("detects any configured disqualifying option from a comma-separated disqualifying list", () => {
    const multiQuestions: Question[] = [
      makeQuestion(
        "q_conditions",
        "Select any that apply to you?",
        true,
        "I'm Pregnant, I'm Breastfeeding, History of Multiple Endocrine Neoplasia Syndrome Type 2 (MEN 2), History of Medullary Thyroid Cancer"
      ),
    ];
    const answers = [makeAnswer("q_conditions", "History of Diabetes, I'm Breastfeeding")];

    const result = checkEligibility(answers, multiQuestions);

    expect(result.eligible).toBe(false);
  });

  it("disqualifies recent gastric bypass answers when configured as a blocker", () => {
    const gastricQuestions: Question[] = [
      makeQuestion(
        "pq_gastric_bypass",
        "Have you had gastric bypass surgery within the past 6 months?",
        true,
        "Yes"
      ),
    ];

    const result = checkEligibility([makeAnswer("pq_gastric_bypass", "Yes")], gastricQuestions);

    expect(result).toMatchObject({
      eligible: false,
      disqualifyingQuestion: "Have you had gastric bypass surgery within the past 6 months?",
    });
  });

  it("does not disqualify requested-medication allergy answers unless the question is configured as disqualifying", () => {
    const allergyQuestions: Question[] = [
      makeQuestion(
        "pq_medication_allergies",
        "Do you have a known allergy to the medication you're requesting or any of its ingredients?",
        true
      ),
    ];

    const result = checkEligibility([makeAnswer("pq_medication_allergies", "Yes")], allergyQuestions);

    expect(result.eligible).toBe(true);
  });
});

describe("validateCompleteness", () => {
  const questions: Question[] = [
    makeQuestion("q1", "Question 1", true),
    makeQuestion("q2", "Question 2", true),
    makeQuestion("q3", "Optional question", false),
  ];

  it("returns complete when all required questions are answered", () => {
    const answers = [makeAnswer("q1", "Yes"), makeAnswer("q2", "No")];
    const result = validateCompleteness(answers, questions);
    expect(result.complete).toBe(true);
    expect(result.missingQuestions).toHaveLength(0);
  });

  it("returns incomplete when a required question is missing", () => {
    const answers = [makeAnswer("q1", "Yes")];
    const result = validateCompleteness(answers, questions);
    expect(result.complete).toBe(false);
    expect(result.missingQuestions).toContain("Question 2");
  });

  it("does not require optional questions", () => {
    const answers = [makeAnswer("q1", "Yes"), makeAnswer("q2", "No")];
    const result = validateCompleteness(answers, questions);
    expect(result.complete).toBe(true);
    expect(result.missingQuestions).not.toContain("Optional question");
  });

  it("returns all missing required questions", () => {
    const result = validateCompleteness([], questions);
    expect(result.complete).toBe(false);
    expect(result.missingQuestions).toHaveLength(2);
  });
});
