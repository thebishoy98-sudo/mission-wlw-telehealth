import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import * as spruce from "@/services/spruce";
import { generateId } from "@/lib/utils";
import { normalizeLifeFileWebhookPayload } from "@/lib/lifefile-webhook";

function verifyLifeFileSignature(body: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

export async function handleLifeFileWebhook(req: NextRequest, routeOrderId = "") {
  const body = await req.text();
  const signature = req.headers.get("x-lifefile-signature") ?? "";
  const secret = process.env.LIFEFILE_WEBHOOK_SECRET ?? "";

  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "LIFEFILE_WEBHOOK_SECRET is not configured" }, { status: 500 });
  }
  if (secret && !signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  if (secret && !verifyLifeFileSignature(body, signature, secret)) {
    console.warn("Life File webhook: invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const queryOrderId =
    req.nextUrl.searchParams.get("orderId") ??
    req.nextUrl.searchParams.get("lifeFileOrderId") ??
    routeOrderId;
  const { event, lifeFileOrderId, trackingNumber, lifeFileError, rawStatus } =
    normalizeLifeFileWebhookPayload(payload, queryOrderId);

  if (!lifeFileOrderId) {
    return NextResponse.json(
      { error: "Life File order ID is required in orderId, lifeFileOrderId, or ?orderId=" },
      { status: 400 }
    );
  }

  if (!event) {
    return NextResponse.json(
      { error: "Life File event/status is required", lifeFileOrderId },
      { status: 400 }
    );
  }

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
      status: logStatus, details: { lifeFileOrderId, event, trackingNumber, rawStatus },
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
