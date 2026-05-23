import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import * as lifefile from "@/services/lifefile";
import { getIdentityGate } from "@/lib/identity";
import { actorFromHeaders, logPhiDisclosure } from "@/lib/phi-audit";

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

    const pharmacyOrder = await lifefile.createPharmacyOrder(order, { patient: patientData ?? null, product: productData ?? null });
    await dbServer.pharmacyOrderDb.create(pharmacyOrder).catch(() => {});
    const update = { status: "sent_to_pharmacy" as const, pharmacyStatus: "submitted" as const };
    db.orderDb.update(orderId, update);
    await dbServer.orderDb.update(orderId, update).catch(() => {});

    const auditCtx = actorFromHeaders(req.headers);
    logPhiDisclosure(order.patientId, orderId, "lifefile", auditCtx.actor);

    return NextResponse.json({ success: true, orderId });
  } catch (error) {
    console.error("Order dispatch error:", error);
    return NextResponse.json({ error: "Order dispatch failed" }, { status: 500 });
  }
}
