/**
 * Spruce SMS Integration Service
 */

import * as Types from "@/types";
import * as db from "@/lib/db";
import { generateId } from "@/lib/utils";

const API_BASE_URL = "https://api.sprucehealth.com/v1";

const getSpruceAuthToken = () => {
  if (process.env.SPRUCE_AUTH_TOKEN) return process.env.SPRUCE_AUTH_TOKEN;
  if (!process.env.SPRUCE_ACCESS_ID || !process.env.SPRUCE_API_KEY) return "";
  return Buffer.from(`${process.env.SPRUCE_ACCESS_ID}:${process.env.SPRUCE_API_KEY}`).toString("base64");
};

const sendViaSpruceApi = async (phoneNumber: string, messageText: string, idempotencyKey: string) => {
  if (typeof window !== "undefined" || process.env.USE_REAL_SPRUCE !== "true") return null;
  const token = getSpruceAuthToken();
  if (!token) return null;

  let internalEndpointId = process.env.SPRUCE_INTERNAL_ENDPOINT_ID;
  if (!internalEndpointId) {
    const endpointsResponse = await fetch(`${API_BASE_URL}/internalendpoints`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!endpointsResponse.ok) {
      throw new Error(`Spruce endpoints failed: ${endpointsResponse.status}`);
    }
    const endpointsPayload = await endpointsResponse.json();
    const endpoints = endpointsPayload.internalEndpoints ?? endpointsPayload.data ?? endpointsPayload.items ?? [];
    const phoneEndpoint = endpoints.find((item: any) => item.channelType === "phone" || item.type === "phone" || item.endpoint?.channelType === "phone");
    internalEndpointId = phoneEndpoint?.id ?? phoneEndpoint?.endpoint?.id;
  }

  if (!internalEndpointId) {
    throw new Error("Spruce phone internal endpoint not found");
  }

  const response = await fetch(`${API_BASE_URL}/internalendpoints/${internalEndpointId}/conversations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "s-idempotency-key": idempotencyKey.slice(0, 255),
    },
    body: JSON.stringify({
      destination: {
        smsOrEmailEndpoint: {
          value: phoneNumber,
        },
      },
      message: {
        body: [{ type: "text", value: messageText }],
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Spruce message failed: ${response.status} ${text}`);
  }

  return response.json().catch(() => ({}));
};

export const sendMessage = (
  patientId: string,
  templateKey: string,
  variables: Record<string, string> = {},
  patientOverride?: Types.Patient | null
): Types.SpruceMessage => {
  const patient = patientOverride ?? db.patientDb.getById(patientId);
  const template = db.messageTemplateDb.getByKey(templateKey);

  if (!patient) {
    throw new Error("Patient not found");
  }

  // Fallback templates for server-side (template DB not seeded server-side)
  const DEFAULT_TEMPLATES: Record<string, string> = {
    payment_received: "Your payment was received. Your order is being processed.",
    order_shipped: "Your order has shipped! Tracking: {{trackingNumber}}",
    order_delivered: "Your order has been delivered.",
    provider_approved: "Your prescription has been approved.",
    needs_more_info: "We need more info to process your order. Please check your email.",
    identity_review_received: "Your payment and identity verification were received. Your provider will review everything before pharmacy dispatch.",
    identity_upload_reminder: "Your payment was received. We still need identity verification before pharmacy dispatch. Upload your ID and 10-second identity video here: {{uploadUrl}}",
  };
  const fallbackBody = DEFAULT_TEMPLATES[templateKey];
  if (!template && !fallbackBody) {
    throw new Error("Patient or template not found");
  }
  const messageBody = template?.body ?? fallbackBody!;

  // Interpolate variables into message
  let messageText = messageBody;
  Object.entries(variables).forEach(([key, value]) => {
    messageText = messageText.replace(`{{${key}}}`, value);
  });

  // Create message record
  const message: Types.SpruceMessage = {
    id: generateId(),
    orderId: variables.orderId || "",
    patientId: patientId,
    templateKey: templateKey,
    phoneNumber: patient.phone,
    messageText: messageText,
    status: "sent",
    sentAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const saved = db.spruceDb.create(message);
  sendViaSpruceApi(patient.phone, messageText, `spruce_${message.id}`).catch((error) => {
    db.integrationLogDb.create({
      id: generateId(),
      timestamp: new Date().toISOString(),
      integrationName: "spruce",
      action: "SMS API send failed",
      patientId,
      orderId: variables.orderId || undefined,
      status: "error",
      details: { templateKey, phone: patient.phone },
      error: (error as Error).message,
    });
  });

  // Log the action
  db.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "spruce",
    action: "SMS sent",
    patientId: patientId,
    orderId: variables.orderId || undefined,
    status: "success",
    details: {
      messageId: saved.id,
      templateKey: templateKey,
      phone: patient.phone,
      messageLength: messageText.length,
    },
  });

  return saved;
};

export const scheduleMessage = (
  patientId: string,
  templateKey: string,
  scheduledFor: string,
  variables: Record<string, string> = {}
): Types.SpruceMessage => {
  const patient = db.patientDb.getById(patientId);
  const template = db.messageTemplateDb.getByKey(templateKey);

  if (!patient) {
    throw new Error("Patient not found");
  }

  const DEFAULT_TEMPLATES: Record<string, string> = {
    payment_received: "Your payment was received. Your order is being processed.",
    order_shipped: "Your order has shipped! Tracking: {{trackingNumber}}",
    order_delivered: "Your order has been delivered.",
    provider_approved: "Your prescription has been approved.",
    needs_more_info: "We need more info to process your order. Please check your email.",
    identity_review_received: "Your payment and identity verification were received. Your provider will review everything before pharmacy dispatch.",
    identity_upload_reminder: "Your payment was received. We still need identity verification before pharmacy dispatch. Upload your ID and 10-second identity video here: {{uploadUrl}}",
  };
  const fallbackBody2 = DEFAULT_TEMPLATES[templateKey];
  if (!template && !fallbackBody2) {
    throw new Error("Patient or template not found");
  }
  const messageBody = template?.body ?? fallbackBody2!;

  // Interpolate variables
  let messageText = messageBody;
  Object.entries(variables).forEach(([key, value]) => {
    messageText = messageText.replace(`{{${key}}}`, value);
  });

  // Create scheduled message record
  const message: Types.SpruceMessage = {
    id: generateId(),
    orderId: variables.orderId || "",
    patientId: patientId,
    templateKey: templateKey,
    phoneNumber: patient.phone,
    messageText: messageText,
    status: "scheduled",
    scheduledFor: scheduledFor,
    createdAt: new Date().toISOString(),
  };

  const saved = db.spruceDb.create(message);

  // Log the action
  db.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "spruce",
    action: "SMS scheduled",
    patientId: patientId,
    orderId: variables.orderId || undefined,
    status: "pending",
    details: {
      messageId: saved.id,
      templateKey: templateKey,
      phone: patient.phone,
      scheduledFor: scheduledFor,
    },
  });

  return saved;
};

export const sendBulkMessages = (
  orderIds: string[],
  templateKey: string,
  variables?: Record<string, string>
): Types.SpruceMessage[] => {
  const messages: Types.SpruceMessage[] = [];

  orderIds.forEach((orderId) => {
    const order = db.orderDb.getById(orderId);
    if (order) {
      try {
        const message = sendMessage(order.patientId, templateKey, {
          ...variables,
          orderId: orderId,
        });
        messages.push(message);
      } catch (error) {
        console.error(`Failed to send message for order ${orderId}:`, error);
      }
    }
  });

  return messages;
};

export const getMessageStatus = (messageId: string): Types.SpruceMessage | null => {
  const messages = db.spruceDb.getAll();
  return messages.find((m) => m.id === messageId) || null;
};

export const getPatientMessages = (
  patientId: string
): Types.SpruceMessage[] => {
  return db.spruceDb.getByPatient(patientId);
};

export const scheduleReorderReminder = (
  orderId: string,
  daysFromNow: number = 30
): Types.SpruceMessage => {
  const order = db.orderDb.getById(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  const scheduledFor = new Date(
    Date.now() + daysFromNow * 24 * 60 * 60 * 1000
  ).toISOString();

  return scheduleMessage(
    order.patientId,
    "reorder_reminder",
    scheduledFor,
    { orderId }
  );
};

export const getMessageTemplates = (): Types.MessageTemplate[] => {
  return db.messageTemplateDb.getAll();
};

export const updateMessageTemplate = (
  templateId: string,
  data: Partial<Types.MessageTemplate>
): Types.MessageTemplate | null => {
  const template = db.messageTemplateDb.update(templateId, data);

  if (template) {
    // Log the update
    db.integrationLogDb.create({
      id: generateId(),
      timestamp: new Date().toISOString(),
      integrationName: "spruce",
      action: "Message template updated",
      status: "success",
      details: {
        templateId: templateId,
        templateKey: template.key,
        changes: Object.keys(data),
      },
    });
  }

  return template;
};

