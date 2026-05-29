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
  order_shipped: "Your order has shipped. Tracking: {{trackingNumber}}",
  order_delivered: "Your order has been delivered.",
  identity_review_received: "Your payment and identity verification were received. Your provider will review everything before pharmacy dispatch.",
  identity_upload_reminder: "Your payment was received. We still need identity verification before pharmacy dispatch. Upload your ID and 10-second identity video here: {{uploadUrl}}",
  identity_reminder_day1: "Reminder: We still need your identity verification to send your prescription to the pharmacy. Please upload your ID and complete the 10-second video here: {{uploadUrl}}",
  identity_reminder_day2: "Final reminder: Your prescription is on hold pending identity verification. Complete your ID upload here: {{uploadUrl}} — contact support if you need help.",
  reorder_reminder: "It may be time to request your next refill. Log in to your patient portal to reorder.",
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
