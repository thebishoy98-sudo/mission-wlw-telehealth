/**
 * Prior-GLP-1 proof upload (patient-facing, token-guarded).
 *
 * GET  ?token=...  -> whether this order still needs a prescription upload.
 * POST {token, imageData} -> store the patient's previous-prescription photo,
 *      mark the order as awaiting admin approval, and notify the team.
 *
 * The upload does NOT dispatch the order — an admin must approve the proof
 * (POST /api/prior-med/approve) before pharmacy dispatch can proceed.
 */

import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { getPriorMedGate } from "@/lib/prior-med";
import { assertIdentityStorageReady, buildPriorPrescriptionUpload } from "@/services/identity-storage";
import { sendAdminNotification } from "@/services/admin-notifications";
import * as spruceServer from "@/services/spruce.server";
import { actorFromHeaders, logPhiDisclosure } from "@/lib/phi-audit";
import { analyzePriorPrescription, prescriptionAnalysisSummary } from "@/services/prior-prescription-analysis";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const order = await dbServer.orderDb.getByPriorMedUploadToken(token).catch(() => null);
  if (!order) {
    return NextResponse.json({ error: "Upload link not found" }, { status: 404 });
  }

  const priorMedStatus = order.priorMedStatus ?? "not_required";
  const gate = getPriorMedGate({ priorMedStatus });
  return NextResponse.json({
    valid: true,
    orderId: order.id,
    priorMedStatus,
    // Still needs an upload only while pending; once submitted it awaits review.
    uploadNeeded: priorMedStatus === "pending_upload" || priorMedStatus === "rejected",
    canDispatch: gate.canDispatch,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token ?? "").trim();
    const imageData = typeof body.imageData === "string" ? body.imageData : "";
    if (!token || !imageData) {
      return NextResponse.json({ error: "token and a prescription image are required" }, { status: 400 });
    }

    const order = await dbServer.orderDb.getByPriorMedUploadToken(token).catch(() => null);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (!["pending_upload", "rejected"].includes(order.priorMedStatus ?? "")) {
      return NextResponse.json({ error: "This prescription is already submitted or reviewed." }, { status: 409 });
    }

    try {
      assertIdentityStorageReady();
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 503 });
    }

    let upload;
    try {
      upload = await buildPriorPrescriptionUpload({ orderId: order.id, imageData });
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 422 });
    }

    db.uploadDb.create(upload);
    await dbServer.uploadDb.create(upload);

    const now = new Date().toISOString();
    const update = {
      priorMedStatus: "submitted" as const,
      priorMedReason: "Patient uploaded prior GLP-1 prescription — awaiting admin approval.",
    };
    db.orderDb.update(order.id, update);
    await dbServer.orderDb.update(order.id, update);

    const patient =
      (await dbServer.patientDb.getById(order.patientId).catch(() => null)) ??
      db.patientDb.getById(order.patientId);

    const patientName = patient ? [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() : "";
    if (process.env.ANTHROPIC_API_KEY) {
      const audit = actorFromHeaders(req.headers);
      logPhiDisclosure(order.patientId, order.id, "anthropic", audit.actor ?? "patient-upload");
    }
    const analysis = await analyzePriorPrescription(imageData, patientName);
    const summary = prescriptionAnalysisSummary(analysis);
    // Never replace a human decision made while the model was running, or
    // attach results from an older upload to a newer prescription.
    await dbServer.sql`
      UPDATE orders SET prior_med_reason = ${summary}, updated_at = NOW()
      WHERE id = ${order.id} AND prior_med_status = 'submitted'
        AND ${upload.id} = (SELECT id FROM uploads WHERE order_id = ${order.id}
          AND type = 'prior_prescription' ORDER BY uploaded_at DESC, id DESC LIMIT 1)
    `;
    await dbServer.integrationLogDb.create({
      id: `log_priormed_analysis_${upload.id}`, timestamp: new Date().toISOString(),
      integrationName: "system", action: "Prior prescription document analysis",
      orderId: order.id, patientId: order.patientId, status: "success",
      details: { service: "anthropic", uploadId: upload.id, ...analysis, requiresHumanReview: true },
    });
    await sendAdminNotification("order_received", {
      orderId: order.id,
      patientId: order.patientId,
      patientName: patientName || `Order ${order.id.slice(-8)}`,
    }).catch(() => {});

    await dbServer.integrationLogDb
      .create({
        id: `log_priormed_${Date.now()}`,
        timestamp: now,
        integrationName: "system",
        action: "Prior GLP-1 prescription uploaded by patient",
        orderId: order.id,
        patientId: order.patientId,
        status: "success",
        details: { uploadId: upload.id },
      })
      .catch(() => {});

    if (patient) {
      await spruceServer.sendMessage(patient, "prior_med_received", { orderId: order.id }).catch(() => {});
    }

    const auditCtx = actorFromHeaders(req.headers);
    logPhiDisclosure(order.patientId, order.id, "system", auditCtx.actor ?? "patient-upload");

    return NextResponse.json({ success: true, orderId: order.id, priorMedStatus: "submitted" });
  } catch (error) {
    console.error("Prior-med upload error:", error);
    return NextResponse.json({ error: (error as Error).message || "Upload failed" }, { status: 500 });
  }
}
