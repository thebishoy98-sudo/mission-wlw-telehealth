import { seedQuestions } from "@/data/seed-data";
import type { Question } from "@/types";

const requiredPracticeQQuestionTexts = new Set(seedQuestions.map((question) => normalizeQuestionText(question.text)));

export function ensurePracticeQRequiredQuestions(questions: Question[]): Question[] {
  const byText = new Map(questions.map((question) => [normalizeQuestionText(question.text), question]));
  const merged: Question[] = seedQuestions.map((seedQuestion) => byText.get(normalizeQuestionText(seedQuestion.text)) ?? seedQuestion);
  const mergedTexts = new Set(merged.map((question) => normalizeQuestionText(question.text)));

  for (const question of questions) {
    const normalizedText = normalizeQuestionText(question.text);
    if (mergedTexts.has(normalizedText) || requiredPracticeQQuestionTexts.has(normalizedText)) continue;
    merged.push(question);
    mergedTexts.add(normalizedText);
  }

  return merged;
}

function normalizeQuestionText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
