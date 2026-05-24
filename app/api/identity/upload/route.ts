import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { generateId } from "@/lib/utils";
import { hasRequiredIdentityUploads, statusFromAiResult } from "@/lib/identity";
import { verifyIdentityUploads } from "@/services/identity-verification";
import { logPhiDisclosure, actorFromHeaders } from "@/lib/phi-audit";
import type { Upload } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, orderId, idImageData, selfieFrameData, identityVideoData } = body;

    if ((!token && !orderId) || !idImageData || !selfieFrameData) {
      return NextResponse.json(
        { error: "token/orderId, ID image, and identity video frame are required" },
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
        filename: "identity-video.webm",
        fileSize: (identityVideoData ?? selfieFrameData).length,
        mimeType: identityVideoData ? "video/webm" : "image/jpeg",
        base64Data: identityVideoData ?? selfieFrameData,
        uploadedAt: now,
        status: "uploaded",
      },
    ];
    const aiUploads = uploads.map((upload) =>
      upload.type === "selfie_video" ? { ...upload, mimeType: "image/jpeg", base64Data: selfieFrameData } : upload
    );

    uploads.forEach((upload) => db.uploadDb.create(upload));
    await Promise.all(uploads.map((upload) => dbServer.uploadDb.create(upload).catch(() => upload)));

    const result = hasRequiredIdentityUploads(aiUploads)
      ? await verifyIdentityUploads(aiUploads)
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
