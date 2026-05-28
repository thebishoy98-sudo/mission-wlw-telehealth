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
import * as spruceServer from "@/services/spruce.server";
import * as lifefile from "@/services/lifefile";
import { resolvePatient } from "@/lib/patient-resolver";
import { generateId } from "@/lib/utils";
import { getIdentityGate } from "@/lib/identity";
import { validateSharedSecret } from "@/lib/webhook-auth";

export async function POST(req: NextRequest) {
  // Verify API key header
  const apiKey = req.headers.get("x-practiceq-key") ?? req.nextUrl.searchParams.get("key");
  const auth = validateSharedSecret({
    configuredSecret: process.env.PRACTICEQ_WEBHOOK_KEY,
    providedSecret: apiKey,
    serviceName: "PracticeQ",
    envName: "PRACTICEQ_WEBHOOK_KEY",
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
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
  const { notes, rejectionReason } = payload;

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

  const orderForResolver = (await dbServer.orderDb.getById(orderId).catch(() => null)) ?? db.orderDb.getById(orderId);
  const getPatient = async () => resolvePatient({ patientId, practiceqClientId: orderForResolver?.practiceqClientId });

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
        await dbServer.providerReviewDb.update(review.id, {
          status: "approved", reviewedAt: new Date().toISOString(),
          reviewedBy: "provider-via-practiceq",
        }).catch(() => {});
      }

      // Trigger pharmacy order if not already sent
      const order =
        (await dbServer.orderDb.getById(orderId).catch(() => null)) ?? db.orderDb.getById(orderId);
      if (order && getIdentityGate(order).canDispatch) {
        const existingPharmacyOrder =
          (await dbServer.pharmacyOrderDb.getByOrder(orderId).catch(() => null)) ??
          db.pharmacyOrderDb.getByOrder(orderId);
        if (!existingPharmacyOrder) {
          try {
            const pharmacyOrder = await lifefile.createPharmacyOrder(order);
            await dbServer.pharmacyOrderDb.create(pharmacyOrder).catch(() => {});
          } catch {}
        }
      }

      const patient = await getPatient();
      if (patient) {
        spruceServer.sendMessage(patient, "approved", { orderId }).catch(() => {});
      }
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
        await dbServer.providerReviewDb.update(review.id, {
          status: "rejected", reviewedAt: new Date().toISOString(),
          reviewedBy: "provider-via-practiceq", rejectionReason,
        }).catch(() => {});
      }

      const patient = await getPatient();
      if (patient) {
        spruceServer.sendMessage(patient, "rejected", { orderId }).catch(() => {});
      }
      log("PracticeQ: order rejected by provider", "error");
      break;
    }

    default:
      console.warn("PracticeQ webhook: unknown event", incomingEvent);
  }

  return NextResponse.json({ received: true });
}
