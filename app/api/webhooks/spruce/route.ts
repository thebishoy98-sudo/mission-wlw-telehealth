/**
 * Spruce SMS Webhook Handler
 *
 * Spruce posts delivery status updates for outbound messages.
 *
 * Events:
 *   message.delivered  — SMS confirmed delivered
 *   message.failed     — SMS delivery failed
 *   message.reply      — Patient replied to an SMS
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
import crypto from "crypto";

function verifySpruceSignature(body: string, signature: string, secret: string): boolean {
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-spruce-signature") ?? "";
  const secret = process.env.SPRUCE_WEBHOOK_SECRET ?? "";

  if (secret && signature && !verifySpruceSignature(body, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body);
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
      break;
    }
  }

  return NextResponse.json({ received: true });
}
