import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import {
  buildManualIdentityApprovalOrderUpdate,
  buildManualIdentityApprovalReviewUpdate,
  shouldRetryPracticeQCompletionAfterIdentityApproval,
} from "@/lib/identity-approval";
import { completePracticeQSession } from "@/lib/practiceq-session-completion";
import { requireAdmin } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { orderId, reviewedBy = "manual-review", notes } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: "orderId required" }, { status: 400 });
    }

    const order =
      (await dbServer.orderDb.getById(orderId).catch(() => null)) ??
      db.orderDb.getById(orderId);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const update = buildManualIdentityApprovalOrderUpdate(order, { reviewedBy, notes, now });

    db.orderDb.update(orderId, update);
    const updatedOrder = await dbServer.orderDb.update(orderId, update).catch(() => null);

    const review =
      (await dbServer.providerReviewDb.getByOrder(orderId).catch(() => null)) ??
      db.providerReviewDb.getByOrder(orderId);
    if (review) {
      const reviewUpdate = buildManualIdentityApprovalReviewUpdate(review, { reviewedBy, notes, now });
      db.providerReviewDb.update(review.id, reviewUpdate);
      await dbServer.providerReviewDb.update(review.id, reviewUpdate).catch(() => {});
    }

    const dispatchOrder = updatedOrder ?? { ...order, ...update };
    let practiceQCompletion: Awaited<ReturnType<typeof completePracticeQSession>> | undefined;
    if (shouldRetryPracticeQCompletionAfterIdentityApproval(dispatchOrder)) {
      const job = await dbServer.practiceqAutomationJobDb.getByOrder(orderId).catch(() => null);
      if (job) {
        practiceQCompletion = await completePracticeQSession(job.id).catch((error) => ({
          status: "pharmacy_error" as const,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }

    return NextResponse.json({
      success: true,
      orderId,
      identityStatus: update.identityStatus,
      orderStatus: dispatchOrder.status,
      practiceQCompletion,
    });
  } catch (error) {
    console.error("Identity approval error:", error);
    return NextResponse.json({ error: "Identity approval failed" }, { status: 500 });
  }
}
