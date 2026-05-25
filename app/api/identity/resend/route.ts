import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { buildIdentityUploadUrl, createIdentityUploadToken } from "@/lib/identity";
import * as spruceServer from "@/services/spruce.server";
import { requireAdmin } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: "orderId required" }, { status: 400 });
    }

    const order =
      (await dbServer.orderDb.getById(orderId).catch(() => null)) ??
      db.orderDb.getById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const patient =
      (await dbServer.patientDb.getById(order.patientId).catch(() => null)) ??
      db.patientDb.getById(order.patientId);
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const identityUploadToken = order.identityUploadToken ?? createIdentityUploadToken(order.id);
    if (!order.identityUploadToken) {
      const update = { identityUploadToken };
      db.orderDb.update(order.id, update);
      await dbServer.orderDb.update(order.id, update).catch(() => {});
    }

    const uploadUrl = buildIdentityUploadUrl(req.nextUrl.origin, identityUploadToken);
    const message = await spruceServer.sendMessage(patient, "identity_upload_reminder", {
      orderId: order.id,
      uploadUrl,
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      patientId: patient.id,
      phone: patient.phone,
      messageId: message.id,
      status: message.status,
    });
  } catch (error) {
    console.error("Identity resend error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Identity resend failed" },
      { status: 500 }
    );
  }
}
