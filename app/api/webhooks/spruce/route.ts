import { after, NextRequest, NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { isOptOutMessage } from "@/lib/subscription";
import {
  parseSpruceWebhookEvent,
  verifySpruceWebhookSignature,
  type ParsedSpruceWebhook,
} from "@/lib/spruce-webhook";
import { generateId } from "@/lib/utils";
import { classifySpruceReply } from "@/services/spruce-ai-replies";
import { sendTextToPhone, sendMessage as sendSpruceMessage } from "@/services/spruce.server";

type InboundMessage = Extract<ParsedSpruceWebhook, { kind: "inbound_message" }>;

async function logInbound(
  event: InboundMessage,
  patientId?: string,
  orderId?: string
) {
  await dbServer.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "spruce",
    action: "Patient SMS reply received",
    patientId,
    orderId,
    status: "success",
    details: {
      messageId: event.messageId,
      conversationId: event.conversationId,
      phone: event.patientPhone,
      replyText: event.replyText.slice(0, 200),
    },
  });
}

async function processInboundMessage(event: InboundMessage) {
  try {
    const patient = event.patientPhone
      ? await dbServer.patientDb.getByPhone(event.patientPhone)
      : null;
    const orders = patient ? await dbServer.orderDb.getByPatient(patient.id) : [];
    const latestOrder = orders[0];

    await logInbound(event, patient?.id, latestOrder?.id);

    if (isOptOutMessage(event.replyText)) {
      if (patient) {
        const subscriptions = await dbServer.subscriptionDb.getByPatient(patient.id);
        const now = new Date().toISOString();
        let cancelledCount = 0;
        for (const subscription of subscriptions) {
          if (subscription.status === "active") {
            await dbServer.subscriptionDb.update(subscription.id, {
              status: "cancelled",
              cancelledAt: now,
              cancelReason: "patient SMS opt-out",
            });
            cancelledCount += 1;
          }
        }
        await dbServer.integrationLogDb.create({
          id: generateId(),
          timestamp: now,
          integrationName: "spruce",
          action: "Subscription cancelled via SMS opt-out",
          patientId: patient.id,
          orderId: latestOrder?.id,
          status: "success",
          details: { messageId: event.messageId, phone: event.patientPhone, cancelledCount },
        });
        // Confirm the cancellation to the patient (only if we actually cancelled one).
        if (cancelledCount > 0) {
          await sendSpruceMessage(patient, "subscription_cancelled", {}).catch(() => {});
        }
      }
      return;
    }

    const result = await classifySpruceReply({
      replyText: event.replyText,
      patientName: patient ? `${patient.firstName} ${patient.lastName}`.trim() : undefined,
      orderStatus: latestOrder?.status,
      pharmacyStatus: latestOrder?.pharmacyStatus,
    });

    if (result.shouldSend && result.replyText && event.patientPhone) {
      await sendTextToPhone(
        event.patientPhone,
        result.replyText,
        `spruce_ai_reply_${event.messageId}`
      );
      await dbServer.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "spruce",
        action:
          result.decision === "clinical_escalation"
            ? "Spruce clinical escalation acknowledgement sent"
            : "Spruce AI auto-reply sent",
        patientId: patient?.id,
        orderId: latestOrder?.id,
        status: "success",
        details: {
          messageId: event.messageId,
          decision: result.decision,
          confidence: result.confidence,
          reason: result.reason,
        },
      });
      return;
    }

    await dbServer.integrationLogDb.create({
      id: generateId(),
      timestamp: new Date().toISOString(),
      integrationName: "spruce",
      action: "Spruce inbound reply queued for staff review",
      patientId: patient?.id,
      orderId: latestOrder?.id,
      status: "pending",
      details: {
        messageId: event.messageId,
        decision: result.decision,
        confidence: result.confidence,
        reason: result.reason,
      },
    });
  } catch (error) {
    console.error("Spruce inbound processing failed", {
      messageId: event.messageId,
      error: (error as Error).message,
    });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-spruce-signature") ?? "";
  const secret = process.env.SPRUCE_WEBHOOK_SECRET ?? "";

  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "SPRUCE_WEBHOOK_SECRET is not configured" },
      { status: 500 }
    );
  }
  if (secret && !verifySpruceWebhookSignature(body, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseSpruceWebhookEvent(payload);
  if (parsed.kind !== "inbound_message") {
    return NextResponse.json({ received: true, ignored: parsed.reason });
  }

  after(async () => {
    await processInboundMessage(parsed);
  });

  return NextResponse.json({ received: true });
}
