import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { getIdentityGate, hasRequiredIdentityUploads, statusFromAiResult } from "@/lib/identity";
import { verifyIdentityUploads } from "@/services/identity-verification";
import { logPhiDisclosure, actorFromHeaders } from "@/lib/phi-audit";
import { assertIdentityStorageReady, buildIdentityUploads } from "@/services/identity-storage";
import {
  buildIdentityUploadOrderUpdate,
  buildIdentityUploadReviewUpdate,
  shouldRetryPracticeQCompletionAfterIdentityApproval,
} from "@/lib/identity-approval";
import { completePracticeQSession } from "@/lib/practiceq-session-completion";
import { sendAdminNotification } from "@/services/admin-notifications";
import * as spruceServer from "@/services/spruce.server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const order =
    (await dbServer.orderDb.getByIdentityUploadToken(token).catch(() => null)) ??
    db.orderDb.getByIdentityUploadToken(token);

  if (!order) {
    return NextResponse.json({ error: "Verification link not found" }, { status: 404 });
  }

  const identityStatus = order.identityStatus ?? "missing";
  const gate = getIdentityGate({ identityStatus });
  const uploadNeeded = !gate.canDispatch && identityStatus !== "needs_review";

  return NextResponse.json({
    valid: true,
    orderId: order.id,
    identityStatus,
    uploadNeeded,
  });
}

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
    const patient =
      (await dbServer.patientDb.getById(order.patientId).catch(() => null)) ??
      db.patientDb.getById(order.patientId);
    const practiceqClientId =
      order.practiceqClientId ??
      (patient as { practiceqClientId?: string } | null)?.practiceqClientId ??
      null;

    const now = new Date().toISOString();
    try {
      assertIdentityStorageReady();
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 503 }
      );
    }
    const { uploads, aiUploads } = await buildIdentityUploads({
      orderId: order.id,
      practiceqClientId,
      idImageData,
      selfieFrameData,
      identityVideoData,
    });

    uploads.forEach((upload) => db.uploadDb.create(upload));
    await Promise.all(uploads.map((upload) => dbServer.uploadDb.create(upload).catch(() => upload)));

    const result = hasRequiredIdentityUploads(aiUploads)
      ? await verifyIdentityUploads(aiUploads, {
          patientName: patient ? `${patient.firstName} ${patient.lastName}` : undefined,
          dateOfBirth: patient?.dateOfBirth,
        })
      : {
          status: "needs_review" as const,
          confidence: 0,
          summary: "Identity verification is missing required uploads.",
          flags: ["missing_required_upload"],
          checkedAt: now,
        };

    const identityStatus = statusFromAiResult(result);
    const identityUpdate = buildIdentityUploadOrderUpdate(order, { identityStatus, result, now });

    db.orderDb.update(order.id, identityUpdate);
    const updatedOrder = await dbServer.orderDb.update(order.id, identityUpdate).catch(() => null);

    const review =
      (await dbServer.providerReviewDb.getByOrder(order.id).catch(() => null)) ??
      db.providerReviewDb.getByOrder(order.id);
    if (review) {
      const reviewUpdate = buildIdentityUploadReviewUpdate(review, { identityStatus, result, now });
      db.providerReviewDb.update(review.id, reviewUpdate);
      await dbServer.providerReviewDb.update(review.id, reviewUpdate).catch(() => {});
    }

    const auditCtx = actorFromHeaders(req.headers);
    logPhiDisclosure(order.patientId, order.id, "anthropic", auditCtx.actor ?? "system");

    const dispatchOrder = updatedOrder ?? { ...order, ...identityUpdate };
    let practiceQCompletion: Awaited<ReturnType<typeof completePracticeQSession>> | undefined;
    if (identityStatus === "verified" && shouldRetryPracticeQCompletionAfterIdentityApproval(dispatchOrder)) {
      const job = await dbServer.practiceqAutomationJobDb.getByOrder(order.id).catch(() => null);
      if (job && (job.status === "completed" || dispatchOrder.practiceQStatus === "completed" || job.intakeId)) {
        practiceQCompletion = await completePracticeQSession(job.id).catch((error) => ({
          status: "pharmacy_error" as const,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }

    if (patient) {
      await spruceServer.sendMessage(patient, "identity_review_received", { orderId: order.id }).catch(() => {});
      if (identityStatus !== "verified") {
        const patientName = [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim();
        await sendAdminNotification("identity_review_needed", {
          orderId: order.id,
          patientId: patient.id,
          patientName,
        }).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      identityStatus,
      result,
      practiceQCompletion,
    });
  } catch (error) {
    console.error("Identity upload error:", error);
    return NextResponse.json({ error: (error as Error).message || "Identity upload failed" }, { status: 500 });
  }
}
