import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import * as lifefile from "@/services/lifefile";
import * as spruceServer from "@/services/spruce.server";
import { getIdentityGate } from "@/lib/identity";
import { actorFromHeaders, logPhiDisclosure } from "@/lib/phi-audit";
import { generateId } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const { orderId, patientData, productData } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: "orderId required" }, { status: 400 });
    }

    const order =
      (await dbServer.orderDb.getById(orderId).catch(() => null)) ??
      db.orderDb.getById(orderId);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const gate = getIdentityGate(order);
    if (!gate.canDispatch) {
      return NextResponse.json(
        {
          error: "Identity verification required before pharmacy dispatch",
          identityStatus: order.identityStatus ?? "missing",
        },
        { status: 409 }
      );
    }

    const patient = patientData ?? await dbServer.patientDb.getById(order.patientId).catch(() => null);
    const product = productData ?? await dbServer.productDb.getById(order.productId).catch(() => null);
    const auditCtx = actorFromHeaders(req.headers);
    let pharmacyOrder;
    try {
      pharmacyOrder = await lifefile.createPharmacyOrder(order, { patient, product });
      await dbServer.pharmacyOrderDb.create(pharmacyOrder).catch(() => {});
      const update = { status: "sent_to_pharmacy" as const, pharmacyStatus: "submitted" as const };
      db.orderDb.update(orderId, update);
      await dbServer.orderDb.update(orderId, update).catch(() => {});
      if (patient) {
        await spruceServer.sendMessage(patient, "order_sent_to_pharmacy", { orderId }).catch(() => {});
      }
      logPhiDisclosure(order.patientId, orderId, "lifefile", auditCtx.actor);
    } catch (error) {
      const errorMessage = (error as Error).message;
      const update = { status: "approved" as const, pharmacyStatus: "error" as const };
      db.orderDb.update(orderId, update);
      await dbServer.orderDb.update(orderId, update).catch(() => {});
      await dbServer.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "lifefile",
        action: "Pharmacy order submission failed",
        orderId,
        patientId: order.patientId,
        status: "error",
        details: { source: "manual_dispatch" },
        error: errorMessage,
      }).catch(() => {});
      logPhiDisclosure(order.patientId, orderId, "lifefile", auditCtx.actor, "error", errorMessage);
      return NextResponse.json({ error: "Order dispatch failed", detail: errorMessage }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      orderId,
      pharmacyStatus: "submitted",
      lifeFileOrderId: pharmacyOrder.lifeFileOrderId,
    });
  } catch (error) {
    console.error("Order dispatch error:", error);
    return NextResponse.json({ error: "Order dispatch failed" }, { status: 500 });
  }
}
