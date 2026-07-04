import * as dbServer from "@/lib/db.server";
import { generateId } from "@/lib/utils";
import type { Patient, SpruceMessage } from "@/types";

const API_BASE_URL = process.env.SPRUCE_BASE_URL ?? "https://api.sprucehealth.com/v1";

const DEFAULT_TEMPLATES: Record<string, string> = {
  payment_received: "Your payment was received. Your order is being reviewed.",
  approved: "Your provider approved your chart. Your prescription is being prepared for pharmacy dispatch.",
  rejected: "Your provider reviewed your chart and could not approve this order. Please contact support for next steps.",
  order_sent_to_pharmacy: "Your prescription was approved and sent to the pharmacy. We will text you when it ships.",
  order_processing: "Your pharmacy order is processing.",
  order_shipped: "Your medication is on the way! Track your FedEx package: https://www.fedex.com/fedextrack/?trknbr={{trackingNumber}} — Reply with any questions.",
  order_out_for_delivery: "Your medication is out for delivery today. Track your FedEx package: https://www.fedex.com/fedextrack/?trknbr={{trackingNumber}} — Reply with any questions.",
  order_delivered: "Your order has been delivered. How are you feeling? Reply any time — we're here to help.",
  identity_review_received: "Your payment and identity verification were received. Your provider will review everything before pharmacy dispatch.",
  identity_upload_reminder: "Your payment was received. We still need identity verification before pharmacy dispatch. Upload your ID and 10-second identity video here: {{uploadUrl}}",
  identity_reminder_day1: "Reminder: We still need your identity verification to send your prescription to the pharmacy. Please upload your ID and complete the 10-second video here: {{uploadUrl}}",
  identity_reminder_day2: "Final reminder: Your prescription is on hold pending identity verification. Complete your ID upload here: {{uploadUrl}} — contact support if you need help.",
  prior_med_upload_reminder: "Because you ordered a dose above the starter dose, we need proof you've taken GLP-1 before. Please upload a photo of your previous prescription here so our provider can approve your order: {{uploadUrl}}",
  prior_med_received: "Thanks! We received your previous prescription. Our provider will review and approve it before your order is sent to the pharmacy.",
  prior_med_approved: "Good news — your previous prescription was approved. Your order is now being prepared for pharmacy dispatch.",
  reorder_reminder: "Hey {{patientName}} — your 8-week supply is running low. Don't lose your momentum! Reorder here: {{reorderUrl}}",
  subscription_pay_link: "Hi {{patientName}}! Time for your next 8-week supply ({{amount}}). Pay & save your card so future refills are automatic — no gaps in treatment: {{payUrl}} (Reply STOP to opt out.)",
  subscription_charged: "Hi {{patientName}}! We've processed your next 8-week refill ({{amount}}) on your card ending {{cardLast4}}. It ships soon — we'll text you tracking. Reply STOP to cancel future automatic refills.",
  subscription_payment_failed: "Hi {{patientName}}, we couldn't process the card on file for your next refill. Pay here to avoid a gap in your treatment: {{payUrl}}",
  refill_reminder_day45: "{{patientName}}, your medication supply runs out in about 11 days. Reorder now so there's no gap in treatment: {{reorderUrl}}",
  refill_reminder_day50: "{{patientName}}, only 6 days of medication left. Don't break your progress — reorder in 60 seconds: {{reorderUrl}}",
  refill_reminder_day56: "Last call, {{patientName}}! Your supply ends in the next day or two. Reorder now: {{reorderUrl}}",
  delivery_checkin_day14: "Hey {{patientName}}, 2 weeks in — how are you feeling? Most patients notice appetite changes around this time. Any questions? Just reply.",
  delivery_checkin_day28: "{{patientName}}, you're 4 weeks in! How much have you lost so far? Reply with your number — we'd love to celebrate with you. Ready for your refill? {{reorderUrl}}",
  winback_day70: "Hey {{patientName}}, it looks like you haven't refilled yet. Stopping GLP-1 treatment can reverse progress quickly. Ready to get back on track? {{reorderUrl}}",
  referral_prompt: "{{patientName}}, loving your results? Share Mission WLW with a friend — they'll get a discount on their first order. Share: {{referralUrl}}",
  intake_abandonment_1h: "Hey {{firstName}}, you started your Mission WLW intake but didn't finish. Your spot is still open — complete it in 2 minutes: {{ctaUrl}}",
  intake_abandonment_24h: "{{firstName}}, your Mission WLW consultation is still waiting. GLP-1 therapy has helped thousands lose 20–40% of body weight. Ready to start? {{ctaUrl}}",
  retatrutide_launch: "{{patientName}}, exciting news! Mission WLW now offers Retatrutide — the newest triple-agonist GLP-1 showing up to 24% body weight loss in clinical trials. Be among the first: {{ctaUrl}}",
  dose_escalation_nudge: "Hey {{patientName}}, you've been making great progress! A higher dose could help you hit your goal faster next cycle. Ready to step it up? Reorder here: {{reorderUrl}}",
  weekly_checkin_week2: "Hey {{patientName}}, it's been 2 weeks on your new medication — how are you feeling? Most patients notice appetite changes around now. Any questions for your provider? Just reply.",
  weekly_checkin_week4: "{{patientName}}, you're almost halfway through your first cycle! Any questions for your provider? We're here to help — just reply to this text.",
  weekly_checkin_week6: "{{patientName}}, you're nearing the end of your first cycle — amazing work! Now's a great time to plan your refill so there's no gap in treatment. Reply or visit: {{ctaUrl}}",
  welcome_order_placed: "Thanks {{patientName}}! Your Mission WLW order is confirmed. Your provider is reviewing your chart now — we'll text you as soon as your prescription is sent to the pharmacy.",
  welcome_what_to_expect: "{{patientName}}, what to expect next: Your medication ships within 3–5 business days after provider approval. Stay hydrated and follow your dosing schedule. Questions? Just reply anytime!",
};

function getSpruceAuthToken() {
  if (process.env.SPRUCE_AUTH_TOKEN) return process.env.SPRUCE_AUTH_TOKEN;
  if (!process.env.SPRUCE_ACCESS_ID || !process.env.SPRUCE_API_KEY) return "";
  return Buffer.from(`${process.env.SPRUCE_ACCESS_ID}:${process.env.SPRUCE_API_KEY}`).toString("base64");
}

export function renderSpruceTemplate(templateKey: string, variables: Record<string, string> = {}) {
  const template = DEFAULT_TEMPLATES[templateKey];
  if (!template) throw new Error(`Unknown Spruce template: ${templateKey}`);

  return Object.entries(variables).reduce(
    (message, [key, value]) => message.split(`{{${key}}}`).join(value),
    template
  );
}

export function buildSpruceMessageRecord(
  patient: Patient,
  templateKey: string,
  variables: Record<string, string> = {}
): SpruceMessage {
  const phoneNumber = normalizeSprucePhoneNumber(patient.phone);
  return {
    id: generateId(),
    orderId: variables.orderId || "",
    patientId: patient.id,
    templateKey,
    phoneNumber: phoneNumber ?? patient.phone,
    messageText: renderSpruceTemplate(templateKey, variables),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

export function normalizeSprucePhoneNumber(phoneNumber: string): string | null {
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 10 && !digits.startsWith("1")) return `+1${digits.slice(0, 10)}`;
  return null;
}

async function resolvePhoneEndpoint(token: string) {
  if (process.env.SPRUCE_INTERNAL_ENDPOINT_ID) return process.env.SPRUCE_INTERNAL_ENDPOINT_ID;

  const response = await fetch(`${API_BASE_URL}/internalendpoints`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Spruce endpoints failed: ${response.status}`);

  const payload = await response.json();
  const endpoints = payload.internalEndpoints ?? payload.data ?? payload.items ?? [];
  const phoneEndpoint = endpoints.find((item: any) =>
    item.channelType === "phone" ||
    item.type === "phone" ||
    item.endpoint?.channelType === "phone" ||
    item.endpoint?.channel === "phone"
  );

  return phoneEndpoint?.id ?? phoneEndpoint?.endpoint?.id ?? "";
}

async function sendViaSpruceApi(phoneNumber: string, messageText: string, idempotencyKey: string) {
  if (process.env.USE_REAL_SPRUCE !== "true") return { skipped: true, reason: "USE_REAL_SPRUCE is not true" };

  const normalizedPhoneNumber = normalizeSprucePhoneNumber(phoneNumber);
  if (!normalizedPhoneNumber) throw new Error(`Invalid SMS phone number: ${phoneNumber}`);

  const token = getSpruceAuthToken();
  if (!token) throw new Error("Missing Spruce credentials");

  const internalEndpointId = await resolvePhoneEndpoint(token);
  if (!internalEndpointId) throw new Error("Spruce phone internal endpoint not found");

  const response = await fetch(`${API_BASE_URL}/internalendpoints/${internalEndpointId}/conversations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "s-idempotency-key": idempotencyKey.slice(0, 255),
    },
    body: JSON.stringify({
      destination: { smsOrEmailEndpoint: normalizedPhoneNumber },
      message: { body: [{ type: "text", value: messageText }] },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    // A duplicate idempotency key means Spruce already accepted this exact
    // message — it's a benign no-op, not a failure. (Common when the pharmacy
    // tracking cron re-posts the same status every 15 min.)
    if (response.status === 422 && text.includes("duplicate_request")) {
      return { duplicate: true };
    }
    throw new Error(`Spruce message failed: ${response.status} ${text}`);
  }

  return response.json().catch(() => ({}));
}

export async function sendTextToPhone(phoneNumber: string, messageText: string, idempotencyKey: string) {
  return sendViaSpruceApi(phoneNumber, messageText, idempotencyKey);
}

export async function sendMessage(
  patient: Patient,
  templateKey: string,
  variables: Record<string, string> = {}
): Promise<SpruceMessage> {
  const pending = buildSpruceMessageRecord(patient, templateKey, variables);
  await dbServer.spruceMessageDb.create(pending);

  try {
    const response = await sendViaSpruceApi(pending.phoneNumber, pending.messageText, `spruce_${pending.id}`);
    const sent = {
      ...pending,
      status: response?.skipped ? "pending" as const : "sent" as const,
      sentAt: response?.skipped ? undefined : new Date().toISOString(),
    };
    await dbServer.spruceMessageDb.update(pending.id, {
      status: sent.status,
      sentAt: sent.sentAt,
    });
    await dbServer.integrationLogDb.create({
      id: generateId(),
      timestamp: new Date().toISOString(),
      integrationName: "spruce",
      action: response?.skipped ? "SMS queued (Spruce disabled)" : "SMS sent",
      patientId: patient.id,
      orderId: variables.orderId || undefined,
      status: response?.skipped ? "pending" : "success",
      details: { messageId: pending.id, templateKey, phone: pending.phoneNumber },
    });
    return sent;
  } catch (error) {
    await dbServer.spruceMessageDb.update(pending.id, { status: "failed" });
    await dbServer.integrationLogDb.create({
      id: generateId(),
      timestamp: new Date().toISOString(),
      integrationName: "spruce",
      action: "SMS API send failed",
      patientId: patient.id,
      orderId: variables.orderId || undefined,
      status: "error",
      details: { messageId: pending.id, templateKey, phone: pending.phoneNumber },
      error: (error as Error).message,
    });
    throw error;
  }
}
