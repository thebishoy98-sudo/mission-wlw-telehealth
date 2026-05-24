/**
 * Mock Spruce SMS Integration Service
 *
 * In production, replace with actual Spruce API:
 * const API_BASE_URL = "https://api.spruce.health/v1"
 * Use Bearer token authentication
 */

import * as Types from "@/types";
import * as db from "@/lib/db";
import { generateId } from "@/lib/utils";

const API_BASE_URL = "https://mock.spruce.api/v1"; // Placeholder - replace in production
const API_KEY = "sk_live_spruce_mock_12345"; // Placeholder - use real API key in production

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
    identity_verification_required: "Payment received! To release your medication, please upload your government ID and a short selfie video at your patient portal. Your order is on hold until your identity is verified.",
    identity_reminder_day1: "Reminder: Your Mission WLW order is on hold. We still need your government ID and a short selfie video before we can ship your medication. Please complete your identity verification today.",
    identity_reminder_day2: "Final reminder: Your Mission WLW medication cannot ship until we verify your identity. Please upload your government ID and selfie video at your patient portal today to avoid further delays.",
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
      // In production:
      // apiEndpoint: `${API_BASE_URL}/message/send`,
      // spruceMessageId: "msg_12345"
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
      // In production:
      // apiEndpoint: `${API_BASE_URL}/message/schedule`,
      // spruceMessageId: "msg_12345"
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

/**
 * PRODUCTION NOTES:
 *
 * Replace with actual Spruce API implementation:
 *
 * export const sendMessage = async (patientId, templateKey, variables) => {
 *   const response = await fetch(`${API_BASE_URL}/message/send`, {
 *     method: "POST",
 *     headers: {
 *       "Authorization": `Bearer ${API_KEY}`,
 *       "Content-Type": "application/json",
 *     },
 *     body: JSON.stringify({
 *       patientId,
 *       templateKey,
 *       variables,
 *     }),
 *   });
 *
 *   if (!response.ok) {
 *     throw new Error(`Spruce API error: ${response.statusText}`);
 *   }
 *
 *   const result = await response.json();
 *   // Save with real Spruce message ID...
 *   return result;
 * };
 *
 * export const scheduleMessage = async (...) => {
 *   // Similar to sendMessage but use /message/schedule endpoint
 * };
 */
