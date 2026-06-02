import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { getIdentityReviewUpdate } from "@/lib/identity";
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

    const update = getIdentityReviewUpdate({ action, reviewedBy, notes });
    db.orderDb.update(orderId, update);
    await dbServer.orderDb.update(orderId, update).catch(() => {});

    const review =
      (await dbServer.providerReviewDb.getByOrder(orderId).catch(() => null)) ??
      db.providerReviewDb.getByOrder(orderId);
    if (review) {
      const reviewUpdate = {
        identityReviewRequired: action !== "approve",
        notes: notes ?? review.notes,
      };
      db.providerReviewDb.update(review.id, reviewUpdate);
      await dbServer.providerReviewDb.update(review.id, reviewUpdate).catch(() => {});
    }

    await dbServer.integrationLogDb.create({
      id: `log_identity_review_${Date.now()}`,
      timestamp: new Date().toISOString(),
      integrationName: "system",
      action: `Identity ${action === "approve" ? "approved" : "denied"} by admin`,
      orderId,
      patientId: order.patientId,
      status: "success",
      details: { action, reviewedBy, notes },
    }).catch(() => {});

    // When identity is approved, trigger PracticeQ if it was deferred waiting for identity
    if (action === "approve" && order.practiceQStatus === "waiting_identity") {
      try {
        const patient = await dbServer.patientDb.getById(order.patientId).catch(() => null);
        if (patient) {
          const existingJob = await dbServer.practiceqAutomationJobDb.getByOrder(orderId).catch(() => null);
          if (!existingJob) {
            const automationJob = createPracticeQAutomationJob(order, patient);
            await dbServer.practiceqAutomationJobDb.create(automationJob).catch(() => {});
            db.practiceqAutomationJobDb.create(automationJob);
          } else if (existingJob.status === "failed") {
            await dbServer.practiceqAutomationJobDb.update(existingJob.id, {
              status: "queued",
              attempts: 0,
              lastError: undefined,
              lockedAt: undefined,
            }).catch(() => {});
          }
          db.orderDb.update(orderId, { practiceQStatus: "pending" });
          await dbServer.orderDb.update(orderId, { practiceQStatus: "pending" }).catch(() => {});
        }
      } catch { /* PracticeQ trigger failure is non-fatal */ }
    }

    return NextResponse.json({ success: true, orderId, update });
  } catch (error) {
    console.error("Identity review action error:", error);
    return NextResponse.json({ error: "Identity review action failed" }, { status: 500 });
  }
}
