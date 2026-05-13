/**
 * PracticeQ Webhook Handler
 *
 * PracticeQ posts updates when provider reviews change status.
 *
 * Events:
 *   intake.reviewed     — provider has reviewed the intake
 *   intake.approved     — provider approved
 *   intake.rejected     — provider rejected with reason
 *
 * Setup:
 *   Add webhook URL in PracticeQ Settings → Integrations → Webhooks:
 *   https://<your-domain>/api/webhooks/practiceq
 *   Header: X-PracticeQ-Key: <your api key>
 */

import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import * as spruce from "@/services/spruce";
import * as lifefile from "@/services/lifefile";
import { generateId } from "@/lib/utils";

export async function POST(req: NextRequest) {
  // Verify API key header
  const apiKey = req.headers.get("x-practiceq-key");
  if (process.env.PRACTICEQ_WEBHOOK_KEY && apiKey !== process.env.PRACTICEQ_WEBHOOK_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json();
  const { event, packetId, orderId: pqOrderRef, status, notes, rejectionReason } = payload;

  // Find the order by PracticeQ packet reference
  const packets = db.practiceqDb.getAll();
  const packet = packets.find((p) => p.id === packetId || p.orderId === pqOrderRef);
  if (!packet) {
    console.warn("PracticeQ webhook: packet not found", packetId);
    return NextResponse.json({ error: "Packet not found" }, { status: 404 });
  }

  const { orderId, patientId } = packet;

  const log = (action: string, logStatus: "success" | "error" = "success") => {
    const entry = {
      id: generateId(), timestamp: new Date().toISOString(),
      integrationName: "practiceq" as const, action, orderId, patientId,
      status: logStatus, details: { event, packetId, notes },
    };
    db.integrationLogDb.create(entry);
    dbServer.integrationLogDb.create(entry).catch(() => {});
  };

  switch (event) {
    case "intake.reviewed": {
      db.practiceqDb.update(packet.id, { status: "completed", lastSyncAt: new Date().toISOString() });
      log("PracticeQ: provider viewed intake");
      break;
    }

    case "intake.approved": {
      db.practiceqDb.update(packet.id, { status: "completed" });
      db.orderDb.update(orderId, { status: "sent_to_pharmacy", practiceQStatus: "completed" });
      await dbServer.orderDb.update(orderId, { status: "sent_to_pharmacy", practiceQStatus: "completed" }).catch(() => {});

      const review = db.providerReviewDb.getByOrder(orderId);
      if (review) {
        db.providerReviewDb.update(review.id, {
          status: "approved", reviewedAt: new Date().toISOString(),
          reviewedBy: "provider-via-practiceq", notes,
        });
      }

      // Trigger pharmacy order if not already sent
      const order = db.orderDb.getById(orderId);
      if (order && db.pharmacyOrderDb.getByOrder(orderId) === null) {
        try { lifefile.createPharmacyOrder(order); } catch {}
      }

      try { spruce.sendMessage(patientId, "approved", { orderId }); } catch {}
      log("PracticeQ: order approved by provider");
      break;
    }

    case "intake.rejected": {
      db.practiceqDb.update(packet.id, { status: "error" });
      db.orderDb.update(orderId, { status: "rejected", practiceQStatus: "error", rejectionReason });
      await dbServer.orderDb.update(orderId, { status: "rejected", rejectionReason }).catch(() => {});

      const review = db.providerReviewDb.getByOrder(orderId);
      if (review) {
        db.providerReviewDb.update(review.id, {
          status: "rejected", reviewedAt: new Date().toISOString(),
          reviewedBy: "provider-via-practiceq", rejectionReason, notes,
        });
      }

      try { spruce.sendMessage(patientId, "rejected", { orderId }); } catch {}
      log("PracticeQ: order rejected by provider", "error");
      break;
    }

    default:
      console.warn("PracticeQ webhook: unknown event", event);
  }

  return NextResponse.json({ received: true });
}
