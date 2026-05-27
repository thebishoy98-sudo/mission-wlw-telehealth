import type { Patient, Question, QuestionnaireAnswer } from "@/types";

export type PracticeQFillItem = {
  prompt: string;
  value: string;
};

export function buildPracticeQFillPlan(
  patient: Patient,
  answers: QuestionnaireAnswer[],
  questions: Question[]
): PracticeQFillItem[] {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const demographics: PracticeQFillItem[] = [
    { prompt: "First Name", value: patient.firstName },
    { prompt: "Last Name", value: patient.lastName },
    { prompt: "Full Name", value: [patient.firstName, patient.lastName].filter(Boolean).join(" ") },
    { prompt: "Email", value: patient.email },
    { prompt: "Phone Number", value: patient.phone },
    { prompt: "Date of Birth", value: patient.dateOfBirth },
    { prompt: "Gender", value: patient.gender },
    { prompt: "Address", value: patient.address.street1 },
    { prompt: "City", value: patient.address.city },
    { prompt: "State", value: patient.address.state },
    { prompt: "Zip Code", value: patient.address.zipCode },
  ];

  const clinicalAnswers = answers
    .map((answer) => {
      const question = questionById.get(answer.questionId);
      if (!question || !String(answer.answer ?? "").trim()) return null;
      return { prompt: question.text, value: answer.answer.trim() };
    })
    .filter((item): item is PracticeQFillItem => item !== null);

  return [...demographics, ...clinicalAnswers].filter((item) => item.value.trim().length > 0);
}

export function findPracticeQAnswerForPrompt(
  prompt: string,
  fillPlan: PracticeQFillItem[]
): string | null {
  const normalizedPrompt = normalizePrompt(prompt);
  const exact = fillPlan.find((item) => normalizePrompt(item.prompt) === normalizedPrompt);
  if (exact) return exact.value;

  const partial = fillPlan.find((item) => {
    const candidate = normalizePrompt(item.prompt);
    return candidate.length > 3 && (normalizedPrompt.includes(candidate) || candidate.includes(normalizedPrompt));
  });
  return partial?.value ?? null;
}

export function shouldStopForPatientConsent(text: string): boolean {
  const normalized = normalizePrompt(text);
  return (
    normalized.includes("signature") ||
    normalized.includes("sign your consent") ||
    normalized.includes("telehealth consent") ||
    normalized.includes("patient consent") ||
    normalized.includes("consent and signature")
  );
}

function normalizePrompt(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

