import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import * as lifefile from "@/services/lifefile";
import * as spruce from "@/services/spruce";
import { generateId } from "@/lib/utils";
import { hasRequiredIdentityUploads, statusFromAiResult } from "@/lib/identity";
import { verifyIdentityUploads } from "@/services/identity-verification";
import { logPhiDisclosure, actorFromHeaders } from "@/lib/phi-audit";
import type { Upload } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, orderId, idImageData, selfieFrameData } = body;

    if ((!token && !orderId) || !idImageData || !selfieFrameData) {
      return NextResponse.json(
        { error: "token/orderId, idImageData, and selfieFrameData are required" },
        { status: 400 }
      );
    }

    const order =
      (token ? await dbServer.orderDb.getByIdentityUploadToken(token).catch(() => null) : null) ??
      (orderId ? await dbServer.orderDb.getById(orderId).catch(() => null) : null) ??
      (token ? db.orderDb.getByIdentityUploadToken(token) : null) ??
      (orderId ? db.orderDb.getById(orderId) : null);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const uploads: Upload[] = [
      {
        id: generateId(),
        orderId: order.id,
        type: "driver_license",
        filename: "identity-document.jpg",
        fileSize: idImageData.length,
        mimeType: "image/jpeg",
        base64Data: idImageData,
        uploadedAt: now,
        status: "uploaded",
      },
      {
        id: generateId(),
        orderId: order.id,
        type: "selfie_video",
        filename: "selfie-frame.jpg",
        fileSize: selfieFrameData.length,
        mimeType: "image/jpeg",
        base64Data: selfieFrameData,
        uploadedAt: now,
        status: "uploaded",
      },
    ];

    uploads.forEach((upload) => db.uploadDb.create(upload));
    await Promise.all(uploads.map((upload) => dbServer.uploadDb.create(upload).catch(() => upload)));

    const result = hasRequiredIdentityUploads(uploads)
      ? await verifyIdentityUploads(uploads)
      : {
          status: "needs_review" as const,
          confidence: 0,
          summary: "Identity verification is missing required uploads.",
          flags: ["missing_required_upload"],
          checkedAt: now,
        };

    const identityStatus = statusFromAiResult(result);
    const identityUpdate = {
      identityStatus,
      identityReason: result.summary,
      identityAiResult: result,
      identityReviewedAt: result.checkedAt ?? now,
      identityReviewedBy: identityStatus === "verified" ? "anthropic-ai" : undefined,
    };

    db.orderDb.update(order.id, identityUpdate);
    await dbServer.orderDb.update(order.id, identityUpdate).catch(() => {});

    const review = db.providerReviewDb.getByOrder(order.id);
    if (review) {
      db.providerReviewDb.update(review.id, {
        identityAiResult: result,
        identityReviewRequired: identityStatus !== "verified",
        notes: identityStatus === "verified" ? review.notes : `${review.notes ?? ""}\nIdentity review required: ${result.summary}`.trim(),
      });
      await dbServer.providerReviewDb.update(review.id, {
        identityAiResult: result,
        identityReviewRequired: identityStatus !== "verified",
      }).catch(() => {});
    }

    if (identityStatus === "verified" && order.paymentStatus === "completed" && order.pharmacyStatus !== "submitted") {
      try {
        await lifefile.createPharmacyOrder({ ...order, ...identityUpdate, status: "sent_to_pharmacy", pharmacyStatus: "submitted" });
        db.orderDb.update(order.id, { status: "sent_to_pharmacy", pharmacyStatus: "submitted" });
        await dbServer.orderDb.update(order.id, { status: "sent_to_pharmacy", pharmacyStatus: "submitted" }).catch(() => {});
        const patient =
          (await dbServer.patientDb.getById(order.patientId).catch(() => null)) ??
          db.patientDb.getById(order.patientId);
        if (patient) {
          await spruce.sendMessage(patient.id, "payment_received", { orderId: order.id }, patient);
        }
      } catch (error) {
        console.error("Identity upload dispatch error:", error);
      }
    }

    const auditCtx = actorFromHeaders(req.headers);
    logPhiDisclosure(order.patientId, order.id, "anthropic", auditCtx.actor ?? "system");

    return NextResponse.json({
      success: true,
      orderId: order.id,
      identityStatus,
      result,
    });
  } catch (error) {
    console.error("Identity upload error:", error);
    return NextResponse.json({ error: "Identity upload failed" }, { status: 500 });
  }
}
