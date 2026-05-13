import type { Question, QuestionnaireAnswer } from "@/types";

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  disqualifyingQuestion?: string;
}

/**
 * Checks if a set of questionnaire answers contains any disqualifying responses.
 * A question with `disqualifying: "Yes"` means answering "Yes" disqualifies the patient.
 */
export function checkEligibility(
  answers: QuestionnaireAnswer[],
  questions: Question[]
): EligibilityResult {
  for (const answer of answers) {
    const question = questions.find((q) => q.id === answer.questionId);
    if (!question?.disqualifying) continue;

    const answerVal = answer.answer.trim().toLowerCase();
    const disqualifyingVal = question.disqualifying.trim().toLowerCase();

    if (answerVal === disqualifyingVal) {
      return {
        eligible: false,
        reason: buildReason(question),
        disqualifyingQuestion: question.text,
      };
    }
  }

  return { eligible: true };
}

function buildReason(question: Question): string {
  const text = question.text.toLowerCase();
  if (text.includes("thyroid") || text.includes("men2")) {
    return "Personal or family history of medullary thyroid carcinoma (MTC) or Multiple Endocrine Neoplasia syndrome type 2 (MEN2) is a contraindication for GLP-1 receptor agonist therapy.";
  }
  if (text.includes("pregnant") || text.includes("nursing")) {
    return "GLP-1 medications are not recommended during pregnancy or breastfeeding due to potential risks to the baby.";
  }
  return "Based on your responses, you do not currently meet the eligibility criteria for GLP-1 treatment at this time.";
}

/**
 * Validates that all required questions have been answered.
 */
export function validateCompleteness(
  answers: QuestionnaireAnswer[],
  questions: Question[]
): { complete: boolean; missingQuestions: string[] } {
  const answered = new Set(answers.map((a) => a.questionId));
  const missing = questions
    .filter((q) => q.required && !answered.has(q.id))
    .map((q) => q.text);

  return { complete: missing.length === 0, missingQuestions: missing };
}
