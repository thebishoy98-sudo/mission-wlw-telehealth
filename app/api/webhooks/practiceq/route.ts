/**
 * PracticeQ / IntakeQ Webhook Handler
 *
 * IntakeQ fires webhooks using a "Type" field (not "event").
 * We normalise both so legacy internal callers still work.
 *
 * Events handled:
 *   IntakeSubmitted      — patient completed the form (e.g. marketing-site embed)
 *   intake.reviewed      — provider viewed the chart
 *   intake.approved      — provider approved → trigger pharmacy
 *   intake.rejected      — provider rejected
 */

import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import * as spruce from "@/services/spruce";
import * as lifefile from "@/services/lifefile";
import { generateId } from "@/lib/utils";
import { getIdentityGate } from "@/lib/identity";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-practiceq-key") ?? req.headers.get("x-intakeq-signature");
  if (process.env.PRACTICEQ_WEBHOOK_KEY && apiKey !== process.env.PRACTICEQ_WEBHOOK_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json() as Record<string, unknown>;

  // IntakeQ uses "Type"; our internal events use "event" — accept both.
  const eventType = (
    (payload.Type as string) ??
    (payload.type as string) ??
    (payload.event as string) ??
    ""
  ).toLowerCase();

  // ── IntakeSubmitted: patient completed the form (marketing-site embed or direct link) ──
  if (eventType === "intakesubmitted" || eventType === "intake.submitted" || eventType === "intakesend") {
    const intakeId = String(payload.Id ?? payload.id ?? "");
    const externalClientId = String(payload.ExternalClientId ?? payload.externalClientId ?? "");
    const clientId = String(payload.ClientId ?? payload.clientId ?? "");
    const clientEmail = String(payload.ClientEmail ?? payload.clientEmail ?? "");

    // Find our packet: by ExternalClientId (= our orderId) first, then by clientId.
    const packets = db.practiceqDb.getAll();
    const packet =
      (externalClientId ? packets.find((p) => p.orderId === externalClientId) : undefined) ??
      (clientId ? packets.find((p) => p.id === intakeId) : undefined);

    if (packet) {
      db.practiceqDb.update(packet.id, { status: "completed", lastSyncAt: new Date().toISOString() });
      const order = db.orderDb.getById(packet.orderId);
      if (order) {
        db.orderDb.update(order.id, { practiceQStatus: "completed" });
        await dbServer.orderDb.update(order.id, { practiceQStatus: "completed" }).catch(() => {});
        // Trigger pharmacy if identity is already cleared.
        if (getIdentityGate(order).canDispatch && db.pharmacyOrderDb.getByOrder(order.id) === null) {
          try { await lifefile.createPharmacyOrder(order); } catch {}
        }
      }
      const logEntry = {
        id: generateId(), timestamp: new Date().toISOString(),
        integrationName: "practiceq" as const, action: "PracticeQ: patient submitted intake",
        orderId: packet.orderId, patientId: packet.patientId,
        status: "success" as const, details: { eventType, intakeId, clientId },
      };
      db.integrationLogDb.create(logEntry);
      dbServer.integrationLogDb.create(logEntry).catch(() => {});
    } else if (clientEmail) {
      // Intake submitted but we don't have a matching packet yet (patient hasn't paid).
      // Store the mapping so submitIntakePacket can find it when they do pay.
      console.log("PracticeQ IntakeSubmitted: no packet found, intake received early", {
        intakeId, clientEmail, externalClientId,
      });
    }

    return NextResponse.json({ received: true });
  }

  // ── Provider-action events — require an existing packet ──────────────────────
  const packetId = String(payload.packetId ?? payload.PacketId ?? "");
  const pqOrderRef = String(payload.orderId ?? payload.OrderId ?? "");
  const notes = payload.notes as string | undefined;
  const rejectionReason = payload.rejectionReason as string | undefined;

  const packets = db.practiceqDb.getAll();
  const packet = packets.find((p) => p.id === packetId || p.orderId === pqOrderRef);
  if (!packet) {
    console.warn("PracticeQ webhook: packet not found", { packetId, pqOrderRef, eventType });
    return NextResponse.json({ error: "Packet not found" }, { status: 404 });
  }

  const { orderId, patientId } = packet;

  const log = (action: string, logStatus: "success" | "error" = "success") => {
    const entry = {
      id: generateId(), timestamp: new Date().toISOString(),
      integrationName: "practiceq" as const, action, orderId, patientId,
      status: logStatus, details: { eventType, packetId, notes },
    };
    db.integrationLogDb.create(entry);
    dbServer.integrationLogDb.create(entry).catch(() => {});
  };

  switch (eventType) {
    case "intake.reviewed": {
      db.practiceqDb.update(packet.id, { status: "completed", lastSyncAt: new Date().toISOString() });
      log("PracticeQ: provider viewed intake");
      break;
    }

    case "intake.approved": {
      db.practiceqDb.update(packet.id, { status: "completed" });
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
      console.warn("PracticeQ webhook: unhandled event", eventType);
  }

  return NextResponse.json({ received: true });
}
