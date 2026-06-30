import Anthropic from "@anthropic-ai/sdk";
import { isOptOutMessage } from "@/lib/subscription";

export type SpruceAiReplyDecision = "auto_reply" | "clinical_escalation" | "staff_review" | "ignore";

export interface SpruceReplyContext {
  replyText: string;
  patientName?: string;
  orderStatus?: string;
  pharmacyStatus?: string;
}

export interface SpruceAiReplyResult {
  decision: SpruceAiReplyDecision;
  shouldSend: boolean;
  replyText: string;
  confidence: number;
  reason: string;
}

type CreateMessage = (params: Parameters<Anthropic["messages"]["create"]>[0]) => Promise<any>;

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const ESCALATION_ACK =
  "Thanks for letting us know. I’m flagging this for the clinical team so they can review and follow up.";
const CLINICAL_PATTERN =
  /\b(side effect|nausea|vomit|diarrhea|constipation|dizzy|pain|chest pain|shortness of breath|allergic|rash|swelling|pregnant|pregnancy|dose|dosage|missed dose|medication|symptom|emergency|911|hospital)\b/i;
const LOW_VALUE_PATTERN = /^(ok|okay|yes|no|thanks|thank you|thx|👍|stop|cancel|unsubscribe)\.?$/i;

function cleanReply(value: unknown) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text.length <= 480 ? text : `${text.slice(0, 479).trimEnd()}…`;
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}

export async function classifySpruceReply(
  context: SpruceReplyContext,
  options: { createMessage?: CreateMessage } = {}
): Promise<SpruceAiReplyResult> {
  const text = context.replyText.trim();
  if (!text || isOptOutMessage(text) || LOW_VALUE_PATTERN.test(text)) {
    return { decision: "ignore", shouldSend: false, replyText: "", confidence: 1, reason: "non_actionable_reply" };
  }
  if (CLINICAL_PATTERN.test(text)) {
    return {
      decision: "clinical_escalation",
      shouldSend: process.env.SPRUCE_AI_ESCALATION_ACK !== "false",
      replyText: ESCALATION_ACK,
      confidence: 1,
      reason: "clinical_or_safety_keyword",
    };
  }
  if (process.env.SPRUCE_AI_REPLIES !== "true") {
    return { decision: "staff_review", shouldSend: false, replyText: "", confidence: 0, reason: "spruce_ai_replies_disabled" };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { decision: "staff_review", shouldSend: false, replyText: "", confidence: 0, reason: "anthropic_not_configured" };
  }

  const createMessage =
    options.createMessage ??
    ((params) => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create(params));

  try {
    const response = await createMessage({
      model: process.env.SPRUCE_AI_MODEL ?? DEFAULT_MODEL,
      max_tokens: 320,
      temperature: 0,
      system: `Classify inbound patient SMS for Mission Wellness & Weight Loss.
Return only JSON: {"decision":"auto_reply|clinical_escalation|staff_review|ignore","confidence":0.0,"replyText":"","reason":""}.
Auto-reply only to operational questions about shipping, tracking, payment links, reorder process, identity uploads, or office logistics.
Escalate symptoms, medication, dose, pregnancy, allergy, emergencies, billing disputes, complaints, or uncertainty.
Never diagnose, recommend treatment, change medication, or promise outcomes. Keep replies under 480 characters.`,
      messages: [{ role: "user", content: JSON.stringify({
        inboundSms: text,
        patientName: context.patientName ?? "",
        orderStatus: context.orderStatus ?? "",
        pharmacyStatus: context.pharmacyStatus ?? "",
      }) }],
    });
    const raw = response?.content?.find((item: any) => item?.type === "text")?.text ?? "";
    const parsed = parseJson(raw);
    const decision: SpruceAiReplyDecision =
      ["auto_reply", "clinical_escalation", "staff_review", "ignore"].includes(parsed?.decision)
        ? parsed.decision
        : "staff_review";
    const replyText = cleanReply(parsed?.replyText);
    return {
      decision,
      shouldSend: decision === "auto_reply" && process.env.SPRUCE_AI_AUTO_REPLY !== "false" && Boolean(replyText),
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
