/**
 * PracticeQ Webhook Handler
 *
 * PracticeQ posts updates when provider reviews change status.
 *
 * Supported events:
 *   IntakeQ submission webhook payloads:
 *     { IntakeId, Type: "Intake Submitted", ClientId, ExternalClientId }
 *   Internal/provider payloads:
 *     intake.reviewed, intake.approved, intake.rejected
 *
 * Setup:
 *   Add webhook URL in PracticeQ Settings → Integrations → Webhooks:
 *   https://<your-domain>/api/webhooks/practiceq
 *   Use a secret query string because IntakeQ form webhooks only configure a URL:
 *   https://<your-domain>/api/webhooks/practiceq?key=<PRACTICEQ_WEBHOOK_KEY>
 */

import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import * as spruce from "@/services/spruce";
import * as lifefile from "@/services/lifefile";
import { generateId } from "@/lib/utils";
import { getIdentityGate } from "@/lib/identity";

export async function POST(req: NextRequest) {
  // Verify API key header
  const apiKey = req.headers.get("x-practiceq-key") ?? req.nextUrl.searchParams.get("key");
  if (!process.env.PRACTICEQ_WEBHOOK_KEY && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "PRACTICEQ_WEBHOOK_KEY is not configured" }, { status: 500 });
  }
  if (process.env.PRACTICEQ_WEBHOOK_KEY && apiKey !== process.env.PRACTICEQ_WEBHOOK_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const incomingEvent = payload.event ?? payload.Type;
  const incomingPacketId = payload.packetId ?? payload.IntakeId;
  const incomingOrderRef = payload.orderId ?? payload.ExternalClientId;
  const { status, notes, rejectionReason } = payload;

  // Find the order by PracticeQ packet reference
  const serverPacket =
    (incomingPacketId ? await dbServer.practiceqPacketDb.getById(incomingPacketId).catch(() => null) : null) ??
    (incomingOrderRef ? await dbServer.practiceqPacketDb.getByOrder(incomingOrderRef).catch(() => null) : null);
  const packets = db.practiceqDb.getAll();
  const packet = serverPacket ?? packets.find((p) => p.id === incomingPacketId || p.orderId === incomingOrderRef);
  if (!packet) {
    console.warn("PracticeQ webhook: packet not found", incomingPacketId);
    return NextResponse.json({ error: "Packet not found" }, { status: 404 });
  }

  const { orderId, patientId } = packet;

  const log = (action: string, logStatus: "success" | "error" = "success") => {
    const entry = {
      id: generateId(), timestamp: new Date().toISOString(),
      integrationName: "practiceq" as const, action, orderId, patientId,
      status: logStatus, details: { event: incomingEvent, packetId: incomingPacketId, notes },
    };
    db.integrationLogDb.create(entry);
    dbServer.integrationLogDb.create(entry).catch(() => {});
  };

  switch (incomingEvent) {
    case "Intake Submitted": {
      db.practiceqDb.update(packet.id, { status: "completed", lastSyncAt: new Date().toISOString() });
      await dbServer.practiceqPacketDb.update(packet.id, { status: "completed", lastSyncAt: new Date().toISOString() }).catch(() => null);
      db.orderDb.update(orderId, { practiceQStatus: "completed" });
      await dbServer.orderDb.update(orderId, { practiceQStatus: "completed" }).catch(() => {});
      log("PracticeQ: intake submitted by patient");
      break;
    }

    case "intake.reviewed": {
      db.practiceqDb.update(packet.id, { status: "completed", lastSyncAt: new Date().toISOString() });
      await dbServer.practiceqPacketDb.update(packet.id, { status: "completed", lastSyncAt: new Date().toISOString() }).catch(() => null);
      log("PracticeQ: provider viewed intake");
      break;
    }

    case "intake.approved": {
      db.practiceqDb.update(packet.id, { status: "completed" });
      await dbServer.practiceqPacketDb.update(packet.id, { status: "completed", lastSyncAt: new Date().toISOString() }).catch(() => null);
      const approvalUpdate = {
        status: "sent_to_pharmacy" as const,
        practiceQStatus: "completed" as const,
        identityStatus: "manual_approved" as const,
        identityReason: "Chart approved in PracticeQ/provider portal.",
        identityReviewedAt: new Date().toISOString(),
        identityReviewedBy: "provider-via-practiceq",
      };
      db.orderDb.update(orderId, approvalUpdate);
      await dbServer.orderDb.update(orderId, approvalUpdate).catch(() => {});

      const review = db.providerReviewDb.getByOrder(orderId);
      if (review) {
        db.providerReviewDb.update(review.id, {
          status: "approved", reviewedAt: new Date().toISOString(),
          reviewedBy: "provider-via-practiceq", notes,
        });
      }

      // Trigger pharmacy order if not already sent
      const order = db.orderDb.getById(orderId);
      if (order && getIdentityGate(order).canDispatch && db.pharmacyOrderDb.getByOrder(orderId) === null) {
        try { await lifefile.createPharmacyOrder(order); } catch {}
      }

      try { spruce.sendMessage(patientId, "approved", { orderId }); } catch {}
      log("PracticeQ: order approved by provider");
      break;
    }

    case "intake.rejected": {
      db.practiceqDb.update(packet.id, { status: "error" });
      await dbServer.practiceqPacketDb.update(packet.id, { status: "error", lastError: rejectionReason, lastSyncAt: new Date().toISOString() }).catch(() => null);
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
      console.warn("PracticeQ webhook: unknown event", incomingEvent);
  }

  return NextResponse.json({ received: true });
}
