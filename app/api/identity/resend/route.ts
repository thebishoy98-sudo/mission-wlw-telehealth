import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { buildIdentityUploadUrl, createIdentityUploadToken } from "@/lib/identity";
import { loadProviderPatientChart } from "@/lib/provider-chart";
import { resolvePatient } from "@/lib/patient-resolver";
import * as spruceServer from "@/services/spruce.server";
import { getPracticeQMirrorForOrder } from "@/services/practiceq";
import { requireProviderOrAdmin } from "@/lib/server-auth";

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

    let patient = await resolvePatient(order).catch(() => null);
    if (!patient?.phone) {
      const chart = await loadProviderPatientChart(order.patientId, {
        patients: dbServer.patientDb,
        orders: dbServer.orderDb,
        products: dbServer.productDb,
        questions: dbServer.questionDb,
        answers: dbServer.answerDb,
        consents: dbServer.consentDb,
        uploads: dbServer.uploadDb,
        payments: dbServer.paymentDb,
        pharmacyOrders: dbServer.pharmacyOrderDb,
        reviews: dbServer.providerReviewDb,
        practiceqPackets: dbServer.practiceqPacketDb,
        practiceqAutomationJobs: dbServer.practiceqAutomationJobDb,
        practiceqMirror: { getForOrder: getPracticeQMirrorForOrder },
      }).catch(() => null);
      if (chart?.selectedOrder.id === order.id) patient = chart.patient;
    }
    patient = patient ?? db.patientDb.getById(order.patientId);
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    if (!patient.phone) {
      return NextResponse.json(
        { error: "Patient phone number is missing, so the verification text could not be sent." },
        { status: 400 }
      );
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
      uploadUrl,
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
