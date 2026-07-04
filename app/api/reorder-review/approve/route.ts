/**
 * Admin approval / rejection of a back-to-back (too-soon) reorder.
 *
 * POST { orderId, action?: "approve" | "reject", reviewedBy?, notes? }
 *
 * On approval, if every dispatch gate now passes, the order advances and we
 * resume the PracticeQ/pharmacy chain (same machinery as identity approval).
 * On rejection, dispatch stays blocked (admin can refund/cancel separately).
 */

import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import {
  buildReorderReviewApprovalOrderUpdate,
  buildReorderReviewApprovalReviewUpdate,
} from "@/lib/reorder-review-approval";
import { resumePracticeQAfterIdentityApproval } from "@/services/practiceq-automation-orchestration";
import { getOrderDispatchGate } from "@/lib/order-gates";
import { requireAdmin } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { orderId, action = "approve", reviewedBy = "admin", notes } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: "orderId required" }, { status: 400 });
    }
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }

    const order =
      (await dbServer.orderDb.getById(orderId).catch(() => null)) ??
      db.orderDb.getById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const update = buildReorderReviewApprovalOrderUpdate(order, action, { reviewedBy, notes, now });

    db.orderDb.update(orderId, update);
    const updatedOrder = await dbServer.orderDb.update(orderId, update).catch(() => null);

    const review =
      (await dbServer.providerReviewDb.getByOrder(orderId).catch(() => null)) ??
      db.providerReviewDb.getByOrder(orderId);
    if (review) {
      const reviewUpdate = buildReorderReviewApprovalReviewUpdate(review, { reviewedBy, notes, now });
      db.providerReviewDb.update(review.id, reviewUpdate);
      await dbServer.providerReviewDb.update(review.id, reviewUpdate).catch(() => {});
    }

    const dispatchOrder = updatedOrder ?? { ...order, ...update };
    const patient =
      (await dbServer.patientDb.getById(order.patientId).catch(() => null)) ??
      db.patientDb.getById(order.patientId);

    let practiceQCompletion;
    if (action === "approve" && getOrderDispatchGate(dispatchOrder).canDispatch) {
      practiceQCompletion = await resumePracticeQAfterIdentityApproval({
        order: dispatchOrder,
        patient,
        source: "identity_approval",
      }).catch((error) => ({
        status: "pharmacy_error" as const,
        error: error instanceof Error ? error.message : String(error),
      }));
    }

    return NextResponse.json({
      success: true,
      orderId,
      reorderReviewStatus: update.reorderReviewStatus,
      orderStatus: dispatchOrder.status,
      practiceQCompletion,
    });
  } catch (error) {
    console.error("Reorder-review error:", error);
    return NextResponse.json({ error: "Reorder-review failed" }, { status: 500 });
  }
}
