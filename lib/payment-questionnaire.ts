import { validateCompleteness } from "@/lib/eligibility";
import type { Question, QuestionnaireAnswer } from "@/types";

export function validatePaymentQuestionnaire(
  answers: QuestionnaireAnswer[],
  questions: Question[]
) {
  return validateCompleteness(answers, questions);
}
