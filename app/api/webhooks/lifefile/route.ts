/**
 * Life File Pharmacy Webhook Handler
 *
 * Life File posts status updates here as orders progress through the pharmacy.
 *
 * Events:
 *   order.received      — pharmacy received the prescription
 *   order.processing    — pharmacy is filling the prescription
 *   order.shipped       — medication shipped, tracking number included
 *   order.delivered     — delivery confirmed
 *   order.error         — pharmacy error, needs attention
 *
 * Setup:
 *   Configure webhook URL in Life File vendor portal:
 *   https://<your-domain>/api/webhooks/lifefile
 *   Add LIFEFILE_WEBHOOK_SECRET to env vars for signature verification.
 */

import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import * as spruce from "@/services/spruce";
import { generateId } from "@/lib/utils";
import crypto from "crypto";

function verifyLifeFileSignature(body: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-lifefile-signature") ?? "";
  const secret = process.env.LIFEFILE_WEBHOOK_SECRET ?? "";

  // Verify signature in production
  if (secret && signature && !verifyLifeFileSignature(body, signature, secret)) {
    console.warn("Life File webhook: invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event, orderId: lifeFileOrderId, trackingNumber, status, error: lifeFileError } = payload;

  // Find our internal pharmacy order by Life File's order ID
  const pharmacyOrder = await dbServer.pharmacyOrderDb.getByLifeFileId(lifeFileOrderId).catch(() => null)
    ?? db.pharmacyOrderDb.getAll().find((o) => o.lifeFileOrderId === lifeFileOrderId) ?? null;

  if (!pharmacyOrder) {
    console.warn("Life File webhook: unknown order", lifeFileOrderId);
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { orderId, patientId } = pharmacyOrder;

  const log = (action: string, logStatus: "success" | "error" = "success") => {
    const entry = {
      id: generateId(), timestamp: new Date().toISOString(),
      integrationName: "lifefile" as const, action, orderId, patientId,
      status: logStatus, details: { lifeFileOrderId, event, trackingNumber },
      error: logStatus === "error" ? lifeFileError : undefined,
    };
    db.integrationLogDb.create(entry);
    dbServer.integrationLogDb.create(entry).catch(() => {});
  };

  switch (event) {
    case "order.received": {
      db.pharmacyOrderDb.update(pharmacyOrder.id, { status: "received" });
      db.orderDb.update(orderId, { pharmacyStatus: "received" });
      await dbServer.pharmacyOrderDb.update(pharmacyOrder.id, { status: "received" }).catch(() => {});
      await dbServer.orderDb.update(orderId, { pharmacyStatus: "received" }).catch(() => {});
      log("Pharmacy received order");
      break;
    }

    case "order.processing": {
      db.pharmacyOrderDb.update(pharmacyOrder.id, { status: "processing" });
      db.orderDb.update(orderId, { pharmacyStatus: "processing" });
      await dbServer.pharmacyOrderDb.update(pharmacyOrder.id, { status: "processing" }).catch(() => {});
      await dbServer.orderDb.update(orderId, { pharmacyStatus: "processing" }).catch(() => {});
      log("Pharmacy processing order");
      // SMS: preparing your medication
      try { spruce.sendMessage(patientId, "order_processing", { orderId }); } catch {}
      break;
    }

    case "order.shipped": {
      const now = new Date().toISOString();
      db.pharmacyOrderDb.update(pharmacyOrder.id, { status: "shipped", trackingNumber, shippedAt: now });
      db.orderDb.update(orderId, { pharmacyStatus: "shipped", status: "shipped" });
      await dbServer.pharmacyOrderDb.update(pharmacyOrder.id, { status: "shipped", trackingNumber, shippedAt: now }).catch(() => {});
      await dbServer.orderDb.update(orderId, { pharmacyStatus: "shipped", status: "shipped" }).catch(() => {});
      log("Pharmacy shipped order");
      // SMS: your medication is on its way
      try {
        spruce.sendMessage(patientId, "order_shipped", { orderId, trackingNumber: trackingNumber ?? "" });
      } catch {}
      break;
    }

    case "order.delivered": {
      const now = new Date().toISOString();
      db.pharmacyOrderDb.update(pharmacyOrder.id, { status: "delivered", deliveredAt: now });
      db.orderDb.update(orderId, { pharmacyStatus: "delivered", status: "delivered" });
      await dbServer.pharmacyOrderDb.update(pharmacyOrder.id, { status: "delivered", deliveredAt: now }).catch(() => {});
      await dbServer.orderDb.update(orderId, { pharmacyStatus: "delivered", status: "delivered" }).catch(() => {});
      log("Pharmacy delivered order");
      // SMS: delivered + schedule reorder reminder in 5 weeks
      try { spruce.sendMessage(patientId, "order_delivered", { orderId }); } catch {}
      try {
        const reorderDate = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString();
        spruce.scheduleMessage(patientId, "reorder_reminder", reorderDate, { orderId });
      } catch {}
      break;
    }

    case "order.error": {
      db.pharmacyOrderDb.update(pharmacyOrder.id, { status: "error", lastError: lifeFileError });
      log("Pharmacy order error", "error");
      break;
    }

    default:
      console.warn("Life File webhook: unknown event", event);
  }

  return NextResponse.json({ received: true });
}
