/**
 * Spruce SMS Webhook Handler
 *
 * Spruce posts delivery status updates for outbound messages.
 *
 * Events:
 *   message.delivered  - SMS confirmed delivered
 *   message.failed     - SMS delivery failed
 *   message.reply      - Patient replied to an SMS
 *
 * Setup:
 *   Add webhook URL in Spruce Settings → Integrations:
 *   https://<your-domain>/api/webhooks/spruce
 *   Set SPRUCE_WEBHOOK_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { generateId } from "@/lib/utils";
import { isOptOutMessage } from "@/lib/subscription";
import { classifySpruceReply, type SpruceAiReplyResult } from "@/services/spruce-ai-replies";
import { sendTextToPhone } from "@/services/spruce.server";
import crypto from "crypto";

function verifySpruceSignature(body: string, signature: string, secret: string): boolean {
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

async function resolveReplyContext(message: any, patientPhone?: string) {
  const patient =
    (message?.patientId ? await dbServer.patientDb.getById(message.patientId).catch(() => null) : null) ??
    (patientPhone ? await dbServer.patientDb.getByPhone(patientPhone).catch(() => null) : null);
  const orders = patient ? await dbServer.orderDb.getByPatient(patient.id).catch(() => []) : [];
  const order = message?.orderId
    ? orders.find((item) => item.id === message.orderId) ?? null
    : orders[0] ?? null;

  return { patient, order };
}

async function logSpruceAiDecision(params: {
  action: string;
  patientId?: string;
  orderId?: string;
  phone?: string;
  replyText?: string;
  aiReply: SpruceAiReplyResult;
  error?: string;
}) {
  await dbServer.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "spruce",
    action: params.action,
    patientId: params.patientId,
    orderId: params.orderId,
    status: params.error ? "error" : "success",
    details: {
      phone: params.phone,
      inboundText: params.replyText?.slice(0, 200),
      decision: params.aiReply.decision,
      confidence: params.aiReply.confidence,
      reason: params.aiReply.reason,
      sentReply: params.aiReply.shouldSend,
    },
    error: params.error,
  }).catch(() => {});
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-spruce-signature") ?? "";
  const secret = process.env.SPRUCE_WEBHOOK_SECRET ?? "";

  if (!secret && process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "SPRUCE_WEBHOOK_SECRET is not configured" }, { status: 500 });
  }
  if (secret && !signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  if (secret && !verifySpruceSignature(body, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { event, messageId, patientPhone, replyText, errorCode } = payload;

  const messages = db.spruceDb.getAll();
  const message = messages.find((m) => m.id === messageId);

  switch (event) {
    case "message.delivered": {
      if (message) {
        db.spruceDb.update(message.id, { status: "sent", sentAt: new Date().toISOString() });
      }
      break;
    }

    case "message.failed": {
      if (message) {
        db.spruceDb.update(message.id, { status: "failed" });
        const entry = {
          id: generateId(), timestamp: new Date().toISOString(),
          integrationName: "spruce" as const, action: "SMS delivery failed",
          patientId: message.patientId, orderId: message.orderId,
          status: "error" as const, details: { messageId, errorCode },
        };
        db.integrationLogDb.create(entry);
        dbServer.integrationLogDb.create(entry).catch(() => {});
      }
      break;
    }

    case "message.reply": {
      // Log inbound patient reply for provider awareness
      if (message) {
        const entry = {
          id: generateId(), timestamp: new Date().toISOString(),
          integrationName: "spruce" as const, action: "Patient SMS reply received",
          patientId: message.patientId, orderId: message.orderId,
          status: "success" as const,
          details: { phone: patientPhone, replyText: replyText?.slice(0, 200) },
        };
        db.integrationLogDb.create(entry);
        dbServer.integrationLogDb.create(entry).catch(() => {});
      }

      // Opt-out: STOP/CANCEL cancels the patient's active subscriptions.
      if (replyText && isOptOutMessage(replyText)) {
        const patientId =
          message?.patientId ??
          (await dbServer.patientDb.getByPhone(patientPhone ?? "").catch(() => null))?.id;
        if (patientId) {
          const subscriptions = await dbServer.subscriptionDb.getByPatient(patientId).catch(() => []);
          const now = new Date().toISOString();
          for (const subscription of subscriptions) {
            if (subscription.status === "active") {
              await dbServer.subscriptionDb
                .update(subscription.id, { status: "cancelled", cancelledAt: now, cancelReason: "patient SMS opt-out" })
                .catch(() => {});
            }
          }
          await dbServer.integrationLogDb.create({
            id: generateId(), timestamp: now,
            integrationName: "spruce", action: "Subscription cancelled via SMS opt-out",
            patientId, status: "success",
            details: { phone: patientPhone, replyText: replyText.slice(0, 200) },
          }).catch(() => {});
        }
        break;
      }

      if (replyText) {
        const { patient, order } = await resolveReplyContext(message, patientPhone);
        const aiReply = await classifySpruceReply({
          replyText,
          patientName: [patient?.firstName, patient?.lastName].filter(Boolean).join(" ").trim(),
          orderStatus: order?.status,
          pharmacyStatus: order?.pharmacyStatus,
          lastOutboundMessage: message?.messageText,
        });
        const patientId = patient?.id ?? message?.patientId;
        const orderId = order?.id ?? message?.orderId;

        if (aiReply.shouldSend && patientPhone) {
          try {
            await sendTextToPhone(
              patientPhone,
              aiReply.replyText,
              `spruce_ai_reply_${messageId ?? patientPhone}_${Date.now()}`
            );
            await logSpruceAiDecision({
              action: aiReply.decision === "auto_reply" ? "Spruce AI auto-reply sent" : "Spruce AI reply escalated",
              patientId,
              orderId,
              phone: patientPhone,
              replyText,
              aiReply,
            });
          } catch (error) {
            await logSpruceAiDecision({
              action: "Spruce AI reply send failed",
              patientId,
              orderId,
              phone: patientPhone,
              replyText,
              aiReply,
              error: (error as Error).message,
            });
          }
        } else {
          await logSpruceAiDecision({
            action: aiReply.decision === "auto_reply" ? "Spruce AI auto-reply suppressed" : "Spruce AI reply escalated",
            patientId,
            orderId,
            phone: patientPhone,
            replyText,
            aiReply,
          });
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
