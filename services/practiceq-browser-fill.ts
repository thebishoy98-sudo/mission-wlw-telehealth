import type { Patient, Question, QuestionnaireAnswer } from "@/types";

export type PracticeQFillItem = {
  prompt: string;
  value: string;
};

type ConsentInput = {
  signedName?: string | null;
};

export function buildPracticeQFillPlan(
  patient: Patient,
  answers: QuestionnaireAnswer[],
  questions: Question[],
  consent?: ConsentInput | null
): PracticeQFillItem[] {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const shippingAddress = patient.shippingAddress?.street1 ? patient.shippingAddress : patient.address;
  const signedName = consent?.signedName?.trim();
  const initials = signedName
    ?.split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();
  const demographics: PracticeQFillItem[] = [
    { prompt: "First Name", value: patient.firstName },
    { prompt: "Last Name", value: patient.lastName },
    { prompt: "Full Name", value: [patient.firstName, patient.lastName].filter(Boolean).join(" ") },
    { prompt: "Email", value: patient.email },
    { prompt: "Phone Number", value: patient.phone },
    { prompt: "Date of Birth", value: formatPracticeQDate(patient.dateOfBirth) },
    { prompt: "Gender", value: patient.gender },
    { prompt: "Address", value: shippingAddress.street1 },
    { prompt: "City", value: shippingAddress.city },
    { prompt: "State", value: shippingAddress.state },
    { prompt: "Zip Code", value: shippingAddress.zipCode },
  ];

  const clinicalAnswers = answers
    .map((answer) => {
      const question = questionById.get(answer.questionId);
      if (!question || !String(answer.answer ?? "").trim()) return null;
      return { prompt: question.text, value: answer.answer.trim() };
    })
    .filter((item): item is PracticeQFillItem => item !== null);

  const consentAnswers: PracticeQFillItem[] = signedName
    ? [
        { prompt: "Print your name", value: signedName },
        { prompt: "Signature", value: signedName },
        { prompt: "Patient Name", value: signedName },
        ...(initials ? [{ prompt: "Initials", value: initials }] : []),
        { prompt: "Consent for Medical Treatment", value: "I consent" },
        { prompt: "I consent to treatment", value: "I consent" },
      ]
    : [];

  return [...demographics, ...clinicalAnswers, ...consentAnswers].filter((item) => item.value.trim().length > 0);
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

export function requiresUnhandledPatientConsent(text: string, fillPlan: PracticeQFillItem[]): boolean {
  if (!isConsentPrompt(text)) return false;
  return !fillPlan.some((item) => isConsentPrompt(item.prompt) || normalizePrompt(item.prompt).includes("print your name"));
}

export function shouldStopForPatientConsent(text: string): boolean {
  return isConsentPrompt(text);
}

export function findPracticeQChoiceForLabel(
  labelText: string,
  questionContext: string,
  fillPlan: PracticeQFillItem[]
): boolean {
  const label = labelText.trim();
  if (!label) return false;

  if (isConsentPrompt(label) && fillPlan.some((item) => isConsentPrompt(item.prompt))) return true;

  const normalizedContext = normalizePrompt(questionContext);
  const answer = fillPlan.find((item) => {
    const prompt = normalizePrompt(item.prompt);
    return prompt.length > 2 && (normalizedContext.includes(prompt) || prompt.includes(normalizedContext));
  })?.value;

  return answer ? answerMatchesPracticeQChoice(answer, label) : false;
}

export function answerMatchesPracticeQChoice(answer: string, labelText: string): boolean {
  const normalizedAnswer = normalizePrompt(answer);
  const normalizedLabel = normalizePrompt(labelText);
  if (!normalizedAnswer || !normalizedLabel) return false;
  if (normalizedAnswer === "none of the above" || normalizedAnswer === "none apply to me" || normalizedAnswer === "none") return false;
  if (normalizedAnswer === normalizedLabel) return true;

  const selectedValues = normalizedAnswer.split(/\s*,\s*/).map(normalizePrompt).filter(Boolean);
  if (selectedValues.some((value) => {
    if (value === normalizedLabel) return true;
    if (value.length <= 4 || normalizedLabel.length <= 4) return false;
    return value.includes(normalizedLabel) || normalizedLabel.includes(value);
  })) {
    return true;
  }

  if ((normalizedAnswer.includes("pregnant") || normalizedAnswer.includes("pregnancy")) && normalizedLabel.includes("pregnant")) return true;
  if (normalizedAnswer.includes("breastfeeding") && normalizedLabel.includes("breastfeeding")) return true;
  if (normalizedAnswer.includes("diabetes") && normalizedLabel.includes("diabetes")) return true;
  if (normalizedAnswer.includes("tirzepatide") && normalizedLabel.includes("tirzepatide")) return true;
  if (normalizedAnswer.includes("vitamin b12") && normalizedLabel.includes("vitamin b12")) return true;
  if (normalizedAnswer.includes("vitamin b6") && normalizedLabel.includes("vitamin b6")) return true;
  if ((normalizedAnswer.includes("men 2") || normalizedAnswer.includes("multiple endocrine neoplasia")) &&
      (normalizedLabel.includes("men 2") || normalizedLabel.includes("multiple endocrine neoplasia"))) return true;
  if (normalizedAnswer.includes("medullary thyroid cancer") && normalizedLabel.includes("medullary thyroid cancer")) return true;
  if (normalizedAnswer.includes("intestine") && normalizedLabel.includes("intestine")) return true;
  if (normalizedAnswer.includes("stomach") && normalizedLabel.includes("stomach")) return true;
  if (normalizedAnswer.includes("anorexia") && normalizedLabel.includes("anorexia")) return true;

  return false;
}

export function formatPracticeQDate(value: string): string {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${Number(iso[2])}/${Number(iso[3])}/${iso[1]}`;
  return trimmed;
}

function isConsentPrompt(text: string): boolean {
  const normalized = normalizePrompt(text);
  return (
    normalized.includes("signature") ||
    normalized.includes("sign your consent") ||
    normalized.includes("telehealth consent") ||
    normalized.includes("patient consent") ||
    normalized.includes("consent and signature") ||
    normalized.includes("consent for medical treatment") ||
    normalized.includes("i consent to treatment")
  );
}

function normalizePrompt(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

