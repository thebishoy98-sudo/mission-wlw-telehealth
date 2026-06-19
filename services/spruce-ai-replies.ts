import Anthropic from "@anthropic-ai/sdk";
import { isOptOutMessage } from "@/lib/subscription";

export type SpruceAiReplyDecision = "auto_reply" | "clinical_escalation" | "staff_review" | "ignore";

export interface SpruceReplyContext {
  replyText: string;
  patientName?: string;
  orderStatus?: string;
  pharmacyStatus?: string;
  lastOutboundMessage?: string;
}

export interface SpruceAiReplyResult {
  decision: SpruceAiReplyDecision;
  shouldSend: boolean;
  replyText: string;
  confidence: number;
  reason: string;
}

type CreateMessage = (params: Parameters<Anthropic["messages"]["create"]>[0]) => Promise<any>;

const MAX_SMS_REPLY_LENGTH = 480;
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const ESCALATION_ACK =
  "Thanks for letting us know. I’m flagging this for the clinical team so they can review and follow up.";

const CLINICAL_OR_SAFETY_PATTERN =
  /\b(side effect|side effects|nausea|nauseous|vomit|vomiting|diarrhea|constipation|dizzy|dizziness|pain|chest pain|shortness of breath|breath|allergic|allergy|rash|swelling|pregnant|pregnancy|dose|dosage|missed dose|lower my dose|increase my dose|change my dose|medication change|symptom|symptoms|emergency|er|911|hospital)\b/i;

const LOW_VALUE_PATTERN = /^(ok|okay|yes|no|thanks|thank you|thx|👍|stop|cancel|unsubscribe)\.?$/i;

function clampReply(text: unknown): string {
  const clean = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (clean.length <= MAX_SMS_REPLY_LENGTH) return clean;
  return `${clean.slice(0, MAX_SMS_REPLY_LENGTH - 1).trimEnd()}…`;
}

function parseClaudeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

function normalizeDecision(value: unknown): SpruceAiReplyDecision {
  return value === "auto_reply" ||
    value === "clinical_escalation" ||
    value === "staff_review" ||
    value === "ignore"
    ? value
    : "staff_review";
}

function configuredForAi() {
  if (process.env.SPRUCE_AI_REPLIES !== "true") return "spruce_ai_replies_disabled";
  if (!process.env.ANTHROPIC_API_KEY) return "anthropic_not_configured";
  return "";
}

function buildSystemPrompt() {
  return `You classify inbound patient SMS messages for Mission Wellness & Weight Loss.

Return only JSON with:
{
  "decision": "auto_reply" | "clinical_escalation" | "staff_review" | "ignore",
  "confidence": number,
  "replyText": string,
  "reason": string
}

Use auto_reply only for clearly operational questions: shipping, tracking, payment links, refill/reorder process, ID upload help, program process, or office logistics.
Use clinical_escalation for symptoms, side effects, dose changes, medication questions, pregnancy, allergic reactions, emergencies, or anything requiring provider judgment.
Use staff_review for unclear, sensitive, complaints, billing disputes, or uncertain messages.
Use ignore for opt-out handled elsewhere or non-actionable short acknowledgements.

Keep replyText under 480 characters. Do not diagnose, recommend doses, change medications, or promise outcomes.`;
}

function buildUserPrompt(context: SpruceReplyContext) {
  return JSON.stringify({
    inboundSms: context.replyText,
    patientName: context.patientName ?? "",
    orderStatus: context.orderStatus ?? "",
    pharmacyStatus: context.pharmacyStatus ?? "",
    lastOutboundMessage: context.lastOutboundMessage ?? "",
  });
}

export async function classifySpruceReply(
  context: SpruceReplyContext,
  options: { createMessage?: CreateMessage } = {}
): Promise<SpruceAiReplyResult> {
  const text = context.replyText?.trim() ?? "";

  if (!text || isOptOutMessage(text) || LOW_VALUE_PATTERN.test(text)) {
    return { decision: "ignore", shouldSend: false, replyText: "", confidence: 1, reason: "non_actionable_reply" };
  }

  if (CLINICAL_OR_SAFETY_PATTERN.test(text)) {
    return {
      decision: "clinical_escalation",
      shouldSend: process.env.SPRUCE_AI_ESCALATION_ACK !== "false",
      replyText: ESCALATION_ACK,
      confidence: 1,
      reason: "clinical_or_safety_keyword",
    };
  }

  const configBlocker = configuredForAi();
  if (configBlocker) {
    return { decision: "staff_review", shouldSend: false, replyText: "", confidence: 0, reason: configBlocker };
  }

  const createMessage =
    options.createMessage ??
    ((params) => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" }).messages.create(params));

  try {
    const response = await createMessage({
      model: process.env.SPRUCE_AI_MODEL ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      max_tokens: 320,
      temperature: 0,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: buildUserPrompt(context) }],
    });

    const rawText = response?.content?.find((item: any) => item?.type === "text")?.text ?? "";
    const parsed = parseClaudeJson(rawText);
    const decision = normalizeDecision(parsed?.decision);
    const replyText = clampReply(parsed?.replyText);
    const shouldSend =
      decision === "auto_reply"
        ? process.env.SPRUCE_AI_AUTO_REPLY !== "false" && Boolean(replyText)
        : decision === "clinical_escalation" && process.env.SPRUCE_AI_ESCALATION_ACK !== "false" && Boolean(replyText);

    return {
      decision,
      shouldSend,
      replyText,
      confidence: Number.isFinite(Number(parsed?.confidence)) ? Number(parsed.confidence) : 0,
      reason: typeof parsed?.reason === "string" ? parsed.reason : "claude_classification",
    };
  } catch (error) {
    return {
      decision: "staff_review",
      shouldSend: false,
      replyText: "",
      confidence: 0,
      reason: `classification_failed: ${(error as Error).message}`,
    };
  }
}
