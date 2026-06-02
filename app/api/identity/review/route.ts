import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { getIdentityReviewUpdate } from "@/lib/identity";
import {
  buildManualIdentityApprovalOrderUpdate,
  buildManualIdentityApprovalReviewUpdate,
  shouldRetryPracticeQCompletionAfterIdentityApproval,
} from "@/lib/identity-approval";
import { completePracticeQSession } from "@/lib/practiceq-session-completion";
import { requireAdmin } from "@/lib/server-auth";
import { createPracticeQAutomationJob } from "@/services/practiceq-automation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const orderId = req.nextUrl.searchParams.get("orderId");
    if (!orderId) {
      return NextResponse.json({ error: "orderId required" }, { status: 400 });
    }

    const order =
      (await dbServer.orderDb.getById(orderId).catch(() => null)) ??
      db.orderDb.getById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const [patient, uploads, review] = await Promise.all([
      dbServer.patientDb.getById(order.patientId).catch(() => null),
      dbServer.uploadDb.getByOrder(order.id).catch(() => []),
      dbServer.providerReviewDb.getByOrder(order.id).catch(() => null),
    ]);

    return NextResponse.json({
      order,
      patient: patient ?? db.patientDb.getById(order.patientId),
      uploads: uploads.length ? uploads : db.uploadDb.getByOrder(order.id),
      review: review ?? db.providerReviewDb.getByOrder(order.id),
    });
  } catch (error) {
    console.error("Identity review load error:", error);
    return NextResponse.json({ error: "Identity review load failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { orderId, action, reviewedBy = "admin", notes } = await req.json();
    if (!orderId || !["approve", "deny"].includes(action)) {
      return NextResponse.json({ error: "orderId and action approve/deny required" }, { status: 400 });
    }

    const order =
      (await dbServer.orderDb.getById(orderId).catch(() => null)) ??
      db.orderDb.getById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const update =
      action === "approve"
        ? buildManualIdentityApprovalOrderUpdate(order, { reviewedBy, notes, now })
        : getIdentityReviewUpdate({ action, reviewedBy, notes, now });
    db.orderDb.update(orderId, update);
    const updatedOrder = await dbServer.orderDb.update(orderId, update).catch(() => null);

    const review =
      (await dbServer.providerReviewDb.getByOrder(orderId).catch(() => null)) ??
      db.providerReviewDb.getByOrder(orderId);
    if (review) {
      const reviewUpdate =
        action === "approve"
          ? buildManualIdentityApprovalReviewUpdate(review, { reviewedBy, notes, now })
          : {
              status: "rejected" as const,
              reviewedAt: now,
              reviewedBy,
              rejectionReason: notes ?? review.rejectionReason,
              notes: notes ?? review.notes,
              identityReviewRequired: true,
            };
      db.providerReviewDb.update(review.id, reviewUpdate);
      await dbServer.providerReviewDb.update(review.id, reviewUpdate).catch(() => {});
    }

    await dbServer.integrationLogDb.create({
      id: `log_identity_review_${Date.now()}`,
      timestamp: now,
      integrationName: "system",
      action: `Identity ${action === "approve" ? "approved" : "denied"} by admin`,
      orderId,
      patientId: order.patientId,
      status: "success",
      details: { action, reviewedBy, notes },
    }).catch(() => {});

    const dispatchOrder = updatedOrder ?? { ...order, ...update };
    let practiceQCompletion: Awaited<ReturnType<typeof completePracticeQSession>> | undefined;
    if (action === "approve" && shouldRetryPracticeQCompletionAfterIdentityApproval(dispatchOrder)) {
      const job = await dbServer.practiceqAutomationJobDb.getByOrder(orderId).catch(() => null);
      if (job) {
        practiceQCompletion = await completePracticeQSession(job.id).catch((error) => ({
          status: "pharmacy_error" as const,
          error: error instanceof Error ? error.message : String(error),
        }));
      } else {
        // No PracticeQ job exists for this order (blocked by dedup at checkout).
        // Create one now so the automation worker fills the form.
        const patient = await dbServer.patientDb.getById(order.patientId).catch(() => null);
        if (patient) {
          const newJob = createPracticeQAutomationJob(dispatchOrder, patient);
          await dbServer.practiceqAutomationJobDb.create(newJob).catch(() => {});
        }
      }
    }

    return NextResponse.json({ success: true, orderId, update, practiceQCompletion });
  } catch (error) {
    console.error("Identity review action error:", error);
    return NextResponse.json({ error: "Identity review action failed" }, { status: 500 });
  }
}
