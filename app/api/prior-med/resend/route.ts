/**
 * Admin: resend the prior-GLP-1 prescription upload request to the patient.
 *
 * POST { orderId } -> ensures an upload token exists and texts the patient the
 * upload link again.
 */

import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { buildPriorMedUploadUrl, createPriorMedUploadToken } from "@/lib/prior-med";
import { requireProviderOrAdmin } from "@/lib/server-auth";
import { getPublicBaseUrl } from "@/lib/public-url";
import * as spruceServer from "@/services/spruce.server";

export async function POST(req: NextRequest) {
  const denied = requireProviderOrAdmin(req);
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
    if (!patient.phone) {
      return NextResponse.json(
        { error: "Patient phone number is missing, so the upload text could not be sent." },
        { status: 400 }
      );
    }

    const token = order.priorMedUploadToken ?? createPriorMedUploadToken(order.id);
    if (!order.priorMedUploadToken) {
      const update = { priorMedUploadToken: token };
      db.orderDb.update(order.id, update);
      await dbServer.orderDb.update(order.id, update).catch(() => {});
    }

    const uploadUrl = buildPriorMedUploadUrl(getPublicBaseUrl(req), token);
    const message = await spruceServer.sendMessage(patient, "prior_med_upload_reminder", {
      orderId: order.id,
      uploadUrl,
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      patientId: patient.id,
      uploadUrl,
      messageId: message.id,
      status: message.status,
    });
  } catch (error) {
    console.error("Prior-med resend error:", error);
    return NextResponse.json({ error: (error as Error).message || "Prior-med resend failed" }, { status: 500 });
  }
}
